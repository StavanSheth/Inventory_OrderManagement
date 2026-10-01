import { BaseRepository } from './base.repository';
import { User, BranchMembership } from '../../shared/types/entities.types';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';

export interface CreateUserInput {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string;
  phone?: string | null;
  role?: UserRole;
  pin_hash?: string | null;
  status?: string;
}

export class UserRepository extends BaseRepository {
  async findById(id: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>();
  }

  async findByFirebaseUid(uid: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE firebase_uid = ?')
      .bind(uid)
      .first<User>();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<User>();
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const status = input.status ?? 'ACTIVE';
    const role = input.role ?? UserRole.CUSTOMER;

    await this.db
      .prepare(`
        INSERT INTO users (id, firebase_uid, email, display_name, phone, role, pin_hash, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.firebase_uid,
        input.email,
        input.display_name,
        input.phone ?? null,
        role,
        input.pin_hash ?? null,
        status,
        now,
        now,
      )
      .run();

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created user ${input.id}`);
    }
    return created;
  }

  async setPinHash(userId: string, pinHash: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET pin_hash = ?, failed_pin_attempts = 0, pin_locked_until = NULL, updated_at = ? WHERE id = ?')
      .bind(pinHash, now, userId)
      .run();
  }

  async recordFailedPinAttempt(userId: string): Promise<{ failedAttempts: number; isLocked: boolean; lockedUntil: string | null }> {
    const user = await this.findById(userId);
    if (!user) {
      return { failedAttempts: 0, isLocked: false, lockedUntil: null };
    }

    const currentAttempts = (user.failed_pin_attempts ?? 0) + 1;
    let lockedUntil: string | null = null;
    if (currentAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }

    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET failed_pin_attempts = ?, pin_locked_until = ?, updated_at = ? WHERE id = ?')
      .bind(currentAttempts, lockedUntil, now, userId)
      .run();

    return {
      failedAttempts: currentAttempts,
      isLocked: Boolean(lockedUntil),
      lockedUntil,
    };
  }

  async resetPinLockout(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET failed_pin_attempts = 0, pin_locked_until = NULL, updated_at = ? WHERE id = ?')
      .bind(now, userId)
      .run();
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
      .bind(role, now, userId)
      .run();
  }

  async getMemberships(userId: string): Promise<BranchMembership[]> {
    const res = await this.db
      .prepare('SELECT * FROM branch_memberships WHERE user_id = ?')
      .bind(userId)
      .all<BranchMembership>();
    return res.results;
  }

  async getActiveMembership(userId: string, branchId: string): Promise<BranchMembership | null> {
    return this.db
      .prepare('SELECT * FROM branch_memberships WHERE user_id = ? AND branch_id = ? AND status = ?')
      .bind(userId, branchId, MembershipStatus.ACTIVE)
      .first<BranchMembership>();
  }

  async getMembership(userId: string, branchId: string): Promise<BranchMembership | null> {
    return this.db
      .prepare('SELECT * FROM branch_memberships WHERE user_id = ? AND branch_id = ?')
      .bind(userId, branchId)
      .first<BranchMembership>();
  }

  async addMembership(
    id: string,
    userId: string,
    branchId: string,
    role: UserRole,
    status: MembershipStatus = MembershipStatus.ACTIVE,
  ): Promise<BranchMembership> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO branch_memberships (id, user_id, branch_id, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(id, userId, branchId, role, status, now, now)
      .run();

    const res = await this.db
      .prepare('SELECT * FROM branch_memberships WHERE id = ?')
      .bind(id)
      .first<BranchMembership>();

    if (!res) {
      throw new Error(`Failed to retrieve newly created membership ${id}`);
    }
    return res;
  }
}
