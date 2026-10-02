'use client';

import React, { useEffect } from 'react';

export interface ResponsiveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function ResponsiveDialog({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = '580px',
}: ResponsiveDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="app-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className="app-sheet-content"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Handle Indicator */}
        <div className="sm:hidden" style={{ width: '40px', height: '4px', background: '#e2cbd4', borderRadius: '9999px', margin: '0.65rem auto 0 auto' }} />

        {/* Dialog Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #f4d3dd',
          }}
        >
          <div>
            <h2
              id="dialog-title"
              style={{
                fontFamily: 'var(--font-display-family)',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#2b1233',
                margin: 0,
              }}
            >
              {title}
            </h2>
            {subtitle && (
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: '#6f5569' }}>
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: '#fff1f4',
              border: '1px solid #f4d3dd',
              borderRadius: '9999px',
              width: '2rem',
              height: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6f5569',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.875rem',
              transition: 'all 0.15s ease',
            }}
          >
            ✕
          </button>
        </div>

        {/* Dialog Body */}
        <div style={{ padding: '1.5rem' }}>{children}</div>
      </div>
    </div>
  );
}
