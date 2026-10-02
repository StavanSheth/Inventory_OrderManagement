'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CatalogView,
  CartView,
  OrderStatusView,
  OrderHistoryView,
} from '@/frontend/modules/customer';
import { Product } from '@/shared/types/entities.types';

export default function CustomerOrderPage() {
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('branch-alpha');
  const [cartItems, setCartItems] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart' | 'status' | 'history'>('catalog');

  React.useEffect(() => {
    fetch('/api/v1/branches')
      .then((res) => res.json() as Promise<{ success?: boolean; data?: Array<{ id: string; name: string; code: string }> }>)
      .then((json) => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setBranches(json.data);
          setSelectedBranchId((prev) => (json.data?.some((b) => b.id === prev) ? prev : json.data![0].id));
        }
      })
      .catch(() => {});
  }, []);

  const handleAddToCart = (product: Product, quantity: number = 1) => {
    setCartItems((prev) => {
      const existing = prev.find((it) => it.product.id === product.id);
      if (existing) {
        return prev.map((it) =>
          it.product.id === product.id ? { ...it, quantity: it.quantity + quantity } : it,
        );
      }
      return [...prev, { product, quantity }];
    });
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number) => {
    setCartItems((prev) =>
      prev
        .map((it) => (it.product.id === productId ? { ...it, quantity } : it))
        .filter((it) => it.quantity > 0),
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCartItems((prev) => prev.filter((it) => it.product.id !== productId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handleOrderCreated = (orderData: { order: { id: string } }) => {
    setActiveOrderId(orderData.order.id);
    setActiveTab('status');
  };

  const totalCartCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top Application Bar */}
      <header
        style={{
          borderBottom: '1px solid #1e293b',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '0.75rem 1.5rem',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ textDecoration: 'none', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🍦</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em', color: '#fbbf24' }}>
                MELT
              </span>
            </Link>

            {/* Branch Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1e293b', padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Branch:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                style={{
                  background: 'transparent',
                  color: '#f8fafc',
                  border: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {branches.length > 0 ? (
                  branches.map((b) => (
                    <option key={b.id} value={b.id} style={{ background: '#1e293b', color: '#fff' }}>
                      {b.name} ({b.code})
                    </option>
                  ))
                ) : (
                  <option value={selectedBranchId} style={{ background: '#1e293b', color: '#fff' }}>
                    Select Branch
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* Navigation Controls */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('catalog')}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'catalog' ? '#2563eb' : 'transparent',
                color: activeTab === 'catalog' ? '#ffffff' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Catalog
            </button>

            <button
              onClick={() => setActiveTab('cart')}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'cart' ? '#2563eb' : 'transparent',
                color: activeTab === 'cart' ? '#ffffff' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>Cart</span>
              {totalCartCount > 0 && (
                <span
                  style={{
                    background: '#fbbf24',
                    color: '#0f172a',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    borderRadius: '9999px',
                    padding: '0.1rem 0.4rem',
                  }}
                >
                  {totalCartCount}
                </span>
              )}
            </button>

            {activeOrderId && (
              <button
                onClick={() => setActiveTab('status')}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'status' ? '#2563eb' : 'transparent',
                  color: activeTab === 'status' ? '#ffffff' : '#34d399',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Track Order
              </button>
            )}

            <button
              onClick={() => setActiveTab('history')}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'history' ? '#2563eb' : 'transparent',
                color: activeTab === 'history' ? '#ffffff' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              My Orders
            </button>

            <Link
              href="/operator"
              style={{
                marginLeft: '0.75rem',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #334155',
                color: '#cbd5e1',
                textDecoration: 'none',
                fontSize: '0.75rem',
                fontWeight: 500,
              }}
            >
              Operator Desk &rarr;
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {activeTab === 'catalog' && (
          <CatalogView
            branchId={selectedBranchId}
            onAddToCart={handleAddToCart}
          />
        )}

        {activeTab === 'cart' && (
          <div style={{ maxWidth: '650px', margin: '0 auto' }}>
            <CartView
              branchId={selectedBranchId}
              items={cartItems}
              onUpdateQuantity={handleUpdateCartQuantity}
              onRemoveItem={handleRemoveFromCart}
              onClearCart={handleClearCart}
              onOrderCreated={handleOrderCreated}
            />
          </div>
        )}

        {activeTab === 'status' && activeOrderId && (
          <OrderStatusView
            orderId={activeOrderId}
            onBackToCatalog={() => setActiveTab('catalog')}
          />
        )}

        {activeTab === 'history' && (
          <OrderHistoryView
            onSelectOrder={(orderId) => {
              setActiveOrderId(orderId);
              setActiveTab('status');
            }}
            onBackToCatalog={() => setActiveTab('catalog')}
          />
        )}
      </main>
    </div>
  );
}
