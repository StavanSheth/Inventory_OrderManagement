import { BaseRepository } from './base.repository';
import { AuditLog } from '../../shared/types/entities.types';

export interface CreateAuditLogInput {
  id?: string;
  branch_id?: string | null;
  actor_user_id: string;
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

    await this.db
      .prepare(`
        INSERT INTO audit_logs (
          id, branch_id, actor_user_id, action, entity_type, entity_id,
          metadata_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        input.branch_id ?? null,
        input.actor_user_id,
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
      actor_user_id: input.actor_user_id,
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
}
