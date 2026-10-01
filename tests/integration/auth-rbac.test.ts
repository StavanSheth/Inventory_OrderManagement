import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { UserRepository } from '../../database/repositories/user.repository';
import { SessionRepository } from '../../database/repositories/session.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserSyncService } from '../../backend/services/auth/user-sync.service';
import { SessionService } from '../../backend/services/auth/session.service';
import { hashPin } from '../../backend/services/auth/pin-hasher';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { UnauthorizedError, ForbiddenError } from '../../backend/errors/app-error';

describe('Auth, RBAC & Multi-Branch Integration', () => {
  let db = createMemoryD1Database();
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let branchRepo: BranchRepository;
  let userSyncService: UserSyncService;
  let sessionService: SessionService;

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    userRepo = new UserRepository(db);
    sessionRepo = new SessionRepository(db);
    branchRepo = new BranchRepository(db);
    userSyncService = new UserSyncService(userRepo, db);
    sessionService = new SessionService(sessionRepo, userRepo, db);

    // Create test branches and settings
    await branchRepo.create({ id: 'branch-alpha', name: 'Alpha Branch', code: 'ALPHA' });
    await branchRepo.create({ id: 'branch-beta', name: 'Beta Branch', code: 'BETA' });

    await db
      .prepare(`
        INSERT INTO branch_settings (id, branch_id, session_timeout_value, session_timeout_unit, order_expiry_minutes, order_edit_window_minutes, updated_at)
        VALUES ('bs-alpha', 'branch-alpha', 4, 'HOURS', 15, 60, ?)
      `)
      .bind(new Date().toISOString())
      .run();
  });

  it('safely provisions new Google identity with default CUSTOMER role and profile', async () => {
    const payload = {
      uid: 'google-uid-100',
      email: 'customer@melt.local',
      name: 'Priya Sharma',
    };

    const syncResult = await userSyncService.syncUser(payload);
    assert.strictEqual(syncResult.isNewUser, true);
    assert.strictEqual(syncResult.user.role, UserRole.CUSTOMER);
    assert.strictEqual(syncResult.user.email, 'customer@melt.local');

    // Verify customer profile was created
    const profile = await db
      .prepare('SELECT * FROM customer_profiles WHERE user_id = ?')
      .bind(syncResult.user.id)
      .first<{ id: string; user_id: string }>();
    assert.ok(profile);
    assert.strictEqual(profile.user_id, syncResult.user.id);

    // Subsequent sync retrieves existing user without changing role
    const syncResult2 = await userSyncService.syncUser(payload);
    assert.strictEqual(syncResult2.isNewUser, false);
    assert.strictEqual(syncResult2.user.id, syncResult.user.id);
  });

  it('prevents client-side role escalation to OWNER or OPERATOR', async () => {
    const payload = {
      uid: 'malicious-uid-666',
      email: 'hacker@melt.local',
      role: 'OWNER', // Attempted escalation in payload
    };

    const syncResult = await userSyncService.syncUser(payload);
    assert.strictEqual(syncResult.user.role, UserRole.CUSTOMER, 'New user must strictly default to CUSTOMER');

    const context = await userSyncService.resolveUserContext(syncResult.user.id);
    assert.strictEqual(context?.role, UserRole.CUSTOMER);
    assert.strictEqual(context?.isGlobalOwner, false);
  });

  it('correctly resolves BRANCH_OPERATOR role from active branch memberships', async () => {
    // 1. Create user
    const user = await userRepo.create({
      id: 'usr-op-1',
      firebase_uid: 'fb-op-1',
      email: 'op@melt.local',
      display_name: 'Branch Manager',
      role: UserRole.CUSTOMER,
    });

    // 2. Assign branch membership
    await userRepo.addMembership('mem-1', user.id, 'branch-alpha', UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);

    // 3. Resolve context
    const context = await userSyncService.resolveUserContext(user.id);
    assert.strictEqual(context?.role, UserRole.BRANCH_OPERATOR);
    assert.strictEqual(context?.isGlobalOwner, false);
    assert.strictEqual(context?.branchMemberships.length, 1);
    assert.strictEqual(context?.branchMemberships[0].branch_id, 'branch-alpha');
  });

  it('proves PIN verification and application session lifecycle', async () => {
    const user = await userRepo.create({
      id: 'usr-op-session',
      firebase_uid: 'fb-op-session',
      email: 'op.session@melt.local',
      display_name: 'Session Operator',
      role: UserRole.CUSTOMER,
    });

    await userRepo.addMembership('mem-op-session', user.id, 'branch-alpha', UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);

    // Set PIN
    const hashed = await hashPin('1234');
    await userRepo.setPinHash(user.id, hashed);

    // Rejection on wrong PIN
    await assert.rejects(
      async () => {
        await sessionService.verifyPinAndCreateSession({
          userId: user.id,
          pin: '9999',
          branchId: 'branch-alpha',
        });
      },
      UnauthorizedError,
    );

    // Rejection when requesting unassigned branch
    await assert.rejects(
      async () => {
        await sessionService.verifyPinAndCreateSession({
          userId: user.id,
          pin: '1234',
          branchId: 'branch-beta', // Not assigned to beta
        });
      },
      ForbiddenError,
    );

    // Successful session creation on assigned branch
    const { session, sessionToken } = await sessionService.verifyPinAndCreateSession({
      userId: user.id,
      pin: '1234',
      branchId: 'branch-alpha',
    });

    assert.ok(sessionToken);
    assert.strictEqual(session.scope, 'BRANCH');
    assert.strictEqual(session.branch_id, 'branch-alpha');
    assert.strictEqual(session.user_id, user.id);
    assert.ok(session.expires_at > new Date().toISOString());

    // Validate active session
    const validated = await sessionService.validateSession(sessionToken);
    assert.strictEqual(validated.id, session.id);

    // Revocation rejects session
    await sessionService.revokeSession(session.id);
    await assert.rejects(
      async () => {
        await sessionService.validateSession(sessionToken);
      },
      UnauthorizedError,
    );
  });

  it('proves Owner can create GLOBAL session without a specific branch ID', async () => {
    const owner = await userRepo.create({
      id: 'usr-owner-global',
      firebase_uid: 'fb-owner-global',
      email: 'owner.global@melt.local',
      display_name: 'Big Boss',
      role: UserRole.OWNER,
    });

    const hashed = await hashPin('4321');
    await userRepo.setPinHash(owner.id, hashed);

    const { session, sessionToken } = await sessionService.verifyPinAndCreateSession({
      userId: owner.id,
      pin: '4321',
      scope: 'GLOBAL',
    });

    assert.strictEqual(session.scope, 'GLOBAL');
    assert.strictEqual(session.branch_id, null);

    const validated = await sessionService.validateSession(sessionToken);
    assert.strictEqual(validated.scope, 'GLOBAL');
    assert.strictEqual(validated.branch_id, null);
  });

  it('rejects CUSTOMER role from creating PIN sessions', async () => {
    const customer = await userRepo.create({
      id: 'usr-customer-pin-test',
      firebase_uid: 'fb-customer-pin-test',
      email: 'customer.pin@melt.local',
      display_name: 'Customer Pin Attempt',
      role: UserRole.CUSTOMER,
    });

    const hashed = await hashPin('1122');
    await userRepo.setPinHash(customer.id, hashed);

    await assert.rejects(
      async () => {
        await sessionService.verifyPinAndCreateSession({
          userId: customer.id,
          pin: '1122',
        });
      },
      (err: Error) => err instanceof ForbiddenError && err.message.includes('Customers cannot create application sessions'),
    );
  });

  it('enforces brute-force lockout after 5 consecutive incorrect PIN attempts', async () => {
    const operator = await userRepo.create({
      id: 'usr-lockout-test',
      firebase_uid: 'fb-lockout-test',
      email: 'lockout.op@melt.local',
      display_name: 'Lockout Operator',
      role: UserRole.CUSTOMER,
    });

    await userRepo.addMembership('mem-lockout', operator.id, 'branch-alpha', UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);
    const correctPin = '5555';
    await userRepo.setPinHash(operator.id, await hashPin(correctPin));

    // Fail 4 times: should remain unlocked
    for (let i = 0; i < 4; i++) {
      await assert.rejects(
        async () => {
          await sessionService.verifyPinAndCreateSession({
            userId: operator.id,
            pin: '0000',
            branchId: 'branch-alpha',
          });
        },
        (err: Error) => err.message.includes('Invalid PIN'),
      );
    }

    // 5th failure: triggers lockout
    await assert.rejects(
      async () => {
        await sessionService.verifyPinAndCreateSession({
          userId: operator.id,
          pin: '0000',
          branchId: 'branch-alpha',
        });
      },
      (err: Error) => err.message.includes('temporarily locked for 5 minutes'),
    );

    // 6th attempt (even with correct PIN): should be rejected immediately due to active lock
    await assert.rejects(
      async () => {
        await sessionService.verifyPinAndCreateSession({
          userId: operator.id,
          pin: correctPin,
          branchId: 'branch-alpha',
        });
      },
      (err: Error) => err.message.includes('Account PIN is temporarily locked'),
    );
  });

  it('revokes all sessions for a user using revokeAllForUser', async () => {
    const owner = await userRepo.create({
      id: 'usr-owner-multi-session',
      firebase_uid: 'fb-owner-multi-session',
      email: 'owner.multi@melt.local',
      display_name: 'Multi Session Owner',
      role: UserRole.OWNER,
    });

    await userRepo.setPinHash(owner.id, await hashPin('9999'));

    const s1 = await sessionService.verifyPinAndCreateSession({ userId: owner.id, pin: '9999', scope: 'GLOBAL' });
    const s2 = await sessionService.verifyPinAndCreateSession({ userId: owner.id, pin: '9999', scope: 'GLOBAL' });

    assert.ok(await sessionService.validateSession(s1.sessionToken));
    assert.ok(await sessionService.validateSession(s2.sessionToken));

    // Revoke all
    await sessionService.revokeAllForUser(owner.id);

    await assert.rejects(async () => sessionService.validateSession(s1.sessionToken), UnauthorizedError);
    await assert.rejects(async () => sessionService.validateSession(s2.sessionToken), UnauthorizedError);
  });
});
