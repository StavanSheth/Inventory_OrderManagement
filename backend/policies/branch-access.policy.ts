import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { AuthenticatedUserContext } from '../../shared/types/auth.types';
import { ForbiddenError } from '../errors/app-error';

/**
 * Checks if the user is authorized to access data for targetBranchId.
 * - OWNER has global cross-branch access.
 * - BRANCH_OPERATOR has access ONLY if active membership exists for targetBranchId.
 * - CUSTOMER cannot access branch operational data.
 */
export function canAccessBranch(
  context: AuthenticatedUserContext,
  targetBranchId: string,
): boolean {
  if (context.isGlobalOwner || context.role === UserRole.OWNER) {
    return true;
  }

  if (context.role === UserRole.BRANCH_OPERATOR) {
    return context.branchMemberships.some(
      (m) => m.branch_id === targetBranchId && m.status === MembershipStatus.ACTIVE,
    );
  }

  return false;
}

/**
 * Enforces branch access, throwing ForbiddenError if unauthorized.
 */
export function requireBranchAccess(
  context: AuthenticatedUserContext,
  targetBranchId: string,
): void {
  if (!canAccessBranch(context, targetBranchId)) {
    throw new ForbiddenError(`Access to branch ${targetBranchId} is forbidden for user`);
  }
}

/**
 * Checks if the user can access customer-owned data.
 * - CUSTOMER can access only their own data (context.userId === customerUserId).
 * - OWNER can inspect any customer data.
 * - BRANCH_OPERATOR can access orders within their branch.
 */
export function canAccessCustomerData(
  context: AuthenticatedUserContext,
  customerUserId: string,
): boolean {
  if (context.isGlobalOwner || context.role === UserRole.OWNER) {
    return true;
  }
  return context.userId === customerUserId;
}

/**
 * Enforces customer data ownership, throwing ForbiddenError if unauthorized.
 */
export function requireCustomerData(
  context: AuthenticatedUserContext,
  customerUserId: string,
): void {
  if (!canAccessCustomerData(context, customerUserId)) {
    throw new ForbiddenError('Access to other customer data is forbidden');
  }
}
