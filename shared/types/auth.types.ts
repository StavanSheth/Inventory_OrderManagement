import { UserRole } from '../enums/roles.enum';
import { BranchMembership, User } from './entities.types';

/**
 * Branch context abstraction.
 * Non-negotiable rule: OWNER can have GLOBAL or specific BRANCH scope.
 * BRANCH_OPERATOR can have only assigned BRANCH scope.
 * CUSTOMER cannot have branch administration scope.
 */
export type BranchContext =
  | {
      scope: 'BRANCH';
      branchId: string;
    }
  | {
      scope: 'GLOBAL';
    };

/**
 * Decoded and verified Firebase identity from ID token.
 */
export interface FirebaseTokenPayload {
  uid: string;
  email?: string;
  name?: string;
  phone_number?: string;
  [key: string]: unknown;
}

/**
 * Server-authoritative authenticated user identity and role context.
 */
export interface AuthenticatedUserContext {
  userId: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  role: UserRole;
  isGlobalOwner: boolean;
  branchMemberships: BranchMembership[];
  activeBranchId?: string;
  session?: {
    id: string;
    user_id?: string;
    scope: 'BRANCH' | 'GLOBAL';
    branchId?: string | null;
    pinVerified: boolean;
    expiresAt: string;
  };
}

/**
 * Result of user synchronization on login.
 */
export interface UserSyncResult {
  user: User;
  isNewUser: boolean;
  memberships: BranchMembership[];
}

/**
 * Parameters to verify or establish a PIN session.
 */
export interface VerifyPinInput {
  userId: string;
  pin: string;
  branchId?: string | null;
  scope?: 'BRANCH' | 'GLOBAL';
}
