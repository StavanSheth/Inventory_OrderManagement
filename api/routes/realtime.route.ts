import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { OrderRepository } from '../../database/repositories/order.repository';
import { requireBranchAccess, requireApplicationSession } from '../../backend/policies/branch-access.policy';
import { requireCustomerData } from '../../backend/policies/branch-access.policy';
import { requireOperatorOrOwner } from '../../backend/policies/role.policy';
import { UserRole } from '../../shared/enums/roles.enum';
import { handleApiError } from '../middleware/error-handler';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { createRealtimeService } from '../../backend/services/realtime';
import { RealtimeDomainEvent } from '../../backend/services/realtime/realtime.interface';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../../backend/errors/app-error';
import { successResponse } from '../serializers/response';
import { AuthenticatedUserContext } from '../../shared/types/auth.types';

// In-memory store for short-lived (60s) single-use realtime connection tickets
interface StoredTicket {
  ticket: string;
  userContext: AuthenticatedUserContext;
  expiresAt: number;
}

const ticketStore = new Map<string, StoredTicket>();

function pruneExpiredTickets() {
  const now = Date.now();
  for (const [key, item] of ticketStore.entries()) {
    if (item.expiresAt <= now) {
      ticketStore.delete(key);
    }
  }
}

/**
 * POST /api/v1/realtime/ticket
 * Issues an ephemeral 60-second single-use ticket for establishing an SSE connection.
 * Avoids passing long-lived Firebase authentication tokens in browser EventSource URLs.
 */
export async function handleRealtimeTicketRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: false,
    });

    pruneExpiredTickets();

    const ticket = `rt_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date();
    const expiresAtIso = new Date(now.getTime() + 60_000).toISOString();

    try {
      await db
        .prepare(`
          INSERT INTO realtime_tickets (ticket, user_id, user_context_json, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
          ticket,
          userContext.userId,
          JSON.stringify(userContext),
          expiresAtIso,
          now.toISOString(),
        )
        .run();
    } catch {
      // In-memory fallback if database table not available
      ticketStore.set(ticket, {
        ticket,
        userContext,
        expiresAt: Date.now() + 60_000,
      });
    }

    return successResponse({ ticket }, 201, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

/**
 * GET /api/v1/realtime/events?orderId=...&branchId=...&ticket=...
 *
 * Authorized Server-Sent Events (SSE) stream for Cloudflare Workers / Next.js runtime.
 * Strictly verifies identity and ownership before establishing subscriptions.
 */
export async function handleRealtimeEventsRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const responseHeaders: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  };

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const orderRepo = new OrderRepository(db);
    const service = createRealtimeService(db);

    const url = new URL(request.url);
    const ticketParam = url.searchParams.get('ticket');
    let userContext: AuthenticatedUserContext | null = null;

    // 1. Resolve authentication either from single-use ticket or headers/token
    if (ticketParam) {
      const nowIso = new Date().toISOString();
      let consumedContextJson: string | null = null;

      try {
        const row = await db
          .prepare(`
            DELETE FROM realtime_tickets
            WHERE ticket = ? AND expires_at > ?
            RETURNING user_context_json
          `)
          .bind(ticketParam, nowIso)
          .first<{ user_context_json: string }>();

        if (row?.user_context_json) {
          consumedContextJson = row.user_context_json;
        }
      } catch {
        // Fallback to in-memory store
      }

      if (consumedContextJson) {
        userContext = JSON.parse(consumedContextJson) as AuthenticatedUserContext;
      } else {
        pruneExpiredTickets();
        const stored = ticketStore.get(ticketParam);
        if (stored && stored.expiresAt > Date.now()) {
          userContext = stored.userContext;
          // Invalidate single-use ticket immediately
          ticketStore.delete(ticketParam);
        } else {
          throw new UnauthorizedError('Realtime connection ticket is invalid or expired');
        }
      }
    }

    if (!userContext) {
      // Fallback: Authorization header or legacy query parameter
      const queryToken = url.searchParams.get('token');
      const authHeader = request.headers.get('Authorization') ?? (queryToken ? `Bearer ${queryToken}` : null);

      if (!authHeader) {
        throw new UnauthorizedError('Authentication token is missing');
      }

      const authRequest = new Request(request.url, {
        method: request.method,
        headers: {
          ...Object.fromEntries(request.headers.entries()),
          Authorization: authHeader,
        },
      });

      userContext = await authMiddleware.authenticateRequest(authRequest, {
        requireSession: false,
      });
    }

    const orderId = url.searchParams.get('orderId');
    const branchId = url.searchParams.get('branchId');

    // 2. Authorize subscription filter
    let subFilter: { orderId?: string; branchId?: string; customerUserId?: string } = {};

    if (orderId) {
      const order = await orderRepo.findById(orderId);
      if (!order) {
        throw new NotFoundError(`Order ${orderId} not found`);
      }

      if (userContext.role === UserRole.CUSTOMER) {
        // Customer can only subscribe to their own orders
        requireCustomerData(userContext, order.customer_user_id);
      } else {
        // Operator / Owner requires valid application session
        requireApplicationSession(userContext.session, userContext, order.branch_id);
        if (userContext.role === UserRole.BRANCH_OPERATOR) {
          requireBranchAccess(userContext, order.branch_id);
        }
      }

      subFilter = { orderId };
    } else if (branchId) {
      // Only Operator or Owner with valid session can subscribe to entire branch events
      if (userContext.role === UserRole.CUSTOMER) {
        throw new ForbiddenError('Customers cannot subscribe to branch-wide event streams');
      }

      requireOperatorOrOwner(userContext);
      requireApplicationSession(userContext.session, userContext, branchId);
      requireBranchAccess(userContext, branchId);

      subFilter = { branchId };
    } else {
      // Default to customer-scoped stream
      if (userContext.role === UserRole.CUSTOMER) {
        subFilter = { customerUserId: userContext.userId };
      } else {
        throw new ForbiddenError('Filter parameter (orderId or branchId) is required');
      }
    }

    // 3. Setup SSE ReadableStream with stable event ID, replay, and keepalive heartbeat
    let unsubscribe: (() => void) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const encoder = new TextEncoder();
    const lastEventId = request.headers.get('Last-Event-ID') || url.searchParams.get('lastEventId');

    const formatSse = (event: RealtimeDomainEvent): string => {
      let msg = '';
      if (event.id) {
        msg += `id: ${event.id}\n`;
      }
      msg += `data: ${JSON.stringify(event)}\n\n`;
      return msg;
    };

    const stream = new ReadableStream({
      async start(controller) {
        let initialFrame = ': connected\n\n';

        // Deliver catch-up events on connect/reconnect
        try {
          if (lastEventId && 'getEventsAfter' in service && typeof (service as { getEventsAfter: unknown }).getEventsAfter === 'function') {
            const missedEvents = await (service as {
              getEventsAfter: (afterId: string, f: typeof subFilter, limit: number) => Promise<RealtimeDomainEvent[]>;
            }).getEventsAfter(lastEventId, subFilter, 50);

            for (const ev of missedEvents) {
              initialFrame += formatSse(ev);
            }
          } else if ('getRecentEvents' in service && typeof (service as { getRecentEvents: unknown }).getRecentEvents === 'function') {
            const recentEvents = await (service as {
              getRecentEvents: (f: typeof subFilter, limit: number) => Promise<RealtimeDomainEvent[]>;
            }).getRecentEvents(subFilter, 5);

            for (const ev of recentEvents.reverse()) {
              initialFrame += formatSse(ev);
            }
          }
        } catch {
          // Catch-up error shouldn't terminate active stream
        }

        controller.enqueue(encoder.encode(initialFrame));

        // Subscribe to realtime bus
        unsubscribe = service.subscribe(subFilter, (event: RealtimeDomainEvent) => {
          try {
            controller.enqueue(encoder.encode(formatSse(event)));
          } catch {
            // Stream closed or error
          }
        });

        // Periodic heartbeat/keepalive comment (every 25s) to prevent idle connection termination
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }
        }, 25_000);

        if (typeof heartbeatTimer.unref === 'function') {
          heartbeatTimer.unref();
        }
      },
      cancel() {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
