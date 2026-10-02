'use client';

import React from 'react';
import { OrderStatus, PaymentStatus } from '@/shared/enums/order.enum';

export interface StatusBadgeProps {
  status: OrderStatus | PaymentStatus | string;
  type?: 'order' | 'payment';
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, type: _type = 'order', size = 'md' }: StatusBadgeProps) {
  let bg = '#fff1f4';
  let color = '#2b1233';
  let border = '#f4d3dd';
  let icon = '•';

  const s = String(status).toUpperCase();

  if (s === OrderStatus.PENDING || s === PaymentStatus.PENDING) {
    bg = '#fff8e6';
    color = '#946200';
    border = '#ffe699';
    icon = '⏳';
  } else if (s === OrderStatus.CONFIRMED || s === PaymentStatus.RECORDED) {
    bg = '#e8f4fd';
    color = '#10569e';
    border = '#b6dbfa';
    icon = '✓';
  } else if (s === OrderStatus.PREPARING) {
    bg = '#f3e8ff';
    color = '#6b21a8';
    border = '#d8b4fe';
    icon = '🍦';
  } else if (s === OrderStatus.READY) {
    bg = '#e6f7eb';
    color = '#1e7b34';
    border = '#a3e6b5';
    icon = '🔔';
  } else if (s === OrderStatus.COMPLETED || s === PaymentStatus.VERIFIED || s === PaymentStatus.COMPLETED) {
    bg = '#e6f7eb';
    color = '#15803d';
    border = '#86efac';
    icon = '🎉';
  } else if (s === OrderStatus.CANCELLED || s === OrderStatus.EXPIRED || s === PaymentStatus.FAILED) {
    bg = '#fee2e2';
    color = '#b91c1c';
    border = '#fca5a5';
    icon = '✕';
  } else if (s === PaymentStatus.REFUNDED) {
    bg = '#f1f5f9';
    color = '#475569';
    border = '#cbd5e1';
    icon = '↩';
  }

  const isSmall = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? '0.25rem' : '0.35rem',
        padding: isSmall ? '0.15rem 0.5rem' : '0.25rem 0.75rem',
        borderRadius: '9999px',
        background: bg,
        color: color,
        border: `1px solid ${border}`,
        fontSize: isSmall ? '0.7rem' : '0.75rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: isSmall ? '0.75rem' : '0.85rem' }}>
        {icon}
      </span>
      <span>{s.replace(/_/g, ' ')}</span>
    </span>
  );
}
