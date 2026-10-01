import { UserRole } from '../../shared/enums/roles.enum';
import { AuthenticatedUserContext } from '../../shared/types/auth.types';
import { ForbiddenError } from '../errors/app-error';

/**
 * Enforces that an authenticated user has one of the allowed roles.
 */
export function requireRole(
  context: AuthenticatedUserContext,
  allowedRoles: UserRole[],
): void {
  // Global owner always satisfies operator/owner checks
  if (context.isGlobalOwner || context.role === UserRole.OWNER) {
    if (allowedRoles.includes(UserRole.OWNER) || allowedRoles.includes(UserRole.BRANCH_OPERATOR)) {
      return;
    }
  }

  if (!allowedRoles.includes(context.role)) {
    throw new ForbiddenError(`Operation requires one of roles: ${allowedRoles.join(', ')}`);
  }
}

/**
 * Enforces that an authenticated user is an OWNER.
 */
export function requireOwner(context: AuthenticatedUserContext): void {
  requireRole(context, [UserRole.OWNER]);
}

/**
 * Enforces that an authenticated user is either a BRANCH_OPERATOR or OWNER.
 */
export function requireOperatorOrOwner(context: AuthenticatedUserContext): void {
  requireRole(context, [UserRole.BRANCH_OPERATOR, UserRole.OWNER]);
}
