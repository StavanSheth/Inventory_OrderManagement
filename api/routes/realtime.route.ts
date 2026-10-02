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
    const { authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: false,
    });

    pruneExpiredTickets();

    const ticket = `rt_${crypto.randomUUID().replace(/-/g, '')}`;
    ticketStore.set(ticket, {
      ticket,
      userContext,
      expiresAt: Date.now() + 60_000, // 60 seconds TTL
    });

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

    // 3. Setup SSE ReadableStream
    let unsubscribe: (() => void) | null = null;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial connected comment
        controller.enqueue(encoder.encode(': connected\n\n'));

        // Deliver recent events for catch-up on connect/reconnect
        try {
          if ('getRecentEvents' in service && typeof (service as { getRecentEvents: unknown }).getRecentEvents === 'function') {
            const recentEvents = await (service as { getRecentEvents: (f: typeof subFilter, limit: number) => Promise<RealtimeDomainEvent[]> }).getRecentEvents(subFilter, 5);
            for (const ev of recentEvents.reverse()) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
            }
          }
        } catch {
          // Catch-up error shouldn't terminate active stream
        }

        // Subscribe to realtime bus
        unsubscribe = service.subscribe(subFilter, (event: RealtimeDomainEvent) => {
          try {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch {
            // Stream closed or error
          }
        });
      },
      cancel() {
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
