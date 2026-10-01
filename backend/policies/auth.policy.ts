import { AuthenticatedUserContext } from '../../shared/types/auth.types';
import { UnauthorizedError } from '../errors/app-error';

/**
 * Enforces that the request has a verified authenticated identity.
 */
export function requireAuthenticated(
  context: AuthenticatedUserContext | null | undefined,
): AuthenticatedUserContext {
  if (!context || !context.userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return context;
}
