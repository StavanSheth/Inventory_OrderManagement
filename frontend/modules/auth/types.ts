import { UserRole } from '../../../shared/enums/roles.enum';
import { BranchContext } from '../../../shared/types/auth.types';

import { VerifyPinResponseData } from '../../../shared/contracts/auth.contract';

export interface FirebaseUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

export interface ApplicationSessionState {
  sessionToken: string;
  expiresAt: string;
  scope: 'BRANCH' | 'GLOBAL';
  branchId: string | null;
}

export interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  firebaseUser: FirebaseUser | null;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
  } | null;
  applicationUser: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
  } | null;
  role: UserRole | null;
  memberships: Array<{
    branchId: string;
    role: UserRole;
    status: string;
  }>;
  activeBranchId: string | null;
  activeBranch: string | null;
  branchContext: BranchContext;
  session: VerifyPinResponseData | null;
  activeSession: VerifyPinResponseData | null;
  isOwner: boolean;
  isOperator: boolean;
  isCustomer: boolean;
  error: string | null;

  // Actions
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  verifyPin: (pin: string, branchId?: string, scope?: 'BRANCH' | 'GLOBAL') => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  selectBranch: (branchId: string) => void;
  logout: () => Promise<void>;
  getFreshAuthHeaders: (options?: { requireSession?: boolean }) => Promise<Record<string, string>>;
}
