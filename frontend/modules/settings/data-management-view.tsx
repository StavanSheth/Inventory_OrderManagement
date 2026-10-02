'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ownerApiClient } from '../../services/owner-api-client';
import { apiClient } from '../../services/api-client';
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
  // Database Tables Explorer state
  const [tablesList, setTablesList] = useState<Record<string, number>>({});
  const [selectedTable, setSelectedTable] = useState<string>('users');
  const [tableRows, setTableRows] = useState<Record<string, unknown>[]>([]);
  const [loadingTables, setLoadingTables] = useState<boolean>(true);
  const [tableActionMsg, setTableActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tableSearch, setTableSearch] = useState<string>('');

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

  const fetchTablesData = useCallback(async (tableToLoad?: string) => {
    setLoadingTables(true);
    try {
      const target = tableToLoad ?? selectedTable;
      const res = await apiClient.request<{
        tables: Record<string, number>;
        currentTable: string;
        rows: Record<string, unknown>[];
      }>(`/api/v1/owner/data/tables?table=${target}`, {
        authenticated: true,
      });

      if (res.success) {
        setTablesList(res.data.tables);
        setSelectedTable(res.data.currentTable);
        setTableRows(res.data.rows);
      }
    } catch (err) {
      setTableActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load database tables',
      });
    } finally {
      setLoadingTables(false);
    }
  }, [selectedTable]);

  useEffect(() => {
    fetchTablesData();
  }, [fetchTablesData]);

  const handleDeleteRow = async (id: string) => {
    const ok = window.confirm(`Are you sure you want to permanently delete row "${id}" from ${selectedTable}?`);
    if (!ok) return;

    try {
      const res = await apiClient.request<{ success: boolean; message: string }>(
        '/api/v1/owner/data/tables',
        {
          method: 'DELETE',
          authenticated: true,
          body: JSON.stringify({ action: 'delete_row', table: selectedTable, id }),
        }
      );

      if (res.success) {
        setTableActionMsg({ type: 'success', text: res.data.message });
        fetchTablesData(selectedTable);
      } else {
        setTableActionMsg({ type: 'error', text: res.error.message || 'Failed to delete row' });
      }
    } catch (err) {
      setTableActionMsg({ type: 'error', text: err instanceof Error ? err.message : 'Delete error' });
    }
  };

  const handleClearTable = async () => {
    const ok = window.confirm(
      `⚠️ WARNING: Delete all records in table "${selectedTable}"? This action cannot be undone.`
    );
    if (!ok) return;

    try {
      const res = await apiClient.request<{ success: boolean; message: string }>(
        '/api/v1/owner/data/tables',
        {
          method: 'DELETE',
          authenticated: true,
          body: JSON.stringify({ action: 'clear_table', table: selectedTable }),
        }
      );

      if (res.success) {
        setTableActionMsg({ type: 'success', text: res.data.message });
        fetchTablesData(selectedTable);
      } else {
        setTableActionMsg({ type: 'error', text: res.error.message || 'Failed to clear table' });
      }
    } catch (err) {
      setTableActionMsg({ type: 'error', text: err instanceof Error ? err.message : 'Clear error' });
    }
  };

  const handleClearAllTables = async () => {
    const ok = window.confirm(
      '💣 EXTREME ACTION: Clear ALL operational database tables (orders, order items, payments, stock movements, logs)?'
    );
    if (!ok) return;

    try {
      const res = await apiClient.request<{ success: boolean; message: string }>(
        '/api/v1/owner/data/tables',
        {
          method: 'DELETE',
          authenticated: true,
          body: JSON.stringify({ action: 'clear_all' }),
        }
      );

      if (res.success) {
        setTableActionMsg({ type: 'success', text: res.data.message });
        fetchTablesData(selectedTable);
      } else {
        setTableActionMsg({ type: 'error', text: res.error.message || 'Failed to clear all tables' });
      }
    } catch (err) {
      setTableActionMsg({ type: 'error', text: err instanceof Error ? err.message : 'Clear all error' });
    }
  };

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

  // Filtered rows by search
  const filteredRows = tableRows.filter((r) => {
    if (!tableSearch.trim()) return true;
    const q = tableSearch.toLowerCase();
    return Object.values(r).some((v) => String(v).toLowerCase().includes(q));
  });

  const columnHeaders = tableRows.length > 0 ? Object.keys(tableRows[0]) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Section 1: Database Tables Management (Client Table, Inventory Table, Orders Table, etc.) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '1.25rem',
          border: '1px solid #f4d3dd',
          padding: '1.5rem',
          boxShadow: '0 8px 24px -12px rgba(120, 20, 60, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2b1233', margin: '0 0 0.25rem 0' }}>
              🗄️ Database Tables & Data Management
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0 }}>
              Inspect clients table, inventory table, orders table, and delete single rows, entire tables, or all operational records at one go.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleClearTable}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                border: '1px solid #fecdd3',
                background: '#fff1f2',
                color: '#e11d48',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              ⚠️ Clear {selectedTable} Table
            </button>
            <button
              onClick={handleClearAllTables}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                border: 'none',
                background: '#be123c',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: '0 2px 0 #881337',
              }}
            >
              💣 Clear All Tables at One Go
            </button>
          </div>
        </div>

        {/* Table Selector Pills */}
        <div
          style={{
            display: 'flex',
            gap: '0.45rem',
            overflowX: 'auto',
            paddingBottom: '0.65rem',
            marginBottom: '1rem',
            borderBottom: '1px solid #f4d3dd',
          }}
        >
          {Object.entries(tablesList).map(([tableName, count]) => {
            const isSelected = selectedTable === tableName;
            return (
              <button
                key={tableName}
                onClick={() => {
                  setSelectedTable(tableName);
                  fetchTablesData(tableName);
                }}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '9999px',
                  border: isSelected ? 'none' : '1px solid #f4d3dd',
                  background: isSelected ? '#d61c5d' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#2b1233',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                  boxShadow: isSelected ? '0 2px 0 #a3134a' : 'none',
                }}
              >
                <span>{tableName}</span>
                <span
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.25)' : '#fff1f4',
                    color: isSelected ? '#ffffff' : '#d61c5d',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 900,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Status Message */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={`Search ${selectedTable} table records...`}
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              border: '1px solid #f4d3dd',
              fontSize: '0.8125rem',
              minWidth: '260px',
              outline: 'none',
            }}
          />

          <span style={{ fontSize: '0.75rem', color: '#6f5569', fontWeight: 700 }}>
            Showing {filteredRows.length} of {tableRows.length} loaded records
          </span>
        </div>

        {tableActionMsg && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.75rem',
              marginBottom: '1rem',
              fontSize: '0.8125rem',
              fontWeight: 700,
              background: tableActionMsg.type === 'success' ? '#e6f9f0' : '#fee2e2',
              color: tableActionMsg.type === 'success' ? '#0d7d4d' : '#991b1b',
              border: tableActionMsg.type === 'success' ? '1px solid #a3e6be' : '1px solid #fca5a5',
            }}
          >
            {tableActionMsg.text}
          </div>
        )}

        {/* Records Table */}
        {loadingTables ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6f5569', fontWeight: 700 }}>
            Loading table {selectedTable}...
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6f5569', fontWeight: 700, background: '#fff1f4', borderRadius: '1rem' }}>
            No records found in table {selectedTable}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '420px', border: '1px solid #f4d3dd', borderRadius: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff1f4', zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid #f4d3dd', color: '#6f5569', fontWeight: 800 }}>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Action</th>
                  {columnHeaders.map((col) => (
                    <th key={col} style={{ padding: '0.65rem 0.85rem', whiteSpace: 'nowrap' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const rowId = String(row.id || (row as Record<string, unknown>).rowid || idx);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #fbe8ee' }}>
                      <td style={{ padding: '0.55rem 0.85rem' }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(rowId)}
                          title="Delete this row"
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '0.4rem',
                            border: '1px solid #fca5a5',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            fontWeight: 800,
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </td>
                      {columnHeaders.map((col) => (
                        <td
                          key={col}
                          style={{
                            padding: '0.55rem 0.85rem',
                            color: '#2b1233',
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {typeof row[col] === 'object' && row[col] !== null
                            ? JSON.stringify(row[col])
                            : String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Branch Lifecycle & Safe Deactivation */}
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
            onClick={handlePreview}
            disabled={previewLoading || !selectedBranchId}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '9999px',
              border: '1px solid #f4d3dd',
              background: '#ffffff',
              color: '#2b1233',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            {previewLoading ? 'Inspecting...' : 'Inspect Dependencies'}
          </button>

          <button
            onClick={handleDeactivate}
            disabled={deactivateLoading || !selectedBranchId}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '9999px',
              border: 'none',
              background: '#d61c5d',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              boxShadow: '0 2px 0 #a3134a',
            }}
          >
            {deactivateLoading ? 'Deactivating...' : 'Deactivate Branch'}
          </button>
        </div>

        {branchMsg && (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              borderRadius: '0.75rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              background: branchMsg.type === 'success' ? '#e6f9f0' : '#ffe5e5',
              color: branchMsg.type === 'success' ? '#0d7d4d' : '#a3134a',
              border: branchMsg.type === 'success' ? '1px solid #a3e6be' : '1px solid #ff9999',
            }}
          >
            {branchMsg.text}
          </div>
        )}

        {previewData && (
          <div style={{ background: '#fff1f4', borderRadius: '0.75rem', padding: '1rem', border: '1px solid #f4d3dd' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#2b1233', fontWeight: 800 }}>
              Dependency Preview for Branch ({previewData.branchId})
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem', color: '#6f5569' }}>
              <li>Orders Count: <strong>{previewData.counts?.orders ?? 0}</strong></li>
              <li>Inventory Movements: <strong>{previewData.counts?.inventoryMovements ?? 0}</strong></li>
              <li>Products: <strong>{previewData.counts?.products ?? 0}</strong></li>
              <li>Staff Memberships: <strong>{previewData.counts?.memberships ?? 0}</strong></li>
            </ul>
          </div>
        )}
      </div>

      {/* Section 3: Customer Data Scrubbing */}
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
            👤 Customer Privacy Anonymization
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0 }}>
            Scrub customer PII and revoke credentials while safely preserving order history for financial auditing.
          </p>
        </div>

        <form onSubmit={handleAnonymize} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Enter customer user ID (e.g. usr_cust_12345)"
            value={customerUserId}
            onChange={(e) => setCustomerUserId(e.target.value)}
            style={{
              flex: 1,
              minWidth: '260px',
              padding: '0.55rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid #f4d3dd',
              fontSize: '0.875rem',
            }}
          />
          <button
            type="submit"
            disabled={anonLoading}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '9999px',
              border: 'none',
              background: '#d61c5d',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              boxShadow: '0 2px 0 #a3134a',
            }}
          >
            {anonLoading ? 'Anonymizing...' : 'Scrub Customer Data'}
          </button>
        </form>

        {anonError && (
          <div style={{ padding: '0.85rem 1.25rem', background: '#ffe5e5', border: '1px solid #ff9999', borderRadius: '0.75rem', color: '#a3134a', fontWeight: 600 }}>
            {anonError}
          </div>
        )}

        {anonResult && (
          <div style={{ padding: '1rem', background: '#e6f9f0', border: '1px solid #a3e6be', borderRadius: '0.75rem', color: '#0d7d4d', fontSize: '0.875rem' }}>
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
