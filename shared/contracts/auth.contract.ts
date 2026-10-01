import { UserRole } from '../enums/roles.enum';

export interface LoginRequest {
  idToken: string;
}

export interface LoginResponseData {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
  };
  memberships: Array<{
    branchId: string;
    role: UserRole;
    status: string;
  }>;
  isOwner: boolean;
}

export interface VerifyPinRequest {
  pin: string;
  branchId?: string;
  scope?: 'BRANCH' | 'GLOBAL';
}

export interface VerifyPinResponseData {
  sessionId: string;
  sessionToken: string;
  scope: 'BRANCH' | 'GLOBAL';
  branchId: string | null;
  expiresAt: string;
}

export interface SetPinRequest {
  pin: string;
}

export interface SetPinResponseData {
  success: boolean;
  message: string;
}

export interface SwitchBranchRequest {
  branchId: string;
}

export interface SwitchBranchResponseData {
  activeBranchId: string;
  scope: 'BRANCH' | 'GLOBAL';
}
