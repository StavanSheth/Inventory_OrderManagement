'use client';

import React, { useState } from 'react';
import { ownerApiClient } from '../../services/owner-api-client';
import { Branch } from '../../../shared/types/entities.types';
import { CreateBranchRequest, UpdateBranchRequest } from '../../../shared/contracts/branch.contract';
import { exportToExcel, exportToPdf } from '../../utils/export-helpers';

interface BranchManagementViewProps {
  branches: Branch[];
  onBranchesUpdated: () => void;
  onSelectBranchSettings?: (branchId: string) => void;
}

export const BranchManagementView: React.FC<BranchManagementViewProps> = ({
  branches,
  onBranchesUpdated,
  onSelectBranchSettings,
}) => {
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states for Create
  const [createCode, setCreateCode] = useState<string>('');
  const [createName, setCreateName] = useState<string>('');
  const [createAddress, setCreateAddress] = useState<string>('');
  const [createPhone, setCreatePhone] = useState<string>('');

  // Form states for Edit
  const [editName, setEditName] = useState<string>('');
  const [editAddress, setEditAddress] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCode.trim() || !createName.trim()) {
      setError('Branch code and name are required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: CreateBranchRequest = {
        code: createCode.trim().toUpperCase(),
        name: createName.trim(),
        address: createAddress.trim() || undefined,
        phone: createPhone.trim() || undefined,
      };

      const res = await ownerApiClient.createBranch(payload);
      if (res.success) {
        setSuccessMessage(`Branch "${res.data.name}" created successfully!`);
        setShowCreateModal(false);
        setCreateCode('');
        setCreateName('');
        setCreateAddress('');
        setCreatePhone('');
        onBranchesUpdated();
      } else {
        setError(res.error.message || 'Failed to create branch');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (b: Branch) => {
    setEditingBranch(b);
    setEditName(b.name);
    setEditAddress(b.address || '');
    setEditPhone(b.phone || '');
    setError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    if (!editName.trim()) {
      setError('Branch name is required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: UpdateBranchRequest = {
        name: editName.trim(),
        address: editAddress.trim() || undefined,
        phone: editPhone.trim() || undefined,
      };

      const res = await ownerApiClient.updateBranch(editingBranch.id, payload);
      if (res.success) {
        setSuccessMessage(`Branch "${res.data.name}" updated successfully!`);
        setEditingBranch(null);
        onBranchesUpdated();
      } else {
        setError(res.error.message || 'Failed to update branch');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (branch: Branch) => {
    const nextStatus = branch.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmMsg =
      nextStatus === 'INACTIVE'
        ? `Are you sure you want to deactivate "${branch.name}"? New orders will be blocked.`
        : `Activate branch "${branch.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await ownerApiClient.setBranchStatus(branch.id, nextStatus);
      if (res.success) {
        setSuccessMessage(`Branch status updated to ${nextStatus}.`);
        onBranchesUpdated();
      } else {
        setError(res.error.message || 'Failed to update branch status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Action Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#ffffff',
          padding: '1.25rem 1.5rem',
          borderRadius: '1rem',
          border: '1px solid #f4d3dd',
          boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233', margin: 0 }}>
            🏢 Branch Management
          </h2>
          <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: '0.25rem 0 0 0' }}>
            Manage physical ice cream parlor locations, operating details, and statuses.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              const activeCount = branches.filter((b) => b.status === 'ACTIVE').length;
              exportToExcel({
                filename: 'melt-branches-report',
                title: 'Melt Gelato - Branches Directory Report',
                subtitle: `Total Branches: ${branches.length} (${activeCount} Active)`,
                filterSummary: { 'Total Branches': branches.length, 'Active Branches': activeCount },
                columns: [
                  { header: 'Branch Name', key: 'name' },
                  { header: 'Code', key: 'code' },
                  { header: 'Status', key: 'status' },
                  { header: 'Phone', key: 'phone' },
                  { header: 'Address', key: 'address' },
                  { header: 'Created Date', key: 'created_at' },
                ],
                data: branches.map((b) => ({
                  ...b,
                  phone: b.phone || 'N/A',
                  address: b.address || 'N/A',
                  created_at: new Date(b.created_at).toLocaleDateString(),
                })),
              });
            }}
            style={{
              padding: '0.5rem 0.95rem',
              background: '#f1f8ed',
              color: '#2d6a1e',
              borderRadius: '9999px',
              border: '1px solid #c2e0b3',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Download formatted Excel (.xls) report"
          >
            <span>📊</span>
            <span>Export Excel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const activeCount = branches.filter((b) => b.status === 'ACTIVE').length;
              exportToPdf({
                filename: 'melt-branches-report',
                title: 'Branches Directory Report',
                subtitle: `Total Branches: ${branches.length} (${activeCount} Active)`,
                filterSummary: { 'Total Branches': branches.length, 'Active Branches': activeCount },
                columns: [
                  { header: 'Branch Name', key: 'name' },
                  { header: 'Code', key: 'code' },
                  { header: 'Status', key: 'status' },
                  { header: 'Phone', key: 'phone' },
                  { header: 'Address', key: 'address' },
                ],
                data: branches.map((b) => ({
                  ...b,
                  phone: b.phone || 'N/A',
                  address: b.address || 'N/A',
                })),
              });
            }}
            style={{
              padding: '0.5rem 0.95rem',
              background: '#fff1f4',
              color: '#d61c5d',
              borderRadius: '9999px',
              border: '1px solid #ffd1dc',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Print or Save as PDF"
          >
            <span>📄</span>
            <span>Export PDF</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowCreateModal(true);
              setError(null);
            }}
            style={{
              padding: '0.55rem 1.25rem',
              background: '#d61c5d',
              color: '#ffffff',
              borderRadius: '9999px',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: '0 3px 0 #a3134a',
            }}
          >
            ➕ Add New Branch
          </button>
        </div>
      </div>

      {successMessage && (
        <div style={{ padding: '0.85rem 1.25rem', background: '#e6f9f0', border: '1px solid #a3e6be', borderRadius: '0.75rem', color: '#0d7d4d', fontWeight: 600 }}>
          {successMessage}
        </div>
      )}

      {error && (
        <div style={{ padding: '0.85rem 1.25rem', background: '#ffe5e5', border: '1px solid #ff9999', borderRadius: '0.75rem', color: '#a3134a', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Branches Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
        {branches.map((b) => (
          <div
            key={b.id}
            style={{
              background: '#ffffff',
              borderRadius: '1rem',
              border: '1px solid #f4d3dd',
              padding: '1.25rem',
              boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: '#d61c5d',
                    background: '#ffe5e5',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                  }}
                >
                  {b.code}
                </span>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 800,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    background: b.status === 'ACTIVE' ? '#d4edda' : '#f8d7da',
                    color: b.status === 'ACTIVE' ? '#155724' : '#721c24',
                    textTransform: 'uppercase',
                  }}
                >
                  {b.status}
                </span>
              </div>

              <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233', margin: '0 0 0.5rem 0' }}>
                {b.name}
              </h3>

              <div style={{ fontSize: '0.8125rem', color: '#6f5569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div>📍 {b.address || 'No address specified'}</div>
                <div>📞 {b.phone || 'No phone specified'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid #fceef2', paddingTop: '0.85rem' }}>
              <button
                type="button"
                onClick={() => openEditModal(b)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  background: '#fff1f4',
                  color: '#2b1233',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                ✏️ Edit
              </button>

              {onSelectBranchSettings && (
                <button
                  type="button"
                  onClick={() => onSelectBranchSettings(b.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    background: '#ffffff',
                    color: '#6f5569',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  ⚙️ Settings
                </button>
              )}

              <button
                type="button"
                onClick={() => handleToggleStatus(b)}
                disabled={loading}
                style={{
                  marginLeft: 'auto',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: b.status === 'ACTIVE' ? '#fff0f0' : '#e6f9f0',
                  color: b.status === 'ACTIVE' ? '#c0392b' : '#0d7d4d',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1rem',
              border: '1px solid #f4d3dd',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 40px -12px rgba(120, 20, 60, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233', margin: 0 }}>
                ➕ Create New Branch
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6f5569' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                  Branch Code (e.g. BR-SURAT-01) *
                </label>
                <input
                  type="text"
                  required
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                  placeholder="BR-SURAT-01"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Melt Ice Cream - Surat Outlet"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                  Address
                </label>
                <input
                  type="text"
                  value={createAddress}
                  onChange={(e) => setCreateAddress(e.target.value)}
                  placeholder="G-12, Palladium Mall, Surat"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                  Phone Number
                </label>
                <input
                  type="text"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    background: '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: '#d61c5d',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Creating...' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingBranch && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1rem',
              border: '1px solid #f4d3dd',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 40px -12px rgba(120, 20, 60, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2b1233', margin: 0 }}>
                ✏️ Edit Branch ({editingBranch.code})
              </h3>
              <button
                type="button"
                onClick={() => setEditingBranch(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6f5569' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                  Address
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                  Phone Number
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setEditingBranch(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    background: '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: '#d61c5d',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
