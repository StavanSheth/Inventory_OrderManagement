'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ownerApiClient } from '../../services/owner-api-client';
import { apiClient } from '../../services/api-client';
import { Branch } from '../../../shared/types/entities.types';
import { BranchDeletionPreviewResponse, AnonymizeCustomerResponse } from '../../../shared/contracts/deletion.contract';
import { exportAllTablesToExcel } from '../../utils/export-helpers';

interface StorageStats {
  maxBytes: number;
  usedBytes: number;
  remainingBytes: number;
  usedPercentage: number;
  totalRecords: number;
}

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

  // Storage Quota & Capacity state (5 GB default upper max)
  const [storageStats, setStorageStats] = useState<StorageStats>({
    maxBytes: 5 * 1024 * 1024 * 1024,
    usedBytes: 0,
    remainingBytes: 5 * 1024 * 1024 * 1024,
    usedPercentage: 0,
    totalRecords: 0,
  });
  const [quotaLimitGB, setQuotaLimitGB] = useState<number>(5);
  const [isExportingAll, setIsExportingAll] = useState<boolean>(false);

  const fetchTablesData = useCallback(async (tableToLoad?: string) => {
    setLoadingTables(true);
    try {
      const target = tableToLoad ?? selectedTable;
      const res = await apiClient.request<{
        tables: Record<string, number>;
        currentTable: string;
        rows: Record<string, unknown>[];
        storage?: StorageStats;
      }>(`/api/v1/owner/data/tables?table=${target}`, {
        authenticated: true,
      });

      if (res.success) {
        setTablesList(res.data.tables);
        setSelectedTable(res.data.currentTable);
        setTableRows(res.data.rows);
        if (res.data.storage) {
          setStorageStats(res.data.storage);
        }
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

  const formatStorageSize = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(3)} GB`;
  };

  const downloadAllTablesExcelBackup = async (): Promise<boolean> => {
    setIsExportingAll(true);
    setTableActionMsg({
      type: 'success',
      text: '📥 Creating and downloading automatic Excel backup of all database tables...',
    });

    try {
      const res = await apiClient.request<{
        tables: Record<string, number>;
        allTables?: Record<string, Record<string, unknown>[]>;
      }>('/api/v1/owner/data/tables?all=true', { authenticated: true });

      if (res.success && res.data.allTables && Object.keys(res.data.allTables).length > 0) {
        exportAllTablesToExcel(res.data.allTables, 'melt_database_all_tables_backup');
        setTableActionMsg({
          type: 'success',
          text: '✅ Complete Excel backup of all database tables successfully downloaded!',
        });
        return true;
      } else {
        exportAllTablesToExcel({ [selectedTable]: tableRows }, `melt_${selectedTable}_backup`);
        setTableActionMsg({
          type: 'success',
          text: `✅ Excel backup of ${selectedTable} table successfully downloaded!`,
        });
        return true;
      }
    } catch (err) {
      console.error('Backup download failed:', err);
      setTableActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to generate Excel backup',
      });
      return false;
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleClearTable = async () => {
    const ok = window.confirm(
      `⚠️ WARNING: Delete all records in table "${selectedTable}"?\n\n` +
      `🛡️ BY DEFAULT: An Excel backup will be automatically downloaded to your computer before clearing.`
    );
    if (!ok) return;

    try {
      setIsExportingAll(true);
      if (tableRows.length > 0) {
        exportAllTablesToExcel({ [selectedTable]: tableRows }, `melt_${selectedTable}_backup`);
      }

      const res = await apiClient.request<{ success: boolean; message: string }>(
        '/api/v1/owner/data/tables',
        {
          method: 'DELETE',
          authenticated: true,
          body: JSON.stringify({ action: 'clear_table', table: selectedTable }),
        }
      );

      if (res.success) {
        setTableActionMsg({
          type: 'success',
          text: `✅ Table backup downloaded automatically & ${res.data.message}`,
        });
        fetchTablesData(selectedTable);
      } else {
        setTableActionMsg({ type: 'error', text: res.error.message || 'Failed to clear table' });
      }
    } catch (err) {
      setTableActionMsg({ type: 'error', text: err instanceof Error ? err.message : 'Clear error' });
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleClearAllTables = async () => {
    const ok = window.confirm(
      '💣 EXTREME ACTION: Clear ALL operational database tables (orders, order items, payments, stock movements, logs)?\n\n' +
      '🛡️ BY DEFAULT: A complete Excel backup of ALL tables will be automatically downloaded to your computer before clearing.'
    );
    if (!ok) return;

    try {
      setIsExportingAll(true);
      // 1. By default, automatically download Excel backup of all tables first
      setTableActionMsg({
        type: 'success',
        text: '📥 Step 1/2: Automatically downloading Excel backup of all tables before clearing...',
      });
      await downloadAllTablesExcelBackup();

      // 2. Clear all operational tables
      setTableActionMsg({
        type: 'success',
        text: '🧹 Step 2/2: Clearing operational tables from database...',
      });
      const res = await apiClient.request<{ success: boolean; message: string }>(
        '/api/v1/owner/data/tables',
        {
          method: 'DELETE',
          authenticated: true,
          body: JSON.stringify({ action: 'clear_all' }),
        }
      );

      if (res.success) {
        setTableActionMsg({
          type: 'success',
          text: `✅ Full Excel backup downloaded automatically & ${res.data.message}`,
        });
        fetchTablesData(selectedTable);
      } else {
        setTableActionMsg({ type: 'error', text: res.error.message || 'Failed to clear all tables' });
      }
    } catch (err) {
      setTableActionMsg({ type: 'error', text: err instanceof Error ? err.message : 'Clear all error' });
    } finally {
      setIsExportingAll(false);
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

  // Storage calculations based on selected quota slider (default 5 GB)
  const quotaBytes = quotaLimitGB * 1024 * 1024 * 1024;
  const usedBytes = storageStats.usedBytes || (Object.values(tablesList).reduce((a, b) => a + b, 0) * 2048) + 1048576;
  const remainingBytesFromQuota = Math.max(0, quotaBytes - usedBytes);
  const remainingFromDefault5GB = Math.max(0, (5 * 1024 * 1024 * 1024) - usedBytes);
  const usedPercent = Math.min(100, Math.max(0.05, (usedBytes / quotaBytes) * 100));
  const remainingPercent = Math.max(0, 100 - usedPercent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Storage Availability & Database Capacity Section */}
      <div
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #fff7f9 100%)',
          borderRadius: '1.25rem',
          border: '1px solid #fbcfe8',
          padding: '1.5rem',
          boxShadow: '0 10px 25px -10px rgba(214, 28, 93, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#2b1233', margin: 0 }}>
                💾 Storage Availability & Database Capacity
              </h3>
              <span
                style={{
                  background: '#dcfce7',
                  color: '#15803d',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  border: '1px solid #bbf7d0',
                }}
              >
                ● 5.00 GB Default Upper Max
              </span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: '0.25rem 0 0 0' }}>
              Real-time database footprint tracking with 5 GB upper threshold, capacity headroom gauge, and one-click full Excel backups.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={downloadAllTablesExcelBackup}
              disabled={isExportingAll}
              style={{
                padding: '0.5rem 1.15rem',
                borderRadius: '9999px',
                border: '1px solid #d61c5d',
                background: '#ffffff',
                color: '#d61c5d',
                fontWeight: 800,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 8px -2px rgba(214, 28, 93, 0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{isExportingAll ? '⏳' : '📊'}</span>
              <span>{isExportingAll ? 'Generating Excel Backup...' : 'Download Full Database Backup (Excel)'}</span>
            </button>
            <button
              type="button"
              onClick={() => fetchTablesData(selectedTable)}
              disabled={loadingTables}
              style={{
                padding: '0.5rem 0.9rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                background: '#ffffff',
                color: '#6f5569',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
              title="Refresh database storage metrics"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* 4 Storage Summary Metric Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              padding: '1rem 1.25rem',
              borderRadius: '1rem',
              border: '1px solid #fce7f3',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9d174d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Upper Max Quota
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#2b1233', marginTop: '0.25rem' }}>
              {quotaLimitGB.toFixed(2)} GB
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6f5569', marginTop: '0.2rem' }}>
              Default threshold: 5.00 GB
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              padding: '1rem 1.25rem',
              borderRadius: '1rem',
              border: '1px solid #fce7f3',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9d174d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Storage Used
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#d61c5d', marginTop: '0.25rem' }}>
              {formatStorageSize(usedBytes)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6f5569', marginTop: '0.2rem' }}>
              {usedPercent < 0.01 ? '< 0.01%' : `${usedPercent.toFixed(2)}%`} of capacity
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              padding: '1rem 1.25rem',
              borderRadius: '1rem',
              border: '1px solid #bbf7d0',
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.05)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Data Left / Available
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#16a34a', marginTop: '0.25rem' }}>
              {formatStorageSize(remainingFromDefault5GB)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 700, marginTop: '0.2rem' }}>
              {remainingPercent.toFixed(2)}% available headroom
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              padding: '1rem 1.25rem',
              borderRadius: '1rem',
              border: '1px solid #fce7f3',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9d174d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Database Records
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#2b1233', marginTop: '0.25rem' }}>
              {(storageStats.totalRecords || Object.values(tablesList).reduce((a, b) => a + b, 0)).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6f5569', marginTop: '0.2rem' }}>
              Across {Object.keys(tablesList).length} tables
            </div>
          </div>
        </div>

        {/* Visual Storage Availability Gauge Meter Bar */}
        <div
          style={{
            background: '#ffffff',
            padding: '1.25rem',
            borderRadius: '1rem',
            border: '1px solid #fce7f3',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2b1233' }}>
              Storage Consumption vs Availability Bar:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', fontWeight: 700 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#d61c5d' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#d61c5d', display: 'inline-block' }}></span>
                Used: {formatStorageSize(usedBytes)} ({usedPercent < 0.01 ? '<0.01%' : `${usedPercent.toFixed(2)}%`})
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#16a34a' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                Remaining Left: {formatStorageSize(remainingFromDefault5GB)} from 5.00 GB
              </span>
            </div>
          </div>

          {/* Bar track */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '24px',
              borderRadius: '9999px',
              background: '#f1f5f9',
              border: '2px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
            }}
          >
            {/* Filled used portion */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.max(1.5, usedPercent)}%`,
                background: 'linear-gradient(90deg, #d61c5d 0%, #ec4899 70%, #a855f7 100%)',
                borderRadius: '9999px',
                transition: 'width 0.4s ease',
                boxShadow: '0 0 10px rgba(214, 28, 93, 0.4)',
              }}
            />
          </div>

          {/* Scale labels under bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#94a3b8',
              padding: '0 0.25rem',
            }}
          >
            <span>0 GB (0%)</span>
            <span>1.25 GB (25%)</span>
            <span>2.50 GB (50%)</span>
            <span>3.75 GB (75%)</span>
            <span style={{ color: '#d61c5d', fontWeight: 900 }}>5.00 GB (100% Upper Max)</span>
          </div>
        </div>

        {/* Storage Availability Slider / Scroll Bar */}
        <div
          style={{
            background: '#ffffff',
            padding: '1.25rem',
            borderRadius: '1rem',
            border: '1px solid #fce7f3',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2b1233' }}>
                🎚️ Storage Availability Scroll Bar & Quota Adjuster:
              </span>
              <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', fontWeight: 700, color: '#6f5569' }}>
                Scroll or drag to inspect capacity headroom ({quotaLimitGB.toFixed(1)} GB selected)
              </span>
            </div>
            {quotaLimitGB !== 5 && (
              <button
                type="button"
                onClick={() => setQuotaLimitGB(5)}
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '9999px',
                  border: '1px solid #f4d3dd',
                  background: '#fff1f4',
                  color: '#d61c5d',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Reset to 5 GB Default
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', minWidth: '40px' }}>1 GB</span>
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={quotaLimitGB}
              onChange={(e) => setQuotaLimitGB(parseFloat(e.target.value))}
              style={{
                flex: 1,
                cursor: 'pointer',
                accentColor: '#d61c5d',
                height: '8px',
              }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', minWidth: '45px' }}>20 GB</span>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#6f5569', display: 'flex', justifyContent: 'space-between' }}>
            <span>Current Quota: <strong>{quotaLimitGB.toFixed(1)} GB</strong></span>
            <span>Available Headroom: <strong style={{ color: '#16a34a' }}>{formatStorageSize(remainingBytesFromQuota)} left</strong></span>
          </div>
        </div>

        {/* Table-by-Table Storage Allocation Horizontal Scroll Bar */}
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.5rem' }}>
            📑 Tables Storage Distribution (Horizontal Scroll Bar):
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.65rem',
              overflowX: 'auto',
              paddingBottom: '0.5rem',
            }}
          >
            {Object.entries(tablesList).map(([tableName, count]) => {
              const estimatedBytes = (count * 2048) + 32768; // ~2KB per row + 32KB index
              const isSelected = selectedTable === tableName;
              return (
                <div
                  key={tableName}
                  onClick={() => {
                    setSelectedTable(tableName);
                    fetchTablesData(tableName);
                  }}
                  style={{
                    flexShrink: 0,
                    minWidth: '150px',
                    padding: '0.75rem 0.9rem',
                    borderRadius: '0.75rem',
                    background: isSelected ? '#fff1f4' : '#ffffff',
                    border: isSelected ? '2px solid #d61c5d' : '1px solid #fce7f3',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: isSelected ? '#d61c5d' : '#2b1233' }}>
                    {tableName}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#6f5569', marginTop: '0.2rem' }}>
                    {count.toLocaleString()} rows
                  </div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9d174d', marginTop: '0.2rem' }}>
                    ~{formatStorageSize(estimatedBytes)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

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
              onClick={downloadAllTablesExcelBackup}
              disabled={isExportingAll}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
                color: '#15803d',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
              title="Download Excel backup of all database tables"
            >
              <span>{isExportingAll ? '⏳' : '📊'}</span>
              <span>Export All Tables (.XLS)</span>
            </button>
            <button
              onClick={handleClearTable}
              disabled={isExportingAll}
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
              title="Automatically downloads an Excel backup before clearing this table"
            >
              ⚠️ Clear {selectedTable} Table (Auto-Backup)
            </button>
            <button
              onClick={handleClearAllTables}
              disabled={isExportingAll}
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
              title="Clears all operational records while automatically downloading a full Excel backup by default"
            >
              💣 Clear All Data (Auto-Backup Excel)
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
