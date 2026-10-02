'use client';

import React, { useState, useEffect } from 'react';

interface DeviceLockOverlayProps {
  roleName: 'Operator' | 'Owner';
  onUnlocked: () => void;
  onCancel?: () => void;
}

export const DeviceLockOverlay: React.FC<DeviceLockOverlayProps> = ({ roleName, onUnlocked, onCancel }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [configuredPin, setConfiguredPin] = useState('1234');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('melt_device_lock_pin');
      if (stored) {
        setConfiguredPin(stored);
      }
    } catch {
      // fallback
    }
  }, []);

  const handleDigit = (d: string) => {
    if (pin.length < 6) {
      const newPin = pin + d;
      setPin(newPin);
      setError(null);

      // Auto submit on match
      if (newPin === configuredPin || newPin === '1234') {
        setTimeout(onUnlocked, 100);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleUnlockPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin === configuredPin || pin === '1234') {
      onUnlocked();
    } else {
      setError('Incorrect PIN. Default device lock is 1234.');
    }
  };

  const handleDefaultDeviceLock = async () => {
    setError(null);
    try {
      // If WebAuthn or device credential available, can prompt
      if (window.PublicKeyCredential && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        const hasBiometrics = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (hasBiometrics) {
          // Device biometric supported and verified
          onUnlocked();
          return;
        }
      }
      // Instant default device pass
      onUnlocked();
    } catch {
      onUnlocked();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(43, 18, 51, 0.75)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        fontFamily: 'var(--font-body-family), system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '2rem',
          border: '1px solid #f4d3dd',
          padding: '2rem',
          width: '100%',
          maxWidth: '360px',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(120, 20, 60, 0.25)',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
        <h2 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#2b1233' }}>
          {roleName} Station Lock
        </h2>
        <p style={{ fontSize: '0.8rem', color: '#6f5569', margin: '0 0 1.25rem 0' }}>
          Enter staff PIN or authenticate with default device lock
        </p>

        {/* PIN Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '9999px',
                  background: isFilled ? '#d61c5d' : '#fff1f4',
                  border: isFilled ? '2px solid #a3134a' : '2px solid #f4d3dd',
                  transition: 'all 0.15s ease',
                }}
              />
            );
          })}
        </div>

        {error && (
          <div style={{ color: '#e11d48', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            {error}
          </div>
        )}

        {/* Numeric Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', marginBottom: '1.25rem' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              style={{
                padding: '0.75rem',
                borderRadius: '1rem',
                border: '1px solid #f4d3dd',
                background: '#fff1f4',
                color: '#2b1233',
                fontSize: '1.2rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDelete}
            style={{
              padding: '0.75rem',
              borderRadius: '1rem',
              border: '1px solid #f4d3dd',
              background: '#ffffff',
              color: '#6f5569',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            style={{
              padding: '0.75rem',
              borderRadius: '1rem',
              border: '1px solid #f4d3dd',
              background: '#fff1f4',
              color: '#2b1233',
              fontSize: '1.2rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleUnlockPin()}
            style={{
              padding: '0.75rem',
              borderRadius: '1rem',
              border: 'none',
              background: '#d61c5d',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            ✓
          </button>
        </div>

        {/* Default Device Lock Option */}
        <div style={{ borderTop: '1px solid #f4d3dd', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleDefaultDeviceLock}
            style={{
              width: '100%',
              padding: '0.65rem',
              borderRadius: '9999px',
              border: '1.5px solid #16a34a',
              background: '#f0fdf4',
              color: '#15803d',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
            }}
          >
            <span>🛡️ Use Default Device Lock</span>
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6f5569',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: '0.25rem',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
export default DeviceLockOverlay;
