'use client';

import React, { useState } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { Order, Payment } from '../../../shared/types/entities.types';
import { PaymentMethod, PaymentStatus, OrderStatus } from '../../../shared/enums/order.enum';

interface ReceptionPaymentDialogProps {
  branchId: string;
  order: Order;
  payments: Payment[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ReceptionPaymentDialog: React.FC<ReceptionPaymentDialogProps> = ({
  branchId,
  order,
  payments,
  onClose,
  onSuccess,
}) => {
  const verifiedPaid = payments
    .filter((p) => p.status === PaymentStatus.VERIFIED)
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingPayments = payments.filter((p) => p.status === PaymentStatus.RECORDED);

  const payableAmount = Math.max(0, Math.round((order.total - verifiedPaid) * 100) / 100);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [amount, setAmount] = useState<number>(payableAmount);
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setActionSuccess(null);

    try {
      const noteWithRef = transactionRef
        ? `${notes ? notes + ' | ' : ''}Ref: ${transactionRef}`
        : notes || undefined;

      const res = await orderApiClient.recordPayment(branchId, order.id, {
        method: paymentMethod,
        amount: Number(amount),
        notes: noteWithRef,
      });

      if (res.success) {
        setActionSuccess('Payment recorded successfully at reception.');
        onSuccess();
      } else {
        setError(res.error.message || 'Failed to record payment');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPayment = async (paymentId: string) => {
    setLoading(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await orderApiClient.verifyPayment(branchId, order.id, paymentId, 'Verified at reception');
      if (res.success) {
        setActionSuccess('Payment verified successfully.');
        onSuccess();
      } else {
        setError(res.error.message || 'Failed to verify payment');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOrder = async () => {
    setLoading(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await orderApiClient.confirmOrder(branchId, order.id);
      if (res.success) {
        setActionSuccess('Order confirmed successfully!');
        onSuccess();
        setTimeout(onClose, 1000);
      } else {
        setError(res.error.message || 'Failed to confirm order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const isFullyVerified = verifiedPaid >= order.total;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          maxWidth: '550px',
          width: '100%',
          padding: '1.5rem',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111827' }}>
              Reception Payment & Verification
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Order: <span style={{ fontWeight: 600, color: '#111827' }}>{order.order_number}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              lineHeight: 1,
              cursor: 'pointer',
              color: '#9ca3af',
            }}
          >
            &times;
          </button>
        </div>

        {/* Order Balance Overview */}
        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#4b5563' }}>Order Total:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>₹{order.total.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#4b5563' }}>Verified Paid:</span>
            <span style={{ fontWeight: 600, color: '#16a34a' }}>₹{verifiedPaid.toFixed(2)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.925rem',
              fontWeight: 700,
              paddingTop: '0.35rem',
              borderTop: '1px dashed #d1d5db',
            }}
          >
            <span style={{ color: '#111827' }}>Current Balance Due:</span>
            <span style={{ color: payableAmount > 0 ? '#b91c1c' : '#16a34a' }}>
              ₹{payableAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              background: '#fee2e2',
              border: '1px solid #f87171',
              borderRadius: '6px',
              color: '#b91c1c',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {actionSuccess && (
          <div
            style={{
              padding: '0.75rem',
              background: '#dcfce7',
              border: '1px solid #86efac',
              borderRadius: '6px',
              color: '#166534',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            {actionSuccess}
          </div>
        )}

        {/* Pending recorded payments awaiting verification */}
        {pendingPayments.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.925rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
              Pending Verification ({pendingPayments.length})
            </h3>
            {pendingPayments.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: '6px',
                  padding: '0.625rem 0.75rem',
                  marginBottom: '0.5rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#92400e' }}>
                    {p.method} — ₹{p.amount.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#b45309' }}>
                    Recorded on {new Date(p.created_at).toLocaleTimeString()}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleVerifyPayment(p.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Verify Payment
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Record new payment if balance is due */}
        {payableAmount > 0 && (
          <form onSubmit={handleRecordPayment} style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.925rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
              Record Payment at Reception
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.25rem' }}>
                  Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value={PaymentMethod.CASH}>Cash</option>
                  <option value={PaymentMethod.UPI}>UPI / QR</option>
                  <option value={PaymentMethod.CARD}>Card / POS</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.25rem' }}>
                  Exact Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    background: '#f9fafb',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.25rem' }}>
                Transaction Ref (Optional)
              </label>
              <input
                type="text"
                value={transactionRef}
                placeholder="e.g. UPI txn ID or receipt number"
                onChange={(e) => setTransactionRef(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.25rem' }}>
                Reception Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                placeholder="e.g. Cash counted at counter"
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || amount <= 0}
              style={{
                width: '100%',
                padding: '0.625rem',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Recording...' : `Record ₹${amount.toFixed(2)} Payment`}
            </button>
          </form>
        )}

        {/* Confirm Order Action */}
        {isFullyVerified && order.status === OrderStatus.PENDING && (
          <div
            style={{
              padding: '1rem',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 600, color: '#065f46', marginBottom: '0.5rem', fontSize: '0.925rem' }}>
              Payment is fully verified. Ready to confirm order!
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirmOrder}
              style={{
                padding: '0.625rem 1.5rem',
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
              }}
            >
              {loading ? 'Confirming...' : 'Confirm Order Now'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
