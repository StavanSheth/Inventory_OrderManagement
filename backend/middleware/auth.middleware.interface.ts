import { UserRole } from '../../shared/enums/roles.enum';

export interface AuthenticatedUserContext {
  userId: string;
  firebaseUid: string;
  email: string;
  role: UserRole;
  branchId?: string;
  isGlobalOwner: boolean;
}

export interface IAuthMiddleware {
  authenticate(token: string): Promise<AuthenticatedUserContext>;
}
