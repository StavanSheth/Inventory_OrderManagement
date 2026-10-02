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

function matchesFilter(event: RealtimeDomainEvent, filter: RealtimeSubscriptionFilter): boolean {
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

/**
 * Centralized Realtime Hub shared across all requests within this Worker isolate or Node runtime.
 * Eliminates per-client D1 polling loops.
 * Dispatches published events immediately to all local in-process subscribers,
 * and maintains at most ONE shared polling loop for cross-worker event delivery when subscribers exist.
 */
class CentralRealtimeHub {
  private subscriptions: Map<string, SubscriptionRecord> = new Map();
  private seenEventIds: Set<string> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPolledIso: string = new Date(Date.now() - 5000).toISOString();
  private pollIntervalMs: number = 300;
  private db?: D1DatabaseLike;

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

  broadcast(event: RealtimeDomainEvent, originEventId?: string): void {
    if (originEventId) {
      this.seenEventIds.add(originEventId);
      if (this.seenEventIds.size > 2000) {
        const oldest = this.seenEventIds.values().next().value;
        if (oldest) this.seenEventIds.delete(oldest);
      }
    }

    for (const sub of this.subscriptions.values()) {
      if (matchesFilter(event, sub.filter)) {
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
    db?: D1DatabaseLike,
  ): () => void {
    if (db && !this.db) {
      this.db = db;
    }

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
          id: row.id,
          type: row.event_type as RealtimeDomainEvent['type'],
          payload: JSON.parse(row.payload_json),
        };

        for (const sub of this.subscriptions.values()) {
          if (matchesFilter(event, sub.filter)) {
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

  clear(): void {
    this.stopPolling();
    this.subscriptions.clear();
    this.seenEventIds.clear();
    this.lastPolledIso = new Date(Date.now() - 5000).toISOString();
  }

  getSubscriberCount(): number {
    return this.subscriptions.size;
  }
}

export const centralRealtimeHub = new CentralRealtimeHub();

export class DatabaseRealtimeService implements IRealtimeService {
  constructor(private db?: D1DatabaseLike) {
    if (db) {
      centralRealtimeHub.setDatabase(db);
    }
  }

  setDatabase(db: D1DatabaseLike): void {
    this.db = db;
    centralRealtimeHub.setDatabase(db);
  }

  setPollInterval(ms: number): void {
    centralRealtimeHub.setPollInterval(ms);
  }

  async publish(event: RealtimeDomainEvent): Promise<void> {
    const payload = event.payload as unknown as Record<string, unknown>;
    const branchId = typeof payload.branchId === 'string' ? payload.branchId : null;
    const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
    const customerUserId = typeof payload.customerUserId === 'string' ? payload.customerUserId : null;
    const now = typeof payload.timestamp === 'string' ? payload.timestamp : new Date().toISOString();
    const eventId = event.id ?? `evt-${crypto.randomUUID()}`;
    const eventWithId: RealtimeDomainEvent = { ...event, id: eventId };

    // 1. Broadcast immediately to all active in-process subscribers in the centralized hub
    centralRealtimeHub.broadcast(eventWithId, eventId);

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
    return centralRealtimeHub.subscribe(filter, listener, this.db);
  }

  async pollOnce(): Promise<number> {
    return centralRealtimeHub.pollOnce();
  }

  startPolling(): void {
    centralRealtimeHub.startPolling();
  }

  stopPolling(): void {
    centralRealtimeHub.stopPolling();
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

      return rows.map((row) => ({
        id: row.id,
        type: row.event_type as RealtimeDomainEvent['type'],
        payload: JSON.parse(row.payload_json),
      }));
    } catch {
      return [];
    }
  }

  async getEventsAfter(
    afterEventId: string,
    filter: RealtimeSubscriptionFilter,
    limit: number = 50,
  ): Promise<RealtimeDomainEvent[]> {
    if (!this.db) return [];

    try {
      const origin = await this.db
        .prepare('SELECT created_at FROM realtime_events WHERE id = ?')
        .bind(afterEventId)
        .first<{ created_at: string }>();

      let query = 'SELECT id, event_type, payload_json FROM realtime_events WHERE ';
      const params: unknown[] = [];

      if (origin?.created_at) {
        query += '(created_at > ? OR (created_at = ? AND id > ?))';
        params.push(origin.created_at, origin.created_at, afterEventId);
      } else {
        query += '1=1';
      }

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

      query += ' ORDER BY created_at ASC, id ASC LIMIT ?';
      params.push(limit);

      const res = await this.db.prepare(query).bind(...params).all<{ id: string; event_type: string; payload_json: string }>();
      const rows = (res.results ?? []) as Array<{ id: string; event_type: string; payload_json: string }>;

      return rows.map((row) => ({
        id: row.id,
        type: row.event_type as RealtimeDomainEvent['type'],
        payload: JSON.parse(row.payload_json),
      }));
    } catch {
      return [];
    }
  }

  clear(): void {
    centralRealtimeHub.clear();
  }
}
