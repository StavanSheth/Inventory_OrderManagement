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
import { realtimeService } from '../../backend/services/realtime';
import { RealtimeDomainEvent } from '../../backend/services/realtime/realtime.interface';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../../backend/errors/app-error';

/**
 * GET /api/v1/realtime/events?orderId=...&branchId=...
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

    // Support token in query string for native browser EventSource compatibility
    const url = new URL(request.url);
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

    const orderId = url.searchParams.get('orderId');
    const branchId = url.searchParams.get('branchId');

    // 1. Authenticate user identity
    const userContext = await authMiddleware.authenticateRequest(authRequest, {
      requireSession: false,
    });

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
      start(controller) {
        // Send initial connected comment
        controller.enqueue(encoder.encode(': connected\n\n'));

        // Subscribe to realtime bus
        unsubscribe = realtimeService.subscribe(subFilter, (event: RealtimeDomainEvent) => {
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
