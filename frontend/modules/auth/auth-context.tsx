'use client';

import React, { createContext, useState, useCallback, useMemo, useEffect } from 'react';
import { UserRole } from '../../../shared/enums/roles.enum';
import { BranchContext } from '../../../shared/types/auth.types';
import { authClient } from './auth-client';
import { VerifyPinResponseData } from '../../../shared/contracts/auth.contract';
import { getFirebaseAuth, GoogleAuthProvider, signInWithPopup } from './google-auth';
import { FirebaseUser, AuthContextValue } from './types';

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  firebaseUser: FirebaseUser | null;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
  } | null;
  memberships: Array<{
    branchId: string;
    role: UserRole;
    status: string;
  }>;
  activeBranchId: string | null;
  branchContext: BranchContext;
  session: VerifyPinResponseData | null;
  isOwner: boolean;
  isOperator: boolean;
  isCustomer: boolean;
}

export type { AuthContextValue } from './types';

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'isOwner' | 'isOperator' | 'isCustomer' | 'branchContext'>>({
    isLoading: true,
    isAuthenticated: false,
    firebaseUser: null,
    user: null,
    memberships: [],
    activeBranchId: null,
    session: null,
  });

  const isOwner = state.user?.role === UserRole.OWNER;
  const isOperator = state.user?.role === UserRole.BRANCH_OPERATOR;
  const isCustomer = state.user?.role === UserRole.CUSTOMER;

  const branchContext: BranchContext = useMemo(() => {
    if (isOwner && !state.activeBranchId) {
      return { scope: 'GLOBAL' };
    }
    if (state.activeBranchId) {
      return { scope: 'BRANCH', branchId: state.activeBranchId };
    }
    if (state.memberships.length > 0) {
      return { scope: 'BRANCH', branchId: state.memberships[0].branchId };
    }
    return { scope: 'GLOBAL' };
  }, [isOwner, state.activeBranchId, state.memberships]);

  // Synchronizes backend user session whenever a Firebase user is established or refreshed
  const syncBackendUser = useCallback(async (fbUser: FirebaseUser) => {
    try {
      const data = await authClient.login();
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isAuthenticated: true,
        firebaseUser: fbUser,
        user: data.user,
        memberships: data.memberships,
        activeBranchId: prev.activeBranchId ?? data.memberships[0]?.branchId ?? null,
      }));

      // Subdomain & role-based routing w.r.t Firebase login / branch operator / owner
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        const currentHost = window.location.hostname.toLowerCase();
        const role = data.user.role;

        // If on generic root landing page, route directly to the user's role domain/section
        if (currentPath === '/' || currentPath === '/login') {
          if (role === UserRole.OWNER && !currentHost.startsWith('owner.') && !currentHost.startsWith('admin.')) {
            window.location.href = '/owner';
          } else if (role === UserRole.BRANCH_OPERATOR && !currentHost.startsWith('operator.') && !currentHost.startsWith('staff.')) {
            window.location.href = '/operator';
          } else if (role === UserRole.CUSTOMER && !currentHost.startsWith('order.') && !currentHost.startsWith('app.')) {
            window.location.href = '/order';
          }
        }
      }
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        session: null,
      }));
    }
  }, []);

  // Subscribe to Firebase token & auth state changes
  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = auth.onIdTokenChanged(async (fbUser) => {
      if (fbUser) {
        await syncBackendUser(fbUser);
      } else {
        authClient.clearSession();
        setState({
          isLoading: false,
          isAuthenticated: false,
          firebaseUser: null,
          user: null,
          memberships: [],
          activeBranchId: null,
          session: null,
        });
      }
    });

    return () => unsubscribe();
  }, [syncBackendUser]);

  const loginWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await syncBackendUser(result.user);
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw err;
    }
  }, [syncBackendUser]);

  const loginWithToken = useCallback(async (_token: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const data = await authClient.login();
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isAuthenticated: true,
        user: data.user,
        memberships: data.memberships,
        activeBranchId: data.memberships[0]?.branchId ?? null,
        session: null,
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw err;
    }
  }, []);

  const verifyPin = useCallback(async (pin: string, branchId?: string, scope?: 'BRANCH' | 'GLOBAL') => {
    const session = await authClient.verifyPin({ pin, branchId, scope });
    setState((prev) => ({
      ...prev,
      session,
      activeBranchId: session.branchId ?? prev.activeBranchId,
    }));
  }, []);

  const setPin = useCallback(async (pin: string) => {
    await authClient.setPin(pin);
  }, []);

  const selectBranch = useCallback((branchId: string | null) => {
    setState((prev) => ({ ...prev, activeBranchId: branchId }));
  }, []);

  const logout = useCallback(async () => {
    authClient.clearSession();
    await getFirebaseAuth().signOut();
    setState({
      isLoading: false,
      isAuthenticated: false,
      firebaseUser: null,
      user: null,
      memberships: [],
      activeBranchId: null,
      session: null,
    });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      role: state.user?.role ?? null,
      applicationUser: state.user,
      activeBranch: state.activeBranchId,
      activeSession: state.session,
      error: null,
      isOwner,
      isOperator,
      isCustomer,
      branchContext,
      signInWithGoogle: loginWithGoogle,
      signOut: logout,
      refreshAuth: async () => {
        if (state.firebaseUser) {
          await syncBackendUser(state.firebaseUser);
        }
      },
      loginWithGoogle,
      loginWithToken,
      verifyPin,
      setPin,
      selectBranch,
      logout,
      getFreshAuthHeaders: (opts?: { requireSession?: boolean }) => authClient.getAuthorizedHeaders(opts),
    }),
    [
      state,
      isOwner,
      isOperator,
      isCustomer,
      branchContext,
      loginWithGoogle,
      loginWithToken,
      verifyPin,
      setPin,
      selectBranch,
      logout,
      syncBackendUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
