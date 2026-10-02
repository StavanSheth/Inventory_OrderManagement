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
    const lockDurationMs = 5 * 60 * 1000;
    const lockUntilTimestamp = new Date(Date.now() + lockDurationMs).toISOString();
    const now = new Date().toISOString();

    // Atomic SQL increment preventing concurrency bypass
    await this.db
      .prepare(`
        UPDATE users
        SET failed_pin_attempts = COALESCE(failed_pin_attempts, 0) + 1,
            pin_locked_until = CASE
              WHEN COALESCE(failed_pin_attempts, 0) + 1 >= 5 THEN ?
              ELSE pin_locked_until
            END,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(lockUntilTimestamp, now, userId)
      .run();

    const updated = await this.findById(userId);
    const failedAttempts = updated?.failed_pin_attempts ?? 1;
    const lockedUntil = updated?.pin_locked_until ?? null;
    const isLocked = Boolean(lockedUntil && lockedUntil > now);

    return {
      failedAttempts,
      isLocked,
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

  async anonymizeUser(userId: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    const now = new Date().toISOString();
    const anonymizedEmail = `anonymized-${userId}@deleted.local`;
    const anonymizedName = 'Anonymized Customer';

    await this.db
      .prepare(`
        UPDATE users
        SET email = ?,
            display_name = ?,
            phone = NULL,
            pin_hash = NULL,
            status = 'INACTIVE',
            updated_at = ?
        WHERE id = ?
      `)
      .bind(anonymizedEmail, anonymizedName, now, userId)
      .run();

    return (await this.findById(userId))!;
  }

  async getCustomersWithOrderStats(options?: {
    startDate?: string;
    endDate?: string;
    branchId?: string;
  }): Promise<Array<{
    id: string;
    displayName: string;
    email: string;
    phone: string | null;
    totalOrders: number;
    totalSpent: number;
    avgOrderValue: number;
    lastOrderAt: string | null;
    firstOrderAt: string | null;
  }>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.startDate) {
      conditions.push('o.placed_at >= ?');
      params.push(options.startDate);
    }
    if (options?.endDate) {
      conditions.push('o.placed_at <= ?');
      params.push(options.endDate);
    }
    if (options?.branchId && options.branchId !== 'ALL') {
      conditions.push('o.branch_id = ?');
      params.push(options.branchId);
    }

    const orderFilter = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        u.id,
        u.display_name as displayName,
        u.email,
        u.phone,
        COUNT(o.id) as totalOrders,
        COALESCE(SUM(CASE WHEN o.status NOT IN ('CANCELLED', 'EXPIRED') THEN o.total ELSE 0 END), 0) as totalSpent,
        MAX(o.placed_at) as lastOrderAt,
        MIN(o.placed_at) as firstOrderAt
      FROM users u
      LEFT JOIN orders o ON o.customer_user_id = u.id ${orderFilter}
      WHERE u.role = 'CUSTOMER' OR u.role IS NULL OR u.role = ''
      GROUP BY u.id
      ORDER BY totalSpent DESC, totalOrders DESC
    `;

    const res = await this.db.prepare(sql).bind(...params).all<{
      id: string;
      displayName: string;
      email: string;
      phone: string | null;
      totalOrders: number;
      totalSpent: number;
      lastOrderAt: string | null;
      firstOrderAt: string | null;
    }>();

    return (res?.results ?? []).map((r) => {
      const orders = Number(r.totalOrders || 0);
      const spent = Number(r.totalSpent || 0);
      return {
        id: r.id,
        displayName: r.displayName || 'Customer',
        email: r.email || '',
        phone: r.phone || null,
        totalOrders: orders,
        totalSpent: spent,
        avgOrderValue: orders > 0 ? Number((spent / orders).toFixed(2)) : 0,
        lastOrderAt: r.lastOrderAt || null,
        firstOrderAt: r.firstOrderAt || null,
      };
    });
  }
}
