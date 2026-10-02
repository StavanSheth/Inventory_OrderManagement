import { BaseRepository } from './base.repository';
import { ApplicationSession } from '../../shared/types/entities.types';

export interface CreateSessionInput {
  id: string;
  session_token_hash: string;
  user_id: string;
  branch_id?: string | null;
  scope: 'BRANCH' | 'GLOBAL';
  authenticated_at: string;
  pin_verified_at?: string | null;
  expires_at: string;
}

export class SessionRepository extends BaseRepository {
  async create(input: CreateSessionInput): Promise<ApplicationSession> {
    const now = new Date().toISOString();

    await this.db
      .prepare(`
        INSERT INTO application_sessions (
          id, session_token_hash, user_id, branch_id, scope,
          authenticated_at, pin_verified_at, expires_at, revoked_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `)
      .bind(
        input.id,
        input.session_token_hash,
        input.user_id,
        input.branch_id ?? null,
        input.scope,
        input.authenticated_at,
        input.pin_verified_at ?? null,
        input.expires_at,
        now,
      )
      .run();

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created application session ${input.id}`);
    }
    return created;
  }

  async findById(id: string): Promise<ApplicationSession | null> {
    return this.db
      .prepare('SELECT * FROM application_sessions WHERE id = ?')
      .bind(id)
      .first<ApplicationSession>();
  }

  async findByTokenHash(tokenHash: string): Promise<ApplicationSession | null> {
    return this.db
      .prepare('SELECT * FROM application_sessions WHERE session_token_hash = ?')
      .bind(tokenHash)
      .first<ApplicationSession>();
  }

  async findActiveByTokenHash(tokenHash: string): Promise<ApplicationSession | null> {
    const now = new Date().toISOString();
    return this.db
      .prepare(`
        SELECT * FROM application_sessions
        WHERE session_token_hash = ?
          AND revoked_at IS NULL
          AND expires_at > ?
      `)
      .bind(tokenHash, now)
      .first<ApplicationSession>();
  }

  async findActiveByUserId(userId: string): Promise<ApplicationSession[]> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare(`
        SELECT * FROM application_sessions
        WHERE user_id = ?
          AND revoked_at IS NULL
          AND expires_at > ?
      `)
      .bind(userId, now)
      .all<ApplicationSession>();
    return res.results;
  }

  async revoke(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE application_sessions SET revoked_at = ? WHERE id = ?')
      .bind(now, id)
      .run();
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare('UPDATE application_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(now, userId)
      .run();
    return Number((res.meta as { changes?: number })?.changes ?? (res as { changes?: number })?.changes ?? 0);
  }
}
