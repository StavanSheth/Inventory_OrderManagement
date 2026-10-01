import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuthenticated } from '../../backend/policies/auth.policy';
import { requireRole, requireOwner, requireOperatorOrOwner } from '../../backend/policies/role.policy';
import {
  canAccessBranch,
  requireBranchAccess,
  canAccessCustomerData,
  requireCustomerData,
  requireApplicationSession,
} from '../../backend/policies/branch-access.policy';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { AuthenticatedUserContext } from '../../shared/types/auth.types';
import { UnauthorizedError, ForbiddenError } from '../../backend/errors/app-error';

describe('Authorization Policies Unit Tests', () => {
  const customerContext: AuthenticatedUserContext = {
    userId: 'usr-cust-1',
    firebaseUid: 'fb-cust-1',
    email: 'cust@melt.local',
    displayName: 'Customer One',
    role: UserRole.CUSTOMER,
    isGlobalOwner: false,
    branchMemberships: [],
  };

  const operatorContext: AuthenticatedUserContext = {
    userId: 'usr-op-1',
    firebaseUid: 'fb-op-1',
    email: 'op@melt.local',
    displayName: 'Operator Alpha',
    role: UserRole.BRANCH_OPERATOR,
    isGlobalOwner: false,
    branchMemberships: [
      {
        id: 'mem-1',
        user_id: 'usr-op-1',
        branch_id: 'branch-alpha',
        role: UserRole.BRANCH_OPERATOR,
        status: MembershipStatus.ACTIVE,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };

  const ownerContext: AuthenticatedUserContext = {
    userId: 'usr-owner-1',
    firebaseUid: 'fb-owner-1',
    email: 'owner@melt.local',
    displayName: 'Global Owner',
    role: UserRole.OWNER,
    isGlobalOwner: true,
    branchMemberships: [],
  };

  describe('auth.policy', () => {
    it('allows valid authenticated context', () => {
      const res = requireAuthenticated(customerContext);
      assert.strictEqual(res.userId, 'usr-cust-1');
    });

    it('throws UnauthorizedError for null or undefined context', () => {
      assert.throws(() => requireAuthenticated(null), UnauthorizedError);
      assert.throws(() => requireAuthenticated(undefined), UnauthorizedError);
    });
  });

  describe('role.policy', () => {
    it('customer passes customer role requirement', () => {
      assert.doesNotThrow(() => requireRole(customerContext, [UserRole.CUSTOMER]));
    });

    it('customer fails operator/owner role requirement', () => {
      assert.throws(() => requireRole(customerContext, [UserRole.BRANCH_OPERATOR]), ForbiddenError);
      assert.throws(() => requireOwner(customerContext), ForbiddenError);
      assert.throws(() => requireOperatorOrOwner(customerContext), ForbiddenError);
    });

    it('operator passes operator requirement but fails owner requirement', () => {
      assert.doesNotThrow(() => requireOperatorOrOwner(operatorContext));
      assert.throws(() => requireOwner(operatorContext), ForbiddenError);
    });

    it('owner passes owner and operator requirements', () => {
      assert.doesNotThrow(() => requireOwner(ownerContext));
      assert.doesNotThrow(() => requireOperatorOrOwner(ownerContext));
    });
  });

  describe('branch-access.policy', () => {
    it('operator can access assigned branch', () => {
      assert.strictEqual(canAccessBranch(operatorContext, 'branch-alpha'), true);
      assert.doesNotThrow(() => requireBranchAccess(operatorContext, 'branch-alpha'));
    });

    it('operator cannot access unassigned branch', () => {
      assert.strictEqual(canAccessBranch(operatorContext, 'branch-beta'), false);
      assert.throws(() => requireBranchAccess(operatorContext, 'branch-beta'), ForbiddenError);
    });

    it('customer cannot access branch operational data', () => {
      assert.strictEqual(canAccessBranch(customerContext, 'branch-alpha'), false);
      assert.throws(() => requireBranchAccess(customerContext, 'branch-alpha'), ForbiddenError);
    });

    it('owner has global cross-branch access to all branches', () => {
      assert.strictEqual(canAccessBranch(ownerContext, 'branch-alpha'), true);
      assert.strictEqual(canAccessBranch(ownerContext, 'branch-beta'), true);
      assert.strictEqual(canAccessBranch(ownerContext, 'branch-gamma'), true);
      assert.doesNotThrow(() => requireBranchAccess(ownerContext, 'branch-beta'));
    });

    it('customer can access only their own customer data', () => {
      assert.strictEqual(canAccessCustomerData(customerContext, 'usr-cust-1'), true);
      assert.doesNotThrow(() => requireCustomerData(customerContext, 'usr-cust-1'));

      assert.strictEqual(canAccessCustomerData(customerContext, 'usr-other-customer'), false);
      assert.throws(() => requireCustomerData(customerContext, 'usr-other-customer'), ForbiddenError);
    });

    it('owner can access any customer data', () => {
      assert.strictEqual(canAccessCustomerData(ownerContext, 'usr-cust-1'), true);
      assert.doesNotThrow(() => requireCustomerData(ownerContext, 'usr-cust-1'));
    });

    describe('requireApplicationSession', () => {

      it('rejects missing or null application session', () => {
        assert.throws(() => {
          requireApplicationSession(null, operatorContext, 'branch-alpha');
        }, UnauthorizedError);
      });

      it('rejects session belonging to a different user', () => {
        const session = {
          user_id: 'different-user',
          scope: 'BRANCH' as const,
          branch_id: 'branch-alpha',
        };
        assert.throws(() => {
          requireApplicationSession(session, operatorContext, 'branch-alpha');
        }, ForbiddenError);
      });

      it('allows operator session matching target branch', () => {
        const session = {
          user_id: operatorContext.userId,
          scope: 'BRANCH' as const,
          branch_id: 'branch-alpha',
        };
        assert.doesNotThrow(() => {
          requireApplicationSession(session, operatorContext, 'branch-alpha');
        });
      });

      it('rejects operator session attempting to access different branch', () => {
        const session = {
          user_id: operatorContext.userId,
          scope: 'BRANCH' as const,
          branch_id: 'branch-alpha',
        };
        assert.throws(() => {
          requireApplicationSession(session, operatorContext, 'branch-beta');
        }, ForbiddenError);
      });

      it('rejects operator with GLOBAL session scope', () => {
        const session = {
          user_id: operatorContext.userId,
          scope: 'GLOBAL' as const,
          branch_id: null,
        };
        assert.throws(() => {
          requireApplicationSession(session, operatorContext, 'branch-alpha');
        }, ForbiddenError);
      });

      it('allows owner with GLOBAL session scope across any branch', () => {
        const session = {
          user_id: ownerContext.userId,
          scope: 'GLOBAL' as const,
          branch_id: null,
        };
        assert.doesNotThrow(() => {
          requireApplicationSession(session, ownerContext, 'branch-alpha');
        });
        assert.doesNotThrow(() => {
          requireApplicationSession(session, ownerContext, 'branch-beta');
        });
      });
    });
  });
});
