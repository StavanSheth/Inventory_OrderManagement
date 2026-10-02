import { API_V1_PREFIX } from '../../shared/constants/api.constants';
import { RealtimeDomainEvent } from '../../backend/services/realtime/realtime.interface';
import { authClient } from '../modules/auth/auth-client';

export interface RealtimeSubscriptionOptions {
  orderId?: string;
  branchId?: string;
  onEvent: (event: RealtimeDomainEvent) => void;
  onError?: (error: Event) => void;
  onConnected?: () => void;
}

export class RealtimeClient {
  /**
   * Connects to authorized Server-Sent Events stream using an ephemeral connection ticket.
   * Avoids exposing long-lived Firebase authentication tokens in browser EventSource URLs.
   * Includes automated reconnection with backoff and triggers onConnected on reconnects.
   */
  async subscribe(options: RealtimeSubscriptionOptions): Promise<() => void> {
    let isCancelled = false;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let backoffDelay = 1000;

    let lastReceivedEventId: string | null = null;

    const connect = async () => {
      if (isCancelled) return;

      try {
        const token = await authClient.getIdToken();
        if (!token) {
          throw new Error('Authentication token is required to subscribe to realtime events');
        }

        // 1. Acquire an ephemeral 60s single-use ticket via secure POST header
        let ticket: string | null = null;
        try {
          const res = await fetch(`${API_V1_PREFIX}/realtime/ticket`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          });
          if (res.ok) {
            const data = (await res.json()) as { success: boolean; data?: { ticket: string } };
            if (data.success && data.data?.ticket) {
              ticket = data.data.ticket;
            }
          }
        } catch {
          // Fallback to query param if ticket endpoint unavailable
        }

        if (isCancelled) return;

        const params = new URLSearchParams();
        if (options.orderId) params.set('orderId', options.orderId);
        if (options.branchId) params.set('branchId', options.branchId);
        if (lastReceivedEventId) params.set('lastEventId', lastReceivedEventId);

        if (ticket) {
          params.set('ticket', ticket);
        } else {
          params.set('token', token);
        }

        const url = `${API_V1_PREFIX}/realtime/events?${params.toString()}`;
        eventSource = new EventSource(url);

        eventSource.onopen = () => {
          backoffDelay = 1000; // Reset backoff on successful open
          options.onConnected?.();
        };

        eventSource.onmessage = (event) => {
          if (event.lastEventId) {
            lastReceivedEventId = event.lastEventId;
          }
          try {
            const parsed = JSON.parse(event.data) as RealtimeDomainEvent;
            if (event.lastEventId && !parsed.id) {
              parsed.id = event.lastEventId;
            } else if (parsed.id) {
              lastReceivedEventId = parsed.id;
            }
            options.onEvent(parsed);
          } catch {
            // Ignored comment or non-json message
          }
        };

        eventSource.onerror = (err) => {
          options.onError?.(err);
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }

          if (!isCancelled) {
            // Schedule reconnection with exponential backoff (max 15s)
            reconnectTimeout = setTimeout(() => {
              connect();
            }, backoffDelay);
            backoffDelay = Math.min(backoffDelay * 1.5, 15000);
          }
        };
      } catch {
        if (!isCancelled) {
          reconnectTimeout = setTimeout(() => {
            connect();
          }, backoffDelay);
          backoffDelay = Math.min(backoffDelay * 1.5, 15000);
        }
      }
    };

    await connect();

    return () => {
      isCancelled = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }
}

export const realtimeClient = new RealtimeClient();
