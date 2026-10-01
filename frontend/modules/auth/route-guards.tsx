'use client';

import React from 'react';
import { useAuth } from './auth-hooks';
import { UserRole } from '../../../shared/enums/roles.enum';

interface RouteGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Frontend route guards provide UX-level routing and UI protection.
 * NOTE: Frontend guards are NOT security boundaries; backend authorization
 * policies and D1 database state remain strictly authoritative.
 */

export function AuthenticatedRoute({ children, fallback }: RouteGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-center">Loading authentication...</div>;
  }

  if (!isAuthenticated) {
    return fallback ? <>{fallback}</> : <div className="p-4 text-center text-red-500">Authentication required.</div>;
  }

  return <>{children}</>;
}

export function CustomerRoute({ children, fallback }: RouteGuardProps) {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  if (!isAuthenticated || role !== UserRole.CUSTOMER) {
    return fallback ? <>{fallback}</> : <div className="p-4 text-center text-red-500">Customer access only.</div>;
  }

  return <>{children}</>;
}

export function OperatorRoute({ children, fallback }: RouteGuardProps) {
  const { isAuthenticated, isLoading, role, isOperator, isOwner } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  if (!isAuthenticated || (!isOperator && !isOwner && role !== UserRole.BRANCH_OPERATOR && role !== UserRole.OWNER)) {
    return fallback ? <>{fallback}</> : <div className="p-4 text-center text-red-500">Branch Operator access only.</div>;
  }

  return <>{children}</>;
}

export function OwnerRoute({ children, fallback }: RouteGuardProps) {
  const { isAuthenticated, isLoading, isOwner, role } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  if (!isAuthenticated || (!isOwner && role !== UserRole.OWNER)) {
    return fallback ? <>{fallback}</> : <div className="p-4 text-center text-red-500">Owner access only.</div>;
  }

  return <>{children}</>;
}
