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
        background: 'rgba(43, 18, 51, 0.45)',
        backdropFilter: 'blur(6px)',
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
          borderRadius: '1.75rem',
          maxWidth: '550px',
          width: '100%',
          padding: '1.75rem',
          border: '1px solid #f4d3dd',
          boxShadow: '0 25px 50px -12px rgba(120, 20, 60, 0.25)',
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'var(--font-body-family), system-ui, sans-serif',
          color: '#2b1233',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#2b1233' }}>
              Reception Payment & Verification
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6f5569', fontSize: '0.875rem', fontWeight: 600 }}>
              Order: <span style={{ fontWeight: 800, color: '#d61c5d' }}>{order.order_number}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#fff1f4',
              border: '1px solid #f4d3dd',
              borderRadius: '9999px',
              width: '32px',
              height: '32px',
              fontSize: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#6f5569',
              fontWeight: 'bold',
            }}
          >
            &times;
          </button>
        </div>

        {/* Order Balance Overview */}
        <div
          style={{
            background: '#fff1f4',
            border: '1px solid #f4d3dd',
            borderRadius: '1.25rem',
            padding: '1.15rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#6f5569', fontWeight: 600 }}>Order Total:</span>
            <span style={{ fontWeight: 800, color: '#2b1233' }}>₹{order.total.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#6f5569', fontWeight: 600 }}>Verified Paid:</span>
            <span style={{ fontWeight: 800, color: '#2b1233' }}>₹{verifiedPaid.toFixed(2)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '1rem',
              fontWeight: 800,
              paddingTop: '0.5rem',
              marginTop: '0.35rem',
              borderTop: '1px dashed #f4d3dd',
            }}
          >
            <span style={{ color: '#2b1233' }}>Current Balance Due:</span>
            <span style={{ color: payableAmount > 0 ? '#d61c5d' : '#2b1233' }}>
              ₹{payableAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '0.85rem 1rem',
              background: '#ffffff',
              border: '1px solid #f4d3dd',
              borderRadius: '1rem',
              color: '#d61c5d',
              fontSize: '0.875rem',
              marginBottom: '1rem',
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        {actionSuccess && (
          <div
            style={{
              padding: '0.85rem 1rem',
              background: '#bfe3a6',
              borderRadius: '1rem',
              color: '#2b1233',
              fontSize: '0.875rem',
              marginBottom: '1rem',
              fontWeight: 800,
            }}
          >
            {actionSuccess}
          </div>
        )}

        {/* Pending recorded payments awaiting verification */}
        {pendingPayments.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.925rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.5rem' }}>
              Pending Verification ({pendingPayments.length})
            </h3>
            {pendingPayments.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#ffcf4d',
                  borderRadius: '1rem',
                  padding: '0.75rem 1rem',
                  marginBottom: '0.5rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#2b1233' }}>
                    {p.method} — ₹{p.amount.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#2b1233', opacity: 0.8, fontWeight: 600 }}>
                    Recorded on {new Date(p.created_at).toLocaleTimeString()}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleVerifyPayment(p.id)}
                  style={{
                    padding: '0.45rem 1rem',
                    background: '#2b1233',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
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
            <h3 style={{ fontSize: '0.925rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.75rem' }}>
              Record Payment at Reception
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.25rem' }}>
                  Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '9999px',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    color: '#2b1233',
                    background: '#ffffff',
                  }}
                >
                  <option value={PaymentMethod.CASH}>Cash</option>
                  <option value={PaymentMethod.UPI}>UPI / QR</option>
                  <option value={PaymentMethod.CARD}>Card / POS</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.25rem' }}>
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
                    padding: '0.6rem 0.9rem',
                    borderRadius: '9999px',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    color: '#2b1233',
                    background: '#fff1f4',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.25rem' }}>
                Transaction Ref (Optional)
              </label>
              <input
                type="text"
                value={transactionRef}
                placeholder="e.g. UPI txn ID or receipt number"
                onChange={(e) => setTransactionRef(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 1rem',
                  borderRadius: '9999px',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                  color: '#2b1233',
                }}
              />
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.25rem' }}>
                Reception Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                placeholder="e.g. Cash counted at counter"
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 1rem',
                  borderRadius: '9999px',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.875rem',
                  color: '#2b1233',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || amount <= 0}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#d61c5d',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 3px 0 #a3134a',
                transition: 'all 0.15s ease',
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
              padding: '1.25rem',
              background: '#bfe3a6',
              borderRadius: '1.25rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 800, color: '#2b1233', marginBottom: '0.75rem', fontSize: '0.925rem' }}>
              Payment is fully verified. Ready to confirm order!
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirmOrder}
              style={{
                padding: '0.65rem 1.75rem',
                background: '#2b1233',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                boxShadow: '0 3px 0 #431d4e',
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
