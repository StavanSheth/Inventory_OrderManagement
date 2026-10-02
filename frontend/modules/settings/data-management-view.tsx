'use client';

import React, { useState } from 'react';
import { ownerApiClient } from '../../services/owner-api-client';
import { Branch } from '../../../shared/types/entities.types';
import { BranchDeletionPreviewResponse, AnonymizeCustomerResponse } from '../../../shared/contracts/deletion.contract';

interface DataManagementViewProps {
  branches: Branch[];
  onBranchesUpdated: () => void;
}

export const DataManagementView: React.FC<DataManagementViewProps> = ({
  branches,
  onBranchesUpdated,
}) => {
  // Branch Deletion state
  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || '');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<BranchDeletionPreviewResponse | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState<boolean>(false);
  const [branchMsg, setBranchMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Customer Anonymization state
  const [customerUserId, setCustomerUserId] = useState<string>('');
  const [anonLoading, setAnonLoading] = useState<boolean>(false);
  const [anonResult, setAnonResult] = useState<AnonymizeCustomerResponse | null>(null);
  const [anonError, setAnonError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!selectedBranchId) return;
    setPreviewLoading(true);
    setBranchMsg(null);
    try {
      const res = await ownerApiClient.previewBranchDeletion(selectedBranchId);
      if (res.success) {
        setPreviewData(res.data);
      } else {
        setBranchMsg({ type: 'error', text: res.error.message || 'Failed to inspect branch dependencies' });
      }
    } catch (err) {
      setBranchMsg({ type: 'error', text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedBranchId) return;
    const confirmAction = window.confirm(
      'Are you sure you want to safely deactivate this branch? It will immediately stop accepting new orders.'
    );
    if (!confirmAction) return;

    setDeactivateLoading(true);
    setBranchMsg(null);
    try {
      const res = await ownerApiClient.deactivateBranch(selectedBranchId);
      if (res.success) {
        setBranchMsg({ type: 'success', text: res.data.message });
        setPreviewData(null);
        onBranchesUpdated();
      } else {
        setBranchMsg({ type: 'error', text: res.error.message || 'Failed to deactivate branch' });
      }
    } catch (err) {
      setBranchMsg({ type: 'error', text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleAnonymize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerUserId.trim()) {
      setAnonError('Customer user ID is required.');
      return;
    }

    const confirmAction = window.confirm(
      `Irreversible Action: Anonymize customer "${customerUserId.trim()}"? Personal identifying data will be scrubbed, active sessions revoked, and all orders preserved for accounting.`
    );
    if (!confirmAction) return;

    setAnonLoading(true);
    setAnonError(null);
    setAnonResult(null);
    try {
      const res = await ownerApiClient.anonymizeCustomer(customerUserId.trim());
      if (res.success) {
        setAnonResult(res.data);
        setCustomerUserId('');
      } else {
        setAnonError(res.error.message || 'Failed to anonymize customer');
      }
    } catch (err) {
      setAnonError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setAnonLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '850px' }}>
      {/* Section 1: Branch Lifecycle & Safe Deletion */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '1rem',
          border: '1px solid #f4d3dd',
          padding: '1.5rem',
          boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233', margin: '0 0 0.25rem 0' }}>
            🏢 Branch Lifecycle & Safe Deactivation
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0 }}>
            Inspect foreign key dependencies (orders, payments, inventory records) to safely retire branch locations without corrupting business analytics.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <select
            value={selectedBranchId}
            onChange={(e) => {
              setSelectedBranchId(e.target.value);
              setPreviewData(null);
            }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #f4d3dd',
              background: '#fff1f4',
              fontWeight: 700,
              fontSize: '0.875rem',
              color: '#2b1233',
            }}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code}) - {b.status}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handlePreview}
            disabled={previewLoading || !selectedBranchId}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '9999px',
              border: '1px solid #f4d3dd',
              background: '#ffffff',
              color: '#d61c5d',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            {previewLoading ? 'Inspecting...' : '🔍 Check Dependencies'}
          </button>
        </div>

        {branchMsg && (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              borderRadius: '0.75rem',
              background: branchMsg.type === 'success' ? '#e6f9f0' : '#ffe5e5',
              border: `1px solid ${branchMsg.type === 'success' ? '#a3e6be' : '#ff9999'}`,
              color: branchMsg.type === 'success' ? '#0d7d4d' : '#a3134a',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            {branchMsg.text}
          </div>
        )}

        {previewData && (
          <div
            style={{
              background: '#fff9fa',
              borderRadius: '0.75rem',
              border: '1px solid #fceef2',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#2b1233' }}>
                Dependency Analysis for Branch: {previewData.branchId.slice(0, 8)}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  background: previewData.canHardDelete ? '#d4edda' : '#fff3cd',
                  color: previewData.canHardDelete ? '#155724' : '#856404',
                }}
              >
                {previewData.canHardDelete ? 'CAN HARD DELETE' : 'PROTECTED FROM HARD DELETE'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #f4d3dd' }}>
                <div style={{ fontSize: '0.75rem', color: '#6f5569' }}>Total Orders</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233' }}>{previewData.counts.orders}</div>
              </div>
              <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #f4d3dd' }}>
                <div style={{ fontSize: '0.75rem', color: '#6f5569' }}>Payments</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233' }}>{previewData.counts.payments}</div>
              </div>
              <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #f4d3dd' }}>
                <div style={{ fontSize: '0.75rem', color: '#6f5569' }}>Stock Movements</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233' }}>{previewData.counts.inventoryMovements}</div>
              </div>
              <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #f4d3dd' }}>
                <div style={{ fontSize: '0.75rem', color: '#6f5569' }}>Memberships</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233' }}>{previewData.counts.memberships}</div>
              </div>
            </div>

            {previewData.blockingReasons.length > 0 && (
              <div style={{ fontSize: '0.8125rem', color: '#6f5569', margin: '0.25rem 0' }}>
                <div style={{ fontWeight: 700, color: '#856404', marginBottom: '0.25rem' }}>Protection Reasons:</div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {previewData.blockingReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={deactivateLoading}
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: '9999px',
                  border: 'none',
                  background: '#c0392b',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                {deactivateLoading ? 'Deactivating...' : '🛡️ Safe Deactivate Branch'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Customer Anonymization & Data Privacy */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '1rem',
          border: '1px solid #f4d3dd',
          padding: '1.5rem',
          boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233', margin: '0 0 0.25rem 0' }}>
            🔒 Customer Data Privacy & Anonymization
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0 }}>
            Anonymize customer records upon user deletion request (GDPR/Compliance). Personal identifiable information is scrubbed while order & payment totals remain intact for business records.
          </p>
        </div>

        <form onSubmit={handleAnonymize} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
              Customer User ID *
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="text"
                required
                placeholder="e.g. usr_cust_12345"
                value={customerUserId}
                onChange={(e) => setCustomerUserId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                }}
              />
              <button
                type="submit"
                disabled={anonLoading}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#d61c5d',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                {anonLoading ? 'Anonymizing...' : 'Scrub Customer Data'}
              </button>
            </div>
          </div>
        </form>

        {anonError && (
          <div style={{ padding: '0.85rem 1.25rem', background: '#ffe5e5', border: '1px solid #ff9999', borderRadius: '0.75rem', color: '#a3134a', fontWeight: 600 }}>
            {anonError}
          </div>
        )}

        {anonResult && (
          <div
            style={{
              padding: '1rem',
              background: '#e6f9f0',
              border: '1px solid #a3e6be',
              borderRadius: '0.75rem',
              color: '#0d7d4d',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>✅ Customer Successfully Anonymized</div>
            <div>User ID: <strong>{anonResult.customerUserId}</strong></div>
            <div>Anonymized At: <strong>{new Date(anonResult.anonymizedAt).toLocaleString()}</strong></div>
            <div>Preserved Historical Orders: <strong>{anonResult.preservedOrdersCount}</strong></div>
            <div>Revoked Active Sessions: <strong>{anonResult.revokedSessionsCount}</strong></div>
          </div>
        )}
      </div>
    </div>
  );
};
