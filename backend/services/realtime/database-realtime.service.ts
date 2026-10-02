import {
  IRealtimeService,
  RealtimeDomainEvent,
  RealtimeSubscriptionFilter,
} from './realtime.interface';
import { D1DatabaseLike } from '../../../database/types';

interface SubscriptionRecord {
  id: string;
  filter: RealtimeSubscriptionFilter;
  listener: (event: RealtimeDomainEvent) => void;
}

export class DatabaseRealtimeService implements IRealtimeService {
  private subscriptions: Map<string, SubscriptionRecord> = new Map();

  constructor(private db?: D1DatabaseLike) {}

  setDatabase(db: D1DatabaseLike): void {
    this.db = db;
  }

  async publish(event: RealtimeDomainEvent): Promise<void> {
    const payload = event.payload as unknown as Record<string, unknown>;
    const branchId = typeof payload.branchId === 'string' ? payload.branchId : null;
    const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
    const customerUserId = typeof payload.customerUserId === 'string' ? payload.customerUserId : null;
    const now = typeof payload.timestamp === 'string' ? payload.timestamp : new Date().toISOString();

    // 1. Notify in-process SSE subscribers
    for (const sub of this.subscriptions.values()) {
      if (this.matchesFilter(event, sub.filter)) {
        try {
          sub.listener(event);
        } catch {
          // Prevent listener error from disrupting other subscribers
        }
      }
    }

    // 2. Persist event to D1 database for cross-instance and client reconnection catchup
    if (this.db) {
      try {
        const eventId = `evt-${crypto.randomUUID()}`;
        await this.db
          .prepare(`
            INSERT INTO realtime_events (
              id, event_type, payload_json, branch_id, order_id, customer_user_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            eventId,
            event.type,
            JSON.stringify(event.payload),
            branchId,
            orderId,
            customerUserId,
            now,
          )
          .run();
      } catch (err) {
        // Table may not exist in environments without migrations
        console.warn('[DatabaseRealtimeService] Could not persist event to D1:', err);
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

  async getRecentEvents(filter: RealtimeSubscriptionFilter, limit: number = 20): Promise<RealtimeDomainEvent[]> {
    if (!this.db) return [];

    try {
      let query = 'SELECT event_type, payload_json FROM realtime_events WHERE 1=1';
      const params: unknown[] = [];

      if (filter.orderId) {
        query += ' AND order_id = ?';
        params.push(filter.orderId);
      }
      if (filter.branchId) {
        query += ' AND branch_id = ?';
        params.push(filter.branchId);
      }
      if (filter.customerUserId) {
        query += ' AND customer_user_id = ?';
        params.push(filter.customerUserId);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const res = await this.db.prepare(query).bind(...params).all<{ event_type: string; payload_json: string }>();
      const rows = (res.results ?? []) as Array<{ event_type: string; payload_json: string }>;
      return rows.map((row) => ({
        type: row.event_type as RealtimeDomainEvent['type'],
        payload: JSON.parse(row.payload_json),
      }));
    } catch {
      return [];
    }
  }

  clear(): void {
    this.subscriptions.clear();
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
