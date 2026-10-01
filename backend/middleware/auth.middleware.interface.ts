import { AuthenticatedUserContext } from '../../shared/types/auth.types';

export type { AuthenticatedUserContext };

export interface IAuthMiddleware {
  authenticate(token: string): Promise<AuthenticatedUserContext>;
}
