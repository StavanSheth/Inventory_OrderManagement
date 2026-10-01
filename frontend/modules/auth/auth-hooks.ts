'use client';

import { useContext } from 'react';
import { AuthContext, AuthContextValue } from './auth-context';
import { UserRole } from '../../../shared/enums/roles.enum';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useRequireAuth(allowedRoles?: UserRole[]) {
  const auth = useAuth();

  const isAuthorized = !allowedRoles || (auth.user && allowedRoles.includes(auth.user.role));

  return {
    ...auth,
    isAuthorized: Boolean(auth.isAuthenticated && isAuthorized),
  };
}

export function useBranchContext() {
  const { branchContext, selectBranch, isOwner } = useAuth();
  return {
    branchContext,
    selectBranch,
    isOwner,
  };
}
