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
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
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
    <div style={{ minHeight: '100vh', background: '#fff1f4', color: '#2b1233', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Top Application Bar */}
      <header
        style={{
          borderBottom: '1px solid #f4d3dd',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '0.85rem 1.5rem',
          boxShadow: '0 10px 25px -12px rgba(120, 20, 60, 0.12)',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ textDecoration: 'none', color: '#2b1233', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🍦</span>
              <span style={{ fontFamily: 'var(--font-display-family)', fontWeight: 700, fontSize: '1.35rem', letterSpacing: '-0.02em', color: '#d61c5d' }}>
                MELT
              </span>
            </Link>

            {/* Branch Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', border: '1px solid #f4d3dd', padding: '0.4rem 0.9rem', borderRadius: '9999px', boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)' }}>
              <span style={{ fontSize: '0.75rem', color: '#6f5569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>Branch:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                style={{
                  background: 'transparent',
                  color: '#2b1233',
                  border: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {branches.length > 0 ? (
                  branches.map((b) => (
                    <option key={b.id} value={b.id} style={{ background: '#ffffff', color: '#2b1233' }}>
                      {b.name} ({b.code})
                    </option>
                  ))
                ) : (
                  <option value={selectedBranchId} style={{ background: '#ffffff', color: '#2b1233' }}>
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
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                border: 'none',
                background: activeTab === 'catalog' ? '#d61c5d' : 'transparent',
                color: activeTab === 'catalog' ? '#ffffff' : '#6f5569',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'catalog' ? '0 3px 0 #a3134a' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Catalog
            </button>

            <button
              onClick={() => setActiveTab('cart')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                border: 'none',
                background: activeTab === 'cart' ? '#d61c5d' : 'transparent',
                color: activeTab === 'cart' ? '#ffffff' : '#6f5569',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: activeTab === 'cart' ? '0 3px 0 #a3134a' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span>Cart</span>
              {totalCartCount > 0 && (
                <span
                  style={{
                    background: '#ffcf4d',
                    color: '#2b1233',
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    borderRadius: '9999px',
                    padding: '0.1rem 0.45rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
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
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  border: 'none',
                  background: activeTab === 'status' ? '#d61c5d' : 'transparent',
                  color: activeTab === 'status' ? '#ffffff' : '#d61c5d',
                  fontWeight: 800,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'status' ? '0 3px 0 #a3134a' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                Track Order
              </button>
            )}

            <button
              onClick={() => setActiveTab('history')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                border: 'none',
                background: activeTab === 'history' ? '#d61c5d' : 'transparent',
                color: activeTab === 'history' ? '#ffffff' : '#6f5569',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'history' ? '0 3px 0 #a3134a' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              My Orders
            </button>

            <Link
              href="/operator"
              style={{
                marginLeft: '0.75rem',
                padding: '0.45rem 0.95rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                background: '#ffffff',
                color: '#2b1233',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: 700,
                boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)',
                transition: 'all 0.15s ease',
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
