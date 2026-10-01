import { UserRole } from '../../shared/enums/roles.enum';
import { AuthenticatedUserContext } from '../middleware/auth.middleware.interface';

export function canAccessBranch(context: AuthenticatedUserContext, targetBranchId: string): boolean {
  if (context.isGlobalOwner || context.role === UserRole.OWNER) {
    return true;
  }
  return context.branchId === targetBranchId;
}
