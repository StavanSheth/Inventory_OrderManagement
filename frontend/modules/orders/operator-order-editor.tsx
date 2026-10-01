'use client';

import React, { useState, useEffect } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { Order, OrderItem, Payment, Product } from '../../../shared/types/entities.types';
import { PaymentStatus } from '../../../shared/enums/order.enum';
import { calculateOrderTotals, calculateEditDifference } from '../../../shared/business-rules/order-rules';

interface OperatorOrderEditorProps {
  branchId: string;
  order: Order;
  initialItems: OrderItem[];
  payments: Payment[];
  onClose: () => void;
  onSuccess: () => void;
}

interface EditableItem {
  productId: string;
  productName: string;
  unitPrice: number;
  taxRate: number;
  quantity: number;
}

export const OperatorOrderEditor: React.FC<OperatorOrderEditorProps> = ({
  branchId,
  order,
  initialItems,
  payments,
  onClose,
  onSuccess,
}) => {
  const [items, setItems] = useState<EditableItem[]>(() =>
    initialItems.map((it) => ({
      productId: it.product_id,
      productName: it.product_name_snapshot,
      unitPrice: it.unit_price_snapshot,
      taxRate: 5,
      quantity: it.quantity,
    })),
  );

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [selectedAddProductId, setSelectedAddProductId] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const verifiedPaid = payments
    .filter((p) => p.status === PaymentStatus.VERIFIED)
    .reduce((sum, p) => sum + p.amount, 0);

  // Fetch branch catalog to allow adding products
  useEffect(() => {
    let isMounted = true;
    orderApiClient
      .getCatalog(branchId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success) {
          const allProducts: Product[] = [];
          res.data.catalog.forEach((cat) => {
            cat.products.forEach((p) => {
              if (p.active) allProducts.push(p);
            });
          });
          setCatalog(allProducts);
        }
      })
      .catch((err) => {
        console.error('Failed to load catalog for editor', err);
      })
      .finally(() => {
        if (isMounted) setLoadingCatalog(false);
      });

    return () => {
      isMounted = false;
    };
  }, [branchId]);

  // Client calculation preview
  const previewCalculation = calculateOrderTotals(
    items.map((it) => ({
      unitPrice: it.unitPrice,
      taxRate: it.taxRate,
      quantity: it.quantity,
    })),
  );

  const editDiff = calculateEditDifference(order.total, previewCalculation.total, verifiedPaid);

  const handleQuantityChange = (productId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) => {
          if (it.productId === productId) {
            const newQty = it.quantity + delta;
            return newQty > 0 ? { ...it, quantity: newQty } : null;
          }
          return it;
        })
        .filter((it): it is EditableItem => it !== null),
    );
  };

  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  const handleAddItem = () => {
    if (!selectedAddProductId) return;
    const product = catalog.find((p) => p.id === selectedAddProductId);
    if (!product) return;

    setItems((prev) => {
      const existing = prev.find((it) => it.productId === product.id);
      if (existing) {
        return prev.map((it) =>
          it.productId === product.id ? { ...it, quantity: it.quantity + 1 } : it,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          taxRate: 5,
          quantity: 1,
        },
      ];
    });

    setSelectedAddProductId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setError('Order cannot be empty. Please add at least one item.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await orderApiClient.editBranchOrder(branchId, order.id, {
        items: items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
        })),
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error.message || 'Failed to update order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

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
          maxWidth: '650px',
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
              Edit Order — {order.order_number}
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Within 60-minute window. Recalculates items with authoritative DB prices.
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

        {/* Current Items List */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.925rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Order Items ({items.length})
          </h3>

          {items.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '6px' }}>
              No items in order. Add items below.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {items.map((item) => (
                <div
                  key={item.productId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.625rem 0.75rem',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
                      {item.productName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      ₹{item.unitPrice.toFixed(2)} each &bull; Tax {item.taxRate}%
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.productId, -1)}
                      style={{
                        width: '28px',
                        height: '28px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        background: '#ffffff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      -
                    </button>
                    <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.productId, 1)}
                      style={{
                        width: '28px',
                        height: '28px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        background: '#ffffff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      +
                    </button>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: '70px', marginRight: '0.75rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
                      ₹{(item.unitPrice * item.quantity).toFixed(2)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.productId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '1.25rem',
                      lineHeight: 1,
                    }}
                    title="Remove item"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Product from Catalog */}
        <div style={{ marginBottom: '1.5rem', background: '#f3f4f6', padding: '0.75rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#4b5563', marginBottom: '0.35rem' }}>
            Add Product to Order:
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              value={selectedAddProductId}
              onChange={(e) => setSelectedAddProductId(e.target.value)}
              disabled={loadingCatalog || catalog.length === 0}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
              }}
            >
              <option value="">
                {loadingCatalog ? 'Loading catalog...' : '-- Select a product to add --'}
              </option>
              {catalog.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (₹{p.price.toFixed(2)})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddItem}
              disabled={!selectedAddProductId}
              style={{
                padding: '0.5rem 1rem',
                background: selectedAddProductId ? '#2563eb' : '#9ca3af',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: selectedAddProductId ? 'pointer' : 'not-allowed',
              }}
            >
              Add Item
            </button>
          </div>
        </div>

        {/* Live Recalculation & Payment Difference Box */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
            Payment & Recalculation Impact
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            <div>
              <span style={{ color: '#64748b' }}>Old Order Total:</span>{' '}
              <span style={{ fontWeight: 600, color: '#334155' }}>₹{order.total.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>New Order Total:</span>{' '}
              <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{previewCalculation.total.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Verified Paid:</span>{' '}
              <span style={{ fontWeight: 600, color: '#16a34a' }}>₹{verifiedPaid.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Gross Difference:</span>{' '}
              <span
                style={{
                  fontWeight: 600,
                  color: editDiff.paymentDifference > 0 ? '#b91c1c' : editDiff.paymentDifference < 0 ? '#15803d' : '#334155',
                }}
              >
                {editDiff.paymentDifference >= 0 ? `+₹${editDiff.paymentDifference.toFixed(2)}` : `-₹${Math.abs(editDiff.paymentDifference).toFixed(2)}`}
              </span>
            </div>
          </div>

          {/* Action requirement highlight */}
          {editDiff.isUnderpaid && (
            <div
              style={{
                padding: '0.625rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              Additional payment required at reception:{' '}
              <span style={{ fontSize: '1rem' }}>₹{editDiff.additionalAmountRequired.toFixed(2)}</span>
            </div>
          )}

          {editDiff.isOverpaid && (
            <div
              style={{
                padding: '0.625rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                color: '#166534',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              Overpayment / credit recorded:{' '}
              <span style={{ fontSize: '1rem' }}>₹{editDiff.overpaymentAmount.toFixed(2)}</span>
              <div style={{ fontSize: '0.75rem', fontWeight: 400, marginTop: '0.2rem', color: '#15803d' }}>
                Note: Per Phase 3 rules, refund/credit is not auto-disbursed and must be handled explicitly.
              </div>
            </div>
          )}

          {!editDiff.isUnderpaid && !editDiff.isOverpaid && (
            <div style={{ color: '#475569', fontSize: '0.8125rem' }}>
              No net payment difference after edit.
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.625rem 1.25rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: '#ffffff',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || items.length === 0}
            onClick={handleSubmit}
            style={{
              padding: '0.625rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              cursor: submitting || items.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {submitting ? 'Saving Changes...' : 'Save & Recalculate'}
          </button>
        </div>
      </div>
    </div>
  );
};
