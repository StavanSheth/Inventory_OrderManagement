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
          maxWidth: '650px',
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
              Edit Order — {order.order_number}
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6f5569', fontSize: '0.875rem', fontWeight: 600 }}>
              Within 60-minute window. Recalculates items with authoritative DB prices.
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

        {/* Current Items List */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.5rem' }}>
            Order Items ({items.length})
          </h3>

          {items.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#6f5569', background: '#fff1f4', borderRadius: '1rem', border: '1px solid #f4d3dd' }}>
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
                    padding: '0.75rem 1rem',
                    background: '#fff1f4',
                    border: '1px solid #f4d3dd',
                    borderRadius: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#2b1233' }}>
                      {item.productName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6f5569', fontWeight: 600 }}>
                      ₹{item.unitPrice.toFixed(2)} each &bull; Tax {item.taxRate}%
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '1rem', background: '#ffffff', padding: '0.2rem 0.5rem', borderRadius: '9999px', border: '1px solid #f4d3dd' }}>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.productId, -1)}
                      style={{
                        width: '24px',
                        height: '24px',
                        border: 'none',
                        borderRadius: '9999px',
                        background: '#fff1f4',
                        cursor: 'pointer',
                        fontWeight: 900,
                        color: '#2b1233',
                      }}
                    >
                      -
                    </button>
                    <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 800, fontSize: '0.875rem', color: '#2b1233' }}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.productId, 1)}
                      style={{
                        width: '24px',
                        height: '24px',
                        border: 'none',
                        borderRadius: '9999px',
                        background: '#fff1f4',
                        cursor: 'pointer',
                        fontWeight: 900,
                        color: '#2b1233',
                      }}
                    >
                      +
                    </button>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: '70px', marginRight: '0.75rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#d61c5d' }}>
                      ₹{(item.unitPrice * item.quantity).toFixed(2)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.productId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#d61c5d',
                      cursor: 'pointer',
                      fontSize: '1.25rem',
                      lineHeight: 1,
                      fontWeight: 'bold',
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
        <div style={{ marginBottom: '1.5rem', background: '#fff1f4', padding: '1rem', borderRadius: '1.25rem', border: '1px solid #f4d3dd' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.5rem' }}>
            Add Product to Order:
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              value={selectedAddProductId}
              onChange={(e) => setSelectedAddProductId(e.target.value)}
              disabled={loadingCatalog || catalog.length === 0}
              style={{
                flex: 1,
                padding: '0.6rem 0.9rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                fontSize: '0.875rem',
                fontWeight: 700,
                color: '#2b1233',
                background: '#ffffff',
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
                padding: '0.6rem 1.25rem',
                background: selectedAddProductId ? '#d61c5d' : '#f4d3dd',
                color: selectedAddProductId ? '#ffffff' : '#6f5569',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.8125rem',
                cursor: selectedAddProductId ? 'pointer' : 'not-allowed',
                boxShadow: selectedAddProductId ? '0 3px 0 #a3134a' : 'none',
              }}
            >
              Add Item
            </button>
          </div>
        </div>

        {/* Live Recalculation & Payment Difference Box */}
        <div
          style={{
            background: '#fff1f4',
            border: '1px solid #f4d3dd',
            borderRadius: '1.25rem',
            padding: '1.15rem 1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.925rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.65rem' }}>
            Payment & Recalculation Impact
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            <div>
              <span style={{ color: '#6f5569', fontWeight: 600 }}>Old Order Total:</span>{' '}
              <span style={{ fontWeight: 800, color: '#2b1233' }}>₹{order.total.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ color: '#6f5569', fontWeight: 600 }}>New Order Total:</span>{' '}
              <span style={{ fontWeight: 800, color: '#d61c5d' }}>₹{previewCalculation.total.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ color: '#6f5569', fontWeight: 600 }}>Verified Paid:</span>{' '}
              <span style={{ fontWeight: 800, color: '#2b1233' }}>₹{verifiedPaid.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ color: '#6f5569', fontWeight: 600 }}>Gross Difference:</span>{' '}
              <span
                style={{
                  fontWeight: 800,
                  color: editDiff.paymentDifference > 0 ? '#d61c5d' : editDiff.paymentDifference < 0 ? '#2b1233' : '#6f5569',
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
                padding: '0.75rem 1rem',
                background: '#ffc2d4',
                borderRadius: '1rem',
                color: '#2b1233',
                fontSize: '0.875rem',
                fontWeight: 800,
              }}
            >
              Additional payment required at reception:{' '}
              <span style={{ fontSize: '1rem', color: '#d61c5d' }}>₹{editDiff.additionalAmountRequired.toFixed(2)}</span>
            </div>
          )}

          {editDiff.isOverpaid && (
            <div
              style={{
                padding: '0.75rem 1rem',
                background: '#bfe3a6',
                borderRadius: '1rem',
                color: '#2b1233',
                fontSize: '0.875rem',
                fontWeight: 800,
              }}
            >
              Overpayment / credit recorded:{' '}
              <span style={{ fontSize: '1rem' }}>₹{editDiff.overpaymentAmount.toFixed(2)}</span>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '0.2rem', color: '#2b1233', opacity: 0.8 }}>
                Note: Per Phase 3 rules, refund/credit is not auto-disbursed and must be handled explicitly.
              </div>
            </div>
          )}

          {!editDiff.isUnderpaid && !editDiff.isOverpaid && (
            <div style={{ color: '#6f5569', fontSize: '0.8125rem', fontWeight: 600 }}>
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
              padding: '0.55rem 1.25rem',
              border: '1px solid #f4d3dd',
              borderRadius: '9999px',
              background: '#ffffff',
              fontWeight: 800,
              color: '#2b1233',
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
              padding: '0.55rem 1.5rem',
              border: 'none',
              borderRadius: '9999px',
              background: '#d61c5d',
              color: '#ffffff',
              fontWeight: 800,
              cursor: submitting || items.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              boxShadow: '0 3px 0 #a3134a',
            }}
          >
            {submitting ? 'Saving Changes...' : 'Save & Recalculate'}
          </button>
        </div>
      </div>
    </div>
  );
};
