import { BaseRepository } from './base.repository';
import { AuditLog } from '../../shared/types/entities.types';

export interface CreateAuditLogInput {
  id?: string;
  branch_id?: string | null;
  actor_user_id?: string | null;
  actor_type?: 'USER' | 'SYSTEM';
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, unknown>;
}

export class AuditRepository extends BaseRepository {
  async log(input: CreateAuditLogInput): Promise<AuditLog> {
    const id = input.id ?? `aud-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const metadataJson = JSON.stringify(input.metadata ?? {});
    const actorType = input.actor_type ?? (input.actor_user_id ? 'USER' : 'SYSTEM');
    const actorUserId = input.actor_user_id ?? null;

    await this.db
      .prepare(`
        INSERT INTO audit_logs (
          id, branch_id, actor_user_id, actor_type, action, entity_type, entity_id,
          metadata_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        input.branch_id ?? null,
        actorUserId,
        actorType,
        input.action,
        input.entity_type,
        input.entity_id,
        metadataJson,
        now,
      )
      .run();

    return {
      id,
      branch_id: input.branch_id ?? null,
      actor_user_id: actorUserId,
      actor_type: actorType,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      metadata_json: metadataJson,
      created_at: now,
    };
  }

  async listByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    const res = await this.db
      .prepare('SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC')
      .bind(entityType, entityId)
      .all<AuditLog>();
    return res.results;
  }

  async listByBranch(branchId: string): Promise<AuditLog[]> {
    const res = await this.db
      .prepare('SELECT * FROM audit_logs WHERE branch_id = ? ORDER BY created_at DESC')
      .bind(branchId)
      .all<AuditLog>();
    return res.results;
  }

  async listRecent(limit: number = 50): Promise<AuditLog[]> {
    const res = await this.db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all<AuditLog>();
    return res.results;
  }

  prepareLogStatement(input: CreateAuditLogInput, nowIso: string = new Date().toISOString()) {
    const id = input.id ?? `aud-${crypto.randomUUID()}`;
    const metadataJson = JSON.stringify(input.metadata ?? {});
    const actorType = input.actor_type ?? (input.actor_user_id ? 'USER' : 'SYSTEM');
    const actorUserId = input.actor_user_id ?? null;

    return this.db
      .prepare(`
        INSERT INTO audit_logs (
          id, branch_id, actor_user_id, actor_type, action, entity_type, entity_id,
          metadata_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        input.branch_id ?? null,
        actorUserId,
        actorType,
        input.action,
        input.entity_type,
        input.entity_id,
        metadataJson,
        nowIso,
      );
  }
}
