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
  private seenEventIds: Set<string> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPolledIso: string = new Date(Date.now() - 5000).toISOString();
  private pollIntervalMs: number = 300;

  constructor(private db?: D1DatabaseLike) {}

  setDatabase(db: D1DatabaseLike): void {
    this.db = db;
  }

  setPollInterval(ms: number): void {
    this.pollIntervalMs = ms;
    if (this.pollTimer !== null) {
      this.stopPolling();
      this.startPolling();
    }
  }

  async publish(event: RealtimeDomainEvent): Promise<void> {
    const payload = event.payload as unknown as Record<string, unknown>;
    const branchId = typeof payload.branchId === 'string' ? payload.branchId : null;
    const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
    const customerUserId = typeof payload.customerUserId === 'string' ? payload.customerUserId : null;
    const now = typeof payload.timestamp === 'string' ? payload.timestamp : new Date().toISOString();
    const eventId = `evt-${crypto.randomUUID()}`;

    // Mark event ID as seen locally so this instance does not re-dispatch on poll
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > 2000) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest) this.seenEventIds.delete(oldest);
    }

    // 1. Notify local in-process subscribers immediately for instant response
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

    if (this.db && this.pollTimer === null) {
      this.startPolling();
    }

    return () => {
      this.subscriptions.delete(id);
      if (this.subscriptions.size === 0) {
        this.stopPolling();
      }
    };
  }

  /**
   * Polls D1 for events inserted by other requests or Worker instances.
   * Dispatches any unseen events matching active subscriptions.
   */
  async pollOnce(): Promise<number> {
    if (!this.db || this.subscriptions.size === 0) return 0;

    try {
      const res = await this.db
        .prepare(`
          SELECT id, event_type, payload_json, branch_id, order_id, customer_user_id, created_at
          FROM realtime_events
          WHERE created_at >= ?
          ORDER BY created_at ASC, id ASC
          LIMIT 100
        `)
        .bind(this.lastPolledIso)
        .all<{
          id: string;
          event_type: string;
          payload_json: string;
          branch_id: string | null;
          order_id: string | null;
          customer_user_id: string | null;
          created_at: string;
        }>();

      const rows = res.results ?? [];
      let dispatched = 0;

      for (const row of rows) {
        if (this.seenEventIds.has(row.id)) {
          continue;
        }
        this.seenEventIds.add(row.id);
        if (this.seenEventIds.size > 2000) {
          const oldest = this.seenEventIds.values().next().value;
          if (oldest) this.seenEventIds.delete(oldest);
        }

        const event: RealtimeDomainEvent = {
          type: row.event_type as RealtimeDomainEvent['type'],
          payload: JSON.parse(row.payload_json),
        };

        for (const sub of this.subscriptions.values()) {
          if (this.matchesFilter(event, sub.filter)) {
            try {
              sub.listener(event);
              dispatched++;
            } catch {
              // Subscriber callback error ignored
            }
          }
        }

        if (row.created_at > this.lastPolledIso) {
          this.lastPolledIso = row.created_at;
        }
      }

      return dispatched;
    } catch {
      return 0;
    }
  }

  startPolling(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => {
      this.pollOnce().catch(() => {});
    }, this.pollIntervalMs);

    if (typeof this.pollTimer.unref === 'function') {
      this.pollTimer.unref();
    }
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async getRecentEvents(filter: RealtimeSubscriptionFilter, limit: number = 20): Promise<RealtimeDomainEvent[]> {
    if (!this.db) return [];

    try {
      let query = 'SELECT id, event_type, payload_json FROM realtime_events WHERE 1=1';
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

      const res = await this.db.prepare(query).bind(...params).all<{ id: string; event_type: string; payload_json: string }>();
      const rows = (res.results ?? []) as Array<{ id: string; event_type: string; payload_json: string }>;

      // Mark fetched event IDs as seen so polling does not re-dispatch them
      for (const row of rows) {
        this.seenEventIds.add(row.id);
      }

      return rows.map((row) => ({
        type: row.event_type as RealtimeDomainEvent['type'],
        payload: JSON.parse(row.payload_json),
      }));
    } catch {
      return [];
    }
  }

  clear(): void {
    this.stopPolling();
    this.subscriptions.clear();
    this.seenEventIds.clear();
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
