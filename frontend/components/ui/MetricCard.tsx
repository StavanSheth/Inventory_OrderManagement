'use client';

import React from 'react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: {
    value: string;
    positive?: boolean;
  };
  onClick?: () => void;
  accentColor?: string;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  onClick,
  accentColor,
}: MetricCardProps) {
  const isClickable = typeof onClick === 'function';

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`app-card ${isClickable ? 'app-card-interactive' : ''}`}
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        borderLeft: accentColor ? `4px solid ${accentColor}` : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#6f5569',
          }}
        >
          {title}
        </span>
        {icon && (
          <span
            style={{
              fontSize: '1.25rem',
              background: '#fff1f4',
              borderRadius: '0.75rem',
              width: '2.25rem',
              height: '2.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #f4d3dd',
            }}
          >
            {icon}
          </span>
        )}
      </div>

      <div>
        <div
          style={{
            fontFamily: 'var(--font-display-family)',
            fontSize: 'clamp(1.5rem, 2.5vw, 2.1rem)',
            fontWeight: 900,
            color: '#2b1233',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </div>

        {(subtitle || trend) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {trend && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  borderRadius: '9999px',
                  padding: '0.15rem 0.5rem',
                  background: trend.positive ? '#e6f7eb' : '#ffe8ee',
                  color: trend.positive ? '#1e7b34' : '#d61c5d',
                }}
              >
                {trend.positive ? '↑' : '↓'} {trend.value}
              </span>
            )}
            {subtitle && (
              <span style={{ fontSize: '0.75rem', color: '#6f5569', fontWeight: 600 }}>
                {subtitle}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
