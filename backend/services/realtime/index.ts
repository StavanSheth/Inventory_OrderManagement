import { IRealtimeService } from './realtime.interface';
import { realtimeService } from './in-memory-realtime.service';
import { DatabaseRealtimeService } from './database-realtime.service';
import { D1DatabaseLike } from '../../../database/types';

export * from './realtime.interface';
export * from './in-memory-realtime.service';
export * from './database-realtime.service';

/**
 * Creates or retrieves the appropriate RealtimeService implementation.
 * In production and persistent database runtimes, returns a DatabaseRealtimeService
 * that persists events to D1 (realtime_events) for cross-instance and reconnection delivery.
 * In unit tests without a database binding, falls back to the in-memory singleton.
 */
export function createRealtimeService(db?: D1DatabaseLike): IRealtimeService {
  if (db) {
    return new DatabaseRealtimeService(db);
  }
  return realtimeService;
}
