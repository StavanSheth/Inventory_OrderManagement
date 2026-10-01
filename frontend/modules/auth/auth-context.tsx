'use client';

import React, { createContext, useState, useCallback, useMemo } from 'react';
import { UserRole } from '../../../shared/enums/roles.enum';
import { BranchContext } from '../../../shared/types/auth.types';
import { authClient } from './auth-client';
import { VerifyPinResponseData } from '../../../shared/contracts/auth.contract';

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
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

export interface AuthContextValue extends AuthState {
  loginWithToken: (idToken: string) => Promise<void>;
  verifyPin: (pin: string, branchId?: string, scope?: 'BRANCH' | 'GLOBAL') => Promise<void>;
  selectBranch: (branchId: string | null) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'isOwner' | 'isOperator' | 'isCustomer' | 'branchContext'>>({
    isLoading: false,
    isAuthenticated: false,
    user: null,
    memberships: [],
    activeBranchId: null,
    session: null,
  });

  const [idToken, setIdToken] = useState<string | null>(null);

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

  const loginWithToken = useCallback(async (token: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const data = await authClient.loginWithIdToken(token);
      setIdToken(token);
      setState({
        isLoading: false,
        isAuthenticated: true,
        user: data.user,
        memberships: data.memberships,
        activeBranchId: data.memberships[0]?.branchId ?? null,
        session: null,
      });
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw err;
    }
  }, []);

  const verifyPin = useCallback(async (pin: string, branchId?: string, scope?: 'BRANCH' | 'GLOBAL') => {
    if (!idToken) throw new Error('Not authenticated with Firebase');
    const session = await authClient.verifyPin(idToken, { pin, branchId, scope });
    setState((prev) => ({
      ...prev,
      session,
      activeBranchId: session.branchId ?? prev.activeBranchId,
    }));
  }, [idToken]);

  const selectBranch = useCallback((branchId: string | null) => {
    setState((prev) => ({ ...prev, activeBranchId: branchId }));
  }, []);

  const logout = useCallback(() => {
    setIdToken(null);
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      memberships: [],
      activeBranchId: null,
      session: null,
    });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      isOwner,
      isOperator,
      isCustomer,
      branchContext,
      loginWithToken,
      verifyPin,
      selectBranch,
      logout,
    }),
    [state, isOwner, isOperator, isCustomer, branchContext, loginWithToken, verifyPin, selectBranch, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
