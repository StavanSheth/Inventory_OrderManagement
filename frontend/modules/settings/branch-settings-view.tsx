'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ownerApiClient } from '../../services/owner-api-client';
import { UpdateBranchSettingsRequest } from '../../../shared/contracts/settings.contract';
import { Branch, BranchSettings } from '../../../shared/types/entities.types';

interface BranchSettingsViewProps {
  branches: Branch[];
  selectedBranchId: string;
  onBranchChange: (branchId: string) => void;
}

export const BranchSettingsView: React.FC<BranchSettingsViewProps> = ({
  branches,
  selectedBranchId,
  onBranchChange,
}) => {
  const [_settings, setSettings] = useState<BranchSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [timeoutValue, setTimeoutValue] = useState<number>(60);
  const [timeoutUnit, setTimeoutUnit] = useState<'MINUTES' | 'HOURS' | 'DAYS'>('MINUTES');
  const [orderExpiry, setOrderExpiry] = useState<number>(30);
  const [orderEditWindow, setOrderEditWindow] = useState<number>(10);
  const [isOperational, setIsOperational] = useState<boolean>(true);
  const [openingTime, setOpeningTime] = useState<string>('10:00');
  const [closingTime, setClosingTime] = useState<string>('23:00');
  const [devicePin, setDevicePin] = useState<string>('1234');
  const [newDevicePin, setNewDevicePin] = useState<string>('');
  const [pinChangeMsg, setPinChangeMsg] = useState<string | null>(null);

  const fetchBranchDetail = useCallback(async () => {
    if (!selectedBranchId || selectedBranchId === 'ALL') return;

    setLoading(true);
    setError(null);
    try {
      const res = await ownerApiClient.getBranch(selectedBranchId);
      if (res.success && res.data.settings) {
        const s = res.data.settings;
        setSettings(s);
        setTimeoutValue(s.session_timeout_value ?? 60);
        setTimeoutUnit((s.session_timeout_unit as 'MINUTES' | 'HOURS' | 'DAYS') ?? 'MINUTES');
        setOrderExpiry(s.order_expiry_minutes ?? 30);
        setOrderEditWindow(s.order_edit_window_minutes ?? 10);

        if (s.configuration_json) {
          try {
            const config = JSON.parse(s.configuration_json);
            if (typeof config.isOperational === 'boolean') setIsOperational(config.isOperational);
            if (config.openingTime) setOpeningTime(config.openingTime);
            if (config.closingTime) setClosingTime(config.closingTime);
          } catch {
            // fallback
          }
        }
      } else if (res.success) {
        setTimeoutValue(60);
        setTimeoutUnit('MINUTES');
        setOrderExpiry(30);
        setOrderEditWindow(10);
        setIsOperational(true);
        setOpeningTime('10:00');
        setClosingTime('23:00');
      } else {
        setError(res.error.message || 'Failed to load branch settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    fetchBranchDetail();
    try {
      const stored = localStorage.getItem('melt_device_lock_pin');
      if (stored) setDevicePin(stored);
    } catch {}
  }, [fetchBranchDetail]);

  const handleUpdatePin = () => {
    if (!newDevicePin || newDevicePin.length < 4) {
      setPinChangeMsg('PIN must be at least 4 digits');
      return;
    }
    try {
      localStorage.setItem('melt_device_lock_pin', newDevicePin);
      setDevicePin(newDevicePin);
      setNewDevicePin('');
      setPinChangeMsg('Device lock PIN updated successfully!');
      setTimeout(() => setPinChangeMsg(null), 3500);
    } catch {
      setPinChangeMsg('Failed to persist PIN');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId || selectedBranchId === 'ALL') {
      setError('Please select a specific branch to configure settings.');
      return;
    }

    if (orderExpiry < orderEditWindow) {
      setError('Order expiry timeout cannot be less than the order edit window.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: UpdateBranchSettingsRequest = {
        session_timeout_value: timeoutValue,
        session_timeout_unit: timeoutUnit,
        order_expiry_minutes: orderExpiry,
        order_edit_window_minutes: orderEditWindow,
        configuration_json: JSON.stringify({
          isOperational,
          openingTime: openingTime.trim() || undefined,
          closingTime: closingTime.trim() || undefined,
        }),
      };

      const res = await ownerApiClient.updateBranchSettings(selectedBranchId, payload);
      if (res.success) {
        setSettings(res.data.settings);
        setSuccess('Branch settings and operational limits updated successfully!');
      } else {
        setError(res.error.message || 'Failed to save branch settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const calculateEffectiveMinutes = () => {
    switch (timeoutUnit) {
      case 'DAYS':
        return timeoutValue * 24 * 60;
      case 'HOURS':
        return timeoutValue * 60;
      case 'MINUTES':
      default:
        return timeoutValue;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}>
      {/* Branch Selector Bar */}
      <div
        style={{
          background: '#ffffff',
          padding: '1.25rem 1.5rem',
          borderRadius: '1rem',
          border: '1px solid #f4d3dd',
          boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#6f5569', textTransform: 'uppercase' }}>
          Select Branch:
        </span>
        <select
          value={selectedBranchId}
          onChange={(e) => onBranchChange(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            border: '1.5px solid #f4d3dd',
            background: '#fff1f4',
            color: '#2b1233',
            fontWeight: 700,
            fontSize: '0.875rem',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
      </div>

      {success && (
        <div style={{ padding: '0.85rem 1.25rem', background: '#e6f9f0', border: '1px solid #a3e6be', borderRadius: '0.75rem', color: '#0d7d4d', fontWeight: 600 }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{ padding: '0.85rem 1.25rem', background: '#ffe5e5', border: '1px solid #ff9999', borderRadius: '0.75rem', color: '#a3134a', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Settings Form */}
      <form
        onSubmit={handleSave}
        style={{
          background: '#ffffff',
          borderRadius: '1rem',
          border: '1px solid #f4d3dd',
          padding: '1.5rem',
          boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233', margin: '0 0 0.25rem 0' }}>
            ⏱️ Session Timeout & Security Policy
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0 }}>
            Configures inactivity expiration for operator and reception terminal sessions for this branch.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                Timeout Value *
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={timeoutValue}
                onChange={(e) => setTimeoutValue(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                Timeout Unit *
              </label>
              <select
                value={timeoutUnit}
                onChange={(e) => setTimeoutUnit(e.target.value as 'MINUTES' | 'HOURS' | 'DAYS')}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="MINUTES">Minutes</option>
                <option value="HOURS">Hours</option>
                <option value="DAYS">Days</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#8c7086' }}>
            Effective timeout: <strong>{calculateEffectiveMinutes()} minutes</strong> ({timeoutValue} {timeoutUnit.toLowerCase()}).
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #fceef2', margin: 0 }} />

        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233', margin: '0 0 0.25rem 0' }}>
            ⏳ Order Expiry & Edit Thresholds
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0 }}>
            Governs order life-cycle transitions and customer self-service edit windows.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                Unpaid Order Expiry (Minutes) *
              </label>
              <input
                type="number"
                min="5"
                max="1440"
                value={orderExpiry}
                onChange={(e) => setOrderExpiry(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#8c7086' }}>
                Pending orders expire automatically if not verified.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                Order Edit Window (Minutes) *
              </label>
              <input
                type="number"
                min="0"
                max="120"
                value={orderEditWindow}
                onChange={(e) => setOrderEditWindow(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#8c7086' }}>
                Customer can modify confirmed orders within this window.
              </span>
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #fceef2', margin: 0 }} />

        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233', margin: '0 0 0.25rem 0' }}>
            🕒 Operating Hours & Availability
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0 }}>
            Control whether customers can place orders and branch opening schedules.
          </p>

          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              type="checkbox"
              id="isOperational"
              checked={isOperational}
              onChange={(e) => setIsOperational(e.target.checked)}
              style={{ width: '1.25rem', height: '1.25rem', accentColor: '#d61c5d' }}
            />
            <label htmlFor="isOperational" style={{ fontWeight: 700, fontSize: '0.875rem', color: '#2b1233', cursor: 'pointer' }}>
              Branch is currently operational and accepting new orders
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                Opening Time
              </label>
              <input
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.25rem' }}>
                Closing Time
              </label>
              <input
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #fceef2', margin: 0 }} />

        {/* Device Lock & PIN Security Settings */}
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233', margin: '0 0 0.25rem 0' }}>
            🔒 Staff & Owner Device Lock Security
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0 }}>
            Configure default device lock authentication and security PIN for Operator and Owner desks. Can be changed from settings only.
          </p>

          <div style={{ marginTop: '1rem', background: '#fff1f4', border: '1px solid #f4d3dd', borderRadius: '1rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>
                  Current Device Lock PIN
                </span>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#2b1233', letterSpacing: '0.15em', marginTop: '0.15rem' }}>
                  •••• ({devicePin.length} digits configured)
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontWeight: 800, border: '1px solid #86efac' }}>
                ✓ Default Device Lock Allowed
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="password"
                maxLength={6}
                placeholder="Enter new 4-6 digit PIN"
                value={newDevicePin}
                onChange={(e) => setNewDevicePin(e.target.value.replace(/\D/g, ''))}
                style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                  width: '200px',
                  background: '#ffffff',
                }}
              />
              <button
                type="button"
                onClick={handleUpdatePin}
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
                Update PIN
              </button>
            </div>

            {pinChangeMsg && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: pinChangeMsg.includes('success') ? '#16a34a' : '#e11d48' }}>
                {pinChangeMsg}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button
            type="submit"
            disabled={saving || loading}
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: '9999px',
              border: 'none',
              background: '#d61c5d',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: '0 3px 0 #a3134a',
            }}
          >
            {saving ? 'Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};
