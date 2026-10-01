import { User, BranchMembership } from '../../../shared/types/entities.types';

export interface IAuthService {
  verifyIdToken(idToken: string): Promise<{ uid: string; email: string; name?: string }>;
  resolveUserAndMemberships(firebaseUid: string): Promise<{ user: User; memberships: BranchMembership[] }>;
}

export const AUTH_SERVICE_TOKEN = 'IAuthService';
