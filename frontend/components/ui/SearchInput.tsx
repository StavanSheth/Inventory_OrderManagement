'use client';

import React from 'react';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  ariaLabel = 'Search input',
}: SearchInputProps) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '0.85rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#6f5569',
          fontSize: '0.9rem',
          pointerEvents: 'none',
        }}
      >
        🔍
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{
          width: '100%',
          padding: '0.55rem 2.2rem 0.55rem 2.4rem',
          borderRadius: '9999px',
          border: '1px solid #f4d3dd',
          background: '#ffffff',
          color: '#2b1233',
          fontSize: '0.875rem',
          fontWeight: 600,
          outline: 'none',
          boxShadow: '0 2px 8px -4px rgba(120,20,60,0.08)',
          transition: 'all 0.15s ease',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            border: 'none',
            background: 'transparent',
            color: '#6f5569',
            fontSize: '0.8rem',
            cursor: 'pointer',
            padding: '0.2rem',
            borderRadius: '9999px',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
