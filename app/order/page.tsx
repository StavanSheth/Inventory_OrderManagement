'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CatalogView,
  CartView,
  OrderStatusView,
  OrderHistoryView,
} from '@/frontend/modules/customer';
import { Product } from '@/shared/types/entities.types';
import { GlobalNavigation, BunMobileNav } from '@/frontend/components/ui';

export default function CustomerOrderPage() {
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [cartItems, setCartItems] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart' | 'status' | 'history'>('catalog');

  useEffect(() => {
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
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  const tabItems = [
    { id: 'catalog', label: 'Catalog', icon: '🍦' },
    { id: 'cart', label: 'Cart', icon: '🛒', count: totalCartCount },
    ...(activeOrderId ? [{ id: 'status', label: 'Track', icon: '📍' }] : []),
    { id: 'history', label: 'Orders', icon: '📜' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#fff1f4', color: '#2b1233', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Global Application Header */}
      <GlobalNavigation
        portalTitle="Storefront"
        portalSubtitle="Fresh Handcrafted Scoops"
        branches={branches}
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
        cartCount={totalCartCount}
      >
        <Link
          href="/operator"
          className="hidden md:inline-flex"
          style={{
            padding: '0.4rem 0.85rem',
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
          Staff Desk &rarr;
        </Link>
      </GlobalNavigation>

      {/* Responsive Secondary View Tabs */}
      <div
        style={{
          borderBottom: '1px solid #f4d3dd',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          padding: '0.65rem 0',
          position: 'sticky',
          top: '57px',
          zIndex: 90,
        }}
      >
        <div
          className="app-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {tabItems.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  style={{
                    padding: '0.45rem 1.05rem',
                    borderRadius: '9999px',
                    border: 'none',
                    background: isActive ? '#d61c5d' : 'transparent',
                    color: isActive ? '#ffffff' : '#6f5569',
                    fontWeight: 800,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: isActive ? '0 3px 0 #a3134a' : 'none',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && tab.count > 0 && (
                    <span
                      style={{
                        background: isActive ? '#ffffff' : '#ffcf4d',
                        color: '#2b1233',
                        fontSize: '0.7rem',
                        fontWeight: 900,
                        borderRadius: '9999px',
                        padding: '0.05rem 0.4rem',
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden sm:block" style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6f5569' }}>
            {selectedBranch ? `Serving: ${selectedBranch.name}` : ''}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="app-container" style={{ paddingTop: '1.75rem', paddingBottom: '5rem' }}>
        {activeTab === 'catalog' && (
          <CatalogView
            branchId={selectedBranchId}
            onAddToCart={handleAddToCart}
          />
        )}

        {activeTab === 'cart' && (
          <div className="app-container-sm">
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
          <div className="app-container-sm">
            <OrderStatusView
              orderId={activeOrderId}
              onBackToCatalog={() => setActiveTab('catalog')}
            />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="app-container-sm">
            <OrderHistoryView
              onSelectOrder={(orderId) => {
                setActiveOrderId(orderId);
                setActiveTab('status');
              }}
              onBackToCatalog={() => setActiveTab('catalog')}
            />
          </div>
        )}
      </main>

      {/* Bun Mobile Navigation */}
      <BunMobileNav
        currentPortal="customer"
        currentTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as typeof activeTab)}
        tabItems={tabItems}
        branchName={selectedBranch?.name}
      />
    </div>
  );
}
