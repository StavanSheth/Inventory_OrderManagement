'use client';

import React from 'react';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = '🍦',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div
      className="app-card"
      style={{
        padding: '3rem 1.5rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
      }}
    >
      <div
        style={{
          fontSize: '2.5rem',
          background: '#fff1f4',
          borderRadius: '9999px',
          width: '4.5rem',
          height: '4.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #f4d3dd',
          marginBottom: '1rem',
        }}
      >
        {icon}
      </div>
      <h3
        style={{
          fontFamily: 'var(--font-display-family)',
          fontSize: '1.25rem',
          fontWeight: 800,
          color: '#2b1233',
          margin: '0 0 0.4rem 0',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: '0.875rem',
            color: '#6f5569',
            maxWidth: '380px',
            margin: '0 0 1.25rem 0',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            padding: '0.6rem 1.4rem',
            borderRadius: '9999px',
            border: 'none',
            background: '#d61c5d',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '0.875rem',
            cursor: 'pointer',
            boxShadow: '0 3px 0 #a3134a',
            transition: 'all 0.15s ease',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
