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
   * Connects to authorized Server-Sent Events stream.
   * Attaches fresh Firebase identity token and returns an unsubscribe function.
   */
  async subscribe(options: RealtimeSubscriptionOptions): Promise<() => void> {
    const token = await authClient.getIdToken();
    if (!token) {
      throw new Error('Authentication token is required to subscribe to realtime events');
    }

    const params = new URLSearchParams();
    if (options.orderId) params.set('orderId', options.orderId);
    if (options.branchId) params.set('branchId', options.branchId);
    params.set('token', token);

    const url = `${API_V1_PREFIX}/realtime/events?${params.toString()}`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      options.onConnected?.();
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeDomainEvent;
        options.onEvent(parsed);
      } catch {
        // Ignored comment or non-json message
      }
    };

    eventSource.onerror = (err) => {
      options.onError?.(err);
    };

    return () => {
      eventSource.close();
    };
  }
}

export const realtimeClient = new RealtimeClient();
