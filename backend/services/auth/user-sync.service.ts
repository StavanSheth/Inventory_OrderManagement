import { UserRepository } from '../../../database/repositories/user.repository';
import { UserRole, MembershipStatus } from '../../../shared/enums/roles.enum';
import { FirebaseTokenPayload, UserSyncResult, AuthenticatedUserContext } from '../../../shared/types/auth.types';
import { D1DatabaseLike } from '../../../database/types';

export class UserSyncService {
  constructor(
    private userRepo: UserRepository,
    private db: D1DatabaseLike,
  ) {}

  /**
   * Synchronize authenticated Firebase user into local database.
   * On first authentication, defaults to CUSTOMER role.
   * Client-side role escalation is strictly impossible.
   */
  async syncUser(payload: FirebaseTokenPayload): Promise<UserSyncResult> {
    const existing = await this.userRepo.findByFirebaseUid(payload.uid);

    if (existing) {
      const memberships = await this.userRepo.getMemberships(existing.id);
      return {
        user: existing,
        isNewUser: false,
        memberships,
      };
    }

    // New user auto-creation: strictly CUSTOMER role
    const newUserId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const email = payload.email ?? `${payload.uid}@melt.local`;
    const displayName = payload.name ?? email.split('@')[0] ?? 'Valued Customer';

    const newUser = await this.userRepo.create({
      id: newUserId,
      firebase_uid: payload.uid,
      email,
      display_name: displayName,
      phone: payload.phone_number ?? null,
      role: UserRole.CUSTOMER, // Non-negotiable: safe default
      status: 'ACTIVE',
    });

    // Create corresponding customer profile
    const now = new Date().toISOString();
    const profileId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.db
      .prepare(`
        INSERT INTO customer_profiles (id, user_id, preferred_branch_id, marketing_opt_in, created_at, updated_at)
        VALUES (?, ?, NULL, 0, ?, ?)
      `)
      .bind(profileId, newUserId, now, now)
      .run();

    return {
      user: newUser,
      isNewUser: true,
      memberships: [],
    };
  }

  /**
   * Resolves complete server-side authorization context for a user.
   */
  async resolveUserContext(userId: string): Promise<AuthenticatedUserContext | null> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      return null;
    }

    const allMemberships = await this.userRepo.getMemberships(userId);
    const activeMemberships = allMemberships.filter((m) => m.status === MembershipStatus.ACTIVE);

    const isGlobalOwner = user.role === UserRole.OWNER;

    // Determine effective role:
    // 1. OWNER has global owner role.
    // 2. User with active branch memberships has BRANCH_OPERATOR role.
    // 3. Otherwise CUSTOMER role.
    let effectiveRole: UserRole = UserRole.CUSTOMER;
    if (isGlobalOwner) {
      effectiveRole = UserRole.OWNER;
    } else if (activeMemberships.some((m) => m.role === UserRole.BRANCH_OPERATOR)) {
      effectiveRole = UserRole.BRANCH_OPERATOR;
    }

    return {
      userId: user.id,
      firebaseUid: user.firebase_uid,
      email: user.email,
      displayName: user.display_name,
      role: effectiveRole,
      isGlobalOwner,
      branchMemberships: activeMemberships,
    };
  }
}
