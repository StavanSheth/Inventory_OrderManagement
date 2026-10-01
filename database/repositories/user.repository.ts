import { BaseRepository } from './base.repository';
import { User, BranchMembership } from '../../shared/types/entities.types';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';

export interface CreateUserInput {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string;
  phone?: string | null;
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

    await this.db
      .prepare(`
        INSERT INTO users (id, firebase_uid, email, display_name, phone, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.firebase_uid,
        input.email,
        input.display_name,
        input.phone ?? null,
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

  async getMemberships(userId: string): Promise<BranchMembership[]> {
    const res = await this.db
      .prepare('SELECT * FROM branch_memberships WHERE user_id = ?')
      .bind(userId)
      .all<BranchMembership>();
    return res.results;
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
