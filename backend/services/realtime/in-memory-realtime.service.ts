import {
  IRealtimeService,
  RealtimeDomainEvent,
  RealtimeSubscriptionFilter,
} from './realtime.interface';

interface SubscriptionRecord {
  id: string;
  filter: RealtimeSubscriptionFilter;
  listener: (event: RealtimeDomainEvent) => void;
}

export class InMemoryRealtimeService implements IRealtimeService {
  private subscriptions: Map<string, SubscriptionRecord> = new Map();
  private eventHistory: RealtimeDomainEvent[] = [];
  private maxHistory: number = 100;

  async publish(event: RealtimeDomainEvent): Promise<void> {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    for (const sub of this.subscriptions.values()) {
      if (this.matchesFilter(event, sub.filter)) {
        try {
          sub.listener(event);
        } catch {
          // Prevent listener error from disrupting other subscribers
        }
      }
    }
  }

  subscribe(
    filter: RealtimeSubscriptionFilter,
    listener: (event: RealtimeDomainEvent) => void,
  ): () => void {
    const id = `sub-${crypto.randomUUID()}`;
    this.subscriptions.set(id, { id, filter, listener });
    return () => {
      this.subscriptions.delete(id);
    };
  }

  getRecentEventsForOrder(orderId: string): RealtimeDomainEvent[] {
    return this.eventHistory.filter((e) => {
      if ('orderId' in e.payload) {
        return e.payload.orderId === orderId;
      }
      return false;
    });
  }

  clear(): void {
    this.subscriptions.clear();
    this.eventHistory = [];
  }

  private matchesFilter(event: RealtimeDomainEvent, filter: RealtimeSubscriptionFilter): boolean {
    const payload = event.payload;

    if (filter.orderId && 'orderId' in payload && payload.orderId !== filter.orderId) {
      return false;
    }

    if (filter.branchId && 'branchId' in payload && payload.branchId !== filter.branchId) {
      return false;
    }

    if (filter.customerUserId && 'customerUserId' in payload && payload.customerUserId !== filter.customerUserId) {
      return false;
    }

    return true;
  }
}

export const realtimeService = new InMemoryRealtimeService();
