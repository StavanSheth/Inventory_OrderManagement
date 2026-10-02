'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Branch } from '@/shared/types/entities.types';
import { apiClient } from '@/frontend/services/api-client';

export interface CustomerMarketingRecord {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  category: 'VIP' | 'FREQUENT' | 'REGULAR' | 'DORMANT';
  estimatedAgeGroup?: string;
}

export interface OwnerMessagingViewProps {
  branches: Branch[];
  selectedBranchId?: string;
}

type TimeRange = '7d' | '30d' | '90d' | '180d' | '365d' | 'all';
type CustomerCategory = 'ALL' | 'VIP' | 'FREQUENT' | 'REGULAR' | 'DORMANT';
type MessageChannel = 'WHATSAPP' | 'EMAIL' | 'SMS';
type SendMode = 'SAME_ALL' | 'CUSTOM_PER_USER';

const PROMO_IMAGE_PRESETS = [
  {
    name: '🍧 20% Off Artisanal Gelato Weekend',
    url: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: '👑 VIP Exclusive Double Scoops Treat',
    url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: '🍓 Fresh Strawberry Seasonal Batch',
    url: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: '🎉 Welcome Back Sweet Voucher',
    url: 'https://images.unsplash.com/photo-1580915411954-282cb1b0d780?w=800&auto=format&fit=crop&q=80',
  },
];

export default function OwnerMessagingView({ branches, selectedBranchId = 'ALL' }: OwnerMessagingViewProps) {
  // Filter States
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selectedCategory, setSelectedCategory] = useState<CustomerCategory>('ALL');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>('ALL');
  const [orderAmountFilter, setOrderAmountFilter] = useState<string>('ALL'); // ALL, <500, 500-2000, >2000
  const [orderFreqFilter, setOrderFreqFilter] = useState<string>('ALL'); // ALL, 1, 2-5, 6+
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data States
  const [customers, setCustomers] = useState<CustomerMarketingRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Selection States
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Composer States
  const [sendMode, setSendMode] = useState<SendMode>('SAME_ALL');
  const [channel, setChannel] = useState<MessageChannel>('WHATSAPP');
  const [templateMessage, setTemplateMessage] = useState<string>(
    'Hello {{name}}! 🍨 Treat yourself today at IceCream Melt. You have placed {{order_count}} delicious orders with us! Use code {{coupon_code}} for {{discount}} on your next visit.'
  );
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({});
  const [includeImage, setIncludeImage] = useState<boolean>(true);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(PROMO_IMAGE_PRESETS[0].url);
  const [customImageUrl, setCustomImageUrl] = useState<string>('');

  // Per-recipient custom image overrides: { [userId]: dataUrlOrUrl }
  const [customImages, setCustomImages] = useState<Record<string, string>>({});

  // Promo / Coupon Attachment States (Targeted to customer carts)
  const [attachPromoCode, setAttachPromoCode] = useState<boolean>(true);
  const [promoCode, setPromoCode] = useState<string>('MELT20');
  const [promoTitle, setPromoTitle] = useState<string>('20% Off Artisanal Gelato');
  const [promoDiscountType, setPromoDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [promoDiscountValue, setPromoDiscountValue] = useState<number>(20);
  const [promoMinOrder, setPromoMinOrder] = useState<number>(150);
  const [promoExpiryDays, setPromoExpiryDays] = useState<number>(14);

  // Broadcast execution states
  const [sending, setSending] = useState<boolean>(false);
  const [broadcastResult, setBroadcastResult] = useState<{
    campaignId: string;
    dispatchedCount: number;
    channel: string;
    promoAssigned?: { createdCouponCount: number; assignedCount: number } | null;
    previews?: Array<{ name: string; phone?: string | null; actionUrl: string; imageUrl?: string | null }>;
  } | null>(null);

  const handleCustomerImageUpload = (userId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setCustomImages((prev) => ({
          ...prev,
          [userId]: e.target!.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGlobalImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setCustomImageUrl(e.target!.result as string);
        setIncludeImage(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const generateRandomPromoCode = () => {
    const prefixes = ['MELT', 'SWEET', 'SCOOP', 'GELATO', 'TREAT', 'VIP'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const val = promoDiscountValue || 20;
    setPromoCode(`${prefix}${val}`);
  };

  // Fetch customers with metrics
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        range: timeRange,
        category: selectedCategory,
        branchId: selectedBranchId,
      });

      const res = await apiClient.request<{ customers?: CustomerMarketingRecord[] }>(
        `/api/v1/owner/marketing/customers?${queryParams.toString()}`,
        {
          authenticated: true,
        }
      );

      if (res.success) {
        if (Array.isArray(res.data?.customers)) {
          setCustomers(res.data.customers);
          const allIds = new Set<string>(res.data.customers.map((c: CustomerMarketingRecord) => c.id));
          setSelectedUserIds(allIds);
        } else {
          setCustomers([]);
        }
      } else {
        setError(res.error.message || 'Failed to load marketing customer data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading customer data');
    } finally {
      setLoading(false);
    }
  }, [timeRange, selectedCategory, selectedBranchId]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Client-side additional behavioral & demographic filtering
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.displayName.toLowerCase().includes(q);
        const matchesEmail = c.email.toLowerCase().includes(q);
        const matchesPhone = c.phone?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesEmail && !matchesPhone) return false;
      }

      // Age group
      if (ageGroupFilter !== 'ALL' && c.estimatedAgeGroup !== ageGroupFilter) {
        return false;
      }

      // Order Amount
      if (orderAmountFilter === '<500' && c.totalSpent >= 500) return false;
      if (orderAmountFilter === '500-2000' && (c.totalSpent < 500 || c.totalSpent > 2000)) return false;
      if (orderAmountFilter === '>2000' && c.totalSpent <= 2000) return false;

      // Order Frequency
      if (orderFreqFilter === '1' && c.totalOrders !== 1) return false;
      if (orderFreqFilter === '2-5' && (c.totalOrders < 2 || c.totalOrders > 5)) return false;
      if (orderFreqFilter === '6+' && c.totalOrders < 6) return false;

      return true;
    });
  }, [customers, searchQuery, ageGroupFilter, orderAmountFilter, orderFreqFilter]);

  // Aggregate stats
  const totalSpentInView = useMemo(
    () => filteredCustomers.reduce((acc, c) => acc + c.totalSpent, 0),
    [filteredCustomers]
  );
  const totalOrdersInView = useMemo(
    () => filteredCustomers.reduce((acc, c) => acc + c.totalOrders, 0),
    [filteredCustomers]
  );
  const avgOrderValueInView = useMemo(
    () => (totalOrdersInView > 0 ? Number((totalSpentInView / totalOrdersInView).toFixed(2)) : 0),
    [totalSpentInView, totalOrdersInView]
  );

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedUserIds.size === filteredCustomers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredCustomers.map((c) => c.id)));
    }
  };

  const handleToggleUser = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelectedUserIds(next);
  };

  // Helper to compile final message per user
  const resolveUserMessage = (c: CustomerMarketingRecord) => {
    let msg = sendMode === 'CUSTOM_PER_USER' && customMessages[c.id]
      ? customMessages[c.id]
      : templateMessage;

    const discountText =
      promoDiscountType === 'PERCENTAGE' ? `${promoDiscountValue}% OFF` : `₹${promoDiscountValue} OFF`;

    return msg
      .replace(/\{\{name\}\}/gi, c.displayName)
      .replace(/\{\{total_spent\}\}/gi, `₹${c.totalSpent.toFixed(2)}`)
      .replace(/\{\{order_count\}\}/gi, c.totalOrders.toString())
      .replace(/\{\{category\}\}/gi, c.category)
      .replace(/\{\{coupon_code\}\}/gi, promoCode.toUpperCase())
      .replace(/\{\{discount\}\}/gi, discountText);
  };

  // Broadcast trigger
  const handleSendBroadcast = async () => {
    const targetUsers = filteredCustomers.filter((c) => selectedUserIds.has(c.id));
    if (targetUsers.length === 0) {
      alert('Please select at least one customer to send the message to.');
      return;
    }

    setSending(true);
    setBroadcastResult(null);
    try {
      const activeImg = includeImage ? (customImageUrl.trim() || selectedImageUrl) : null;
      const recipients = targetUsers.map((c) => ({
        userId: c.id,
        name: c.displayName,
        phone: c.phone,
        email: c.email,
        message: resolveUserMessage(c),
        imageUrl: customImages[c.id] || activeImg || null,
      }));

      const res = await apiClient.request<{
        campaignId: string;
        dispatchedCount: number;
        channel: string;
        promoAssigned?: { createdCouponCount: number; assignedCount: number } | null;
        previews?: Array<{ name: string; phone?: string | null; actionUrl: string; imageUrl?: string | null }>;
      }>('/api/v1/owner/marketing/broadcast', {
        method: 'POST',
        authenticated: true,
        body: JSON.stringify({
          channel,
          recipients,
          messageTemplate: templateMessage,
          imageUrl: activeImg,
          filtersApplied: {
            timeRange,
            selectedCategory,
            ageGroupFilter,
            orderAmountFilter,
            orderFreqFilter,
          },
          branchId: selectedBranchId,
          promoCoupon: attachPromoCode ? {
            enabled: true,
            code: promoCode.trim().toUpperCase(),
            title: promoTitle.trim(),
            discountType: promoDiscountType,
            discountValue: promoDiscountValue,
            minOrderValue: promoMinOrder,
            expiryDays: promoExpiryDays,
          } : undefined,
        }),
      });

      if (res.success) {
        setBroadcastResult(res.data);
      } else {
        alert(res.error.message || 'Failed to dispatch broadcast');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Network error during broadcast');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #2b1233 0%, #4a154b 60%, #d61c5d 100%)',
          borderRadius: '1.5rem',
          padding: '2rem 2.25rem',
          color: '#ffffff',
          boxShadow: '0 12px 36px -12px rgba(120, 20, 60, 0.35)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.18)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.65rem' }}>
            <span>📢</span> Customer Segmentation & Multi-Channel Broadcast
          </div>
          <h1 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.85rem', fontWeight: 800, margin: 0 }}>
            Marketing, Offers & Message Broadcast
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', fontWeight: 500, maxWidth: '650px' }}>
            Filter customers by order spending across last week, month, or 3/6/12 months. Send personalized or unified campaigns with optional promo graphics via WhatsApp, Email, or SMS.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchCustomers}
          disabled={loading}
          style={{
            padding: '0.65rem 1.35rem',
            background: '#ffffff',
            color: '#2b1233',
            border: 'none',
            borderRadius: '9999px',
            fontWeight: 800,
            fontSize: '0.8125rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          }}
        >
          <span>🔄</span>
          <span>{loading ? 'Refreshing...' : 'Refresh Data'}</span>
        </button>
      </div>

      {/* Aggregate Metric Highlights */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
        }}
      >
        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.25rem', boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6f5569', textTransform: 'uppercase' }}>Filtered Customers</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.75rem', fontWeight: 800, color: '#2b1233', marginTop: '0.2rem' }}>
            {filteredCustomers.length}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, marginTop: '0.25rem' }}>
            {selectedUserIds.size} selected for broadcast
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.25rem', boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6f5569', textTransform: 'uppercase' }}>Orders In Selected Period</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.75rem', fontWeight: 800, color: '#d61c5d', marginTop: '0.2rem' }}>
            {totalOrdersInView}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6f5569', fontWeight: 600, marginTop: '0.25rem' }}>
            Across {timeRange.toUpperCase()} window
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.25rem', boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6f5569', textTransform: 'uppercase' }}>Total Segment Revenue</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.75rem', fontWeight: 800, color: '#166534', marginTop: '0.2rem' }}>
            ₹{totalSpentInView.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6f5569', fontWeight: 600, marginTop: '0.25rem' }}>
            Filtered cohort total
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.25rem', boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6f5569', textTransform: 'uppercase' }}>Avg Order Value (AOV)</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.75rem', fontWeight: 800, color: '#2b1233', marginTop: '0.2rem' }}>
            ₹{avgOrderValueInView.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#854d0e', fontWeight: 700, marginTop: '0.25rem' }}>
            Per order benchmark
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '1.25rem',
          border: '1px solid #f4d3dd',
          padding: '1.25rem',
          boxShadow: '0 6px 20px -8px rgba(120, 20, 60, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Row 1: Time Range & Customer Categorization */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase', marginRight: '0.65rem' }}>
              Time Period:
            </span>
            <div style={{ display: 'inline-flex', background: '#fff1f4', borderRadius: '9999px', padding: '0.25rem', gap: '0.25rem', flexWrap: 'wrap' }}>
              {[
                { id: '7d', label: 'Last Week (7d)' },
                { id: '30d', label: 'Last Month (30d)' },
                { id: '90d', label: 'Last 3 Months' },
                { id: '180d', label: 'Last 6 Months' },
                { id: '365d', label: 'Last 12 Months' },
                { id: 'all', label: 'All Time' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimeRange(t.id as TimeRange)}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '9999px',
                    border: 'none',
                    background: timeRange === t.id ? '#d61c5d' : 'transparent',
                    color: timeRange === t.id ? '#ffffff' : '#2b1233',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase', marginRight: '0.65rem' }}>
              Category:
            </span>
            <div style={{ display: 'inline-flex', background: '#fff1f4', borderRadius: '9999px', padding: '0.25rem', gap: '0.25rem', flexWrap: 'wrap' }}>
              {[
                { id: 'ALL', label: 'All Users' },
                { id: 'VIP', label: '👑 VIP Spenders' },
                { id: 'FREQUENT', label: '🔁 Frequent' },
                { id: 'REGULAR', label: '☕ Regular' },
                { id: 'DORMANT', label: '💤 Dormant' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(c.id as CustomerCategory)}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '9999px',
                    border: 'none',
                    background: selectedCategory === c.id ? '#2b1233' : 'transparent',
                    color: selectedCategory === c.id ? '#ffffff' : '#2b1233',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Secondary Demographics & Behavioral Filters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px dashed #f4d3dd',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.25rem' }}>
              Order Amount Filter
            </label>
            <select
              value={orderAmountFilter}
              onChange={(e) => setOrderAmountFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                borderRadius: '0.75rem',
                border: '1px solid #f4d3dd',
                background: '#fff1f4',
                color: '#2b1233',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <option value="ALL">Any Order Amount</option>
              <option value="<500">Under ₹500</option>
              <option value="500-2000">₹500 - ₹2,000</option>
              <option value=">2000">Over ₹2,000 (High Ticket)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.25rem' }}>
              Order Frequency Filter
            </label>
            <select
              value={orderFreqFilter}
              onChange={(e) => setOrderFreqFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                borderRadius: '0.75rem',
                border: '1px solid #f4d3dd',
                background: '#fff1f4',
                color: '#2b1233',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <option value="ALL">All Frequencies</option>
              <option value="1">1 Order Only (Trial)</option>
              <option value="2-5">2 - 5 Orders (Returning)</option>
              <option value="6+">6+ Orders (Loyal Fans)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.25rem' }}>
              Age Group Category
            </label>
            <select
              value={ageGroupFilter}
              onChange={(e) => setAgeGroupFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                borderRadius: '0.75rem',
                border: '1px solid #f4d3dd',
                background: '#fff1f4',
                color: '#2b1233',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <option value="ALL">All Age Demographics</option>
              <option value="18-24">18 - 24 Years</option>
              <option value="25-34">25 - 34 Years</option>
              <option value="35-49">35 - 49 Years</option>
              <option value="50+">50+ Years</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.25rem' }}>
              Search Customer
            </label>
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                borderRadius: '0.75rem',
                border: '1px solid #f4d3dd',
                background: '#fff1f4',
                color: '#2b1233',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Left = Customer Selection Table, Right = Message Composer */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
        {/* Customer List Card */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '1.25rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 6px 20px -8px rgba(120, 20, 60, 0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '1.25rem',
              borderBottom: '1px solid #f4d3dd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#2b1233' }}>
                Target Audience ({filteredCustomers.length})
              </h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#6f5569' }}>
                Select customers below to include in broadcast message
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleSelectAll}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                background: '#fff1f4',
                color: '#2b1233',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {selectedUserIds.size === filteredCustomers.length && filteredCustomers.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6f5569', fontWeight: 700 }}>
              Loading customers & order analytics...
            </div>
          ) : error ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#d61c5d', fontWeight: 700 }}>
              {error}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6f5569' }}>
              <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>🔍</span>
              No customers match this combination of filters.
            </div>
          ) : (
            <div style={{ maxHeight: '620px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#fff1f4', borderBottom: '1px solid #f4d3dd', textAlign: 'left', color: '#6f5569', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.75rem 1rem', width: '36px' }}>Pick</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                    <th style={{ padding: '0.75rem 0.75rem' }}>Orders</th>
                    <th style={{ padding: '0.75rem 0.75rem' }}>Spent</th>
                    <th style={{ padding: '0.75rem 0.75rem' }}>Category</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c) => {
                    const isSelected = selectedUserIds.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: '1px solid #fdf2f4',
                          background: isSelected ? 'rgba(214, 28, 93, 0.03)' : '#ffffff',
                          transition: 'background 0.1s ease',
                        }}
                      >
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleUser(c.id)}
                            style={{ cursor: 'pointer', accentColor: '#d61c5d' }}
                          />
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 800, color: '#2b1233' }}>{c.displayName}</div>
                          <div style={{ fontSize: '0.7rem', color: '#6f5569' }}>
                            {c.phone || c.email || 'No phone recorded'} &bull; {c.estimatedAgeGroup} yrs
                          </div>
                          {/* Separate Image for this Customer */}
                          <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {customImages[c.id] ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#fdf2f4', border: '1px solid #ffd1dc', borderRadius: '4px', padding: '1px 4px' }}>
                                <img src={customImages[c.id]} alt="" style={{ width: '20px', height: '20px', borderRadius: '3px', objectFit: 'cover' }} />
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#d61c5d' }}>Custom Pic</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = { ...customImages };
                                    delete next[c.id];
                                    setCustomImages(next);
                                  }}
                                  style={{ background: 'none', border: 'none', color: '#d61c5d', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 900, padding: 0 }}
                                  title="Remove custom photo"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <label style={{ cursor: 'pointer', fontSize: '0.68rem', color: '#d61c5d', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                <span>📷</span>
                                <span>Add Custom Pic</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={(e) => e.target.files?.[0] && handleCustomerImageUpload(c.id, e.target.files[0])}
                                />
                              </label>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 0.75rem', fontWeight: 700, color: '#2b1233' }}>
                          {c.totalOrders}
                        </td>
                        <td style={{ padding: '0.85rem 0.75rem', fontWeight: 800, color: '#d61c5d' }}>
                          ₹{c.totalSpent.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.85rem 0.75rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '9999px',
                              fontSize: '0.65rem',
                              fontWeight: 900,
                              background:
                                c.category === 'VIP'
                                    ? '#fef3c7'
                                    : c.category === 'FREQUENT'
                                    ? '#dcfce7'
                                    : c.category === 'DORMANT'
                                    ? '#fee2e2'
                                    : '#eff6ff',
                              color:
                                c.category === 'VIP'
                                    ? '#92400e'
                                    : c.category === 'FREQUENT'
                                    ? '#166534'
                                    : c.category === 'DORMANT'
                                    ? '#991b1b'
                                    : '#1e40af',
                            }}
                          >
                            {c.category}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            title="Direct WhatsApp link"
                            onClick={() => {
                              const phone = (c.phone || '919876543210').replace(/[^0-9]/g, '');
                              const userImg = customImages[c.id] || (includeImage ? (customImageUrl.trim() || selectedImageUrl) : null);
                              const baseMsg = resolveUserMessage(c);
                              const fullMsg = userImg ? `${baseMsg}\n\n[Promo Banner: ${userImg}]` : baseMsg;
                              window.open(`https://wa.me/${phone}?text=${encodeURIComponent(fullMsg)}`, '_blank');
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px',
                              background: '#25D366',
                              color: '#ffffff',
                              border: 'none',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              marginRight: '0.35rem',
                            }}
                          >
                            💬 WA
                          </button>
                          <button
                            type="button"
                            title="Direct Email link"
                            onClick={() => {
                              const userImg = customImages[c.id] || (includeImage ? (customImageUrl.trim() || selectedImageUrl) : null);
                              const baseMsg = resolveUserMessage(c);
                              const fullMsg = userImg ? `${baseMsg}\n\n[Promo Banner: ${userImg}]` : baseMsg;
                              window.location.href = `mailto:${c.email}?subject=${encodeURIComponent('Special Treat from IceCream Melt!')}&body=${encodeURIComponent(fullMsg)}`;
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px',
                              background: '#4a154b',
                              color: '#ffffff',
                              border: 'none',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            ✉️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Message Composer Card */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '1.25rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 6px 20px -8px rgba(120, 20, 60, 0.08)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#2b1233' }}>
                Campaign Composer
              </h3>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#d61c5d' }}>
                {selectedUserIds.size} Recipients Selected
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6f5569' }}>
              Compose broadcast to send everyone the same message or individualized messages
            </p>
          </div>

          {/* Dispatch Channel Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Dispatch Channel
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {[
                { id: 'WHATSAPP', label: '💬 WhatsApp', bg: '#25D366' },
                { id: 'EMAIL', label: '📧 Email', bg: '#4a154b' },
                { id: 'SMS', label: '📱 SMS', bg: '#d61c5d' },
              ].map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setChannel(ch.id as MessageChannel)}
                  style={{
                    padding: '0.65rem 0.5rem',
                    borderRadius: '0.75rem',
                    border: channel === ch.id ? `2px solid ${ch.bg}` : '1px solid #f4d3dd',
                    background: channel === ch.id ? `${ch.bg}15` : '#ffffff',
                    color: channel === ch.id ? ch.bg : '#6f5569',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sending Mode Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Message Customization Mode
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setSendMode('SAME_ALL')}
                style={{
                  padding: '0.55rem',
                  borderRadius: '0.75rem',
                  border: sendMode === 'SAME_ALL' ? '2px solid #d61c5d' : '1px solid #f4d3dd',
                  background: sendMode === 'SAME_ALL' ? '#fff1f4' : '#ffffff',
                  color: sendMode === 'SAME_ALL' ? '#d61c5d' : '#2b1233',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Same Template for All
              </button>
              <button
                type="button"
                onClick={() => setSendMode('CUSTOM_PER_USER')}
                style={{
                  padding: '0.55rem',
                  borderRadius: '0.75rem',
                  border: sendMode === 'CUSTOM_PER_USER' ? '2px solid #d61c5d' : '1px solid #f4d3dd',
                  background: sendMode === 'CUSTOM_PER_USER' ? '#fff1f4' : '#ffffff',
                  color: sendMode === 'CUSTOM_PER_USER' ? '#d61c5d' : '#2b1233',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Custom Per User ({selectedUserIds.size})
              </button>
            </div>
          </div>

          {/* Template Variables Helper */}
          {sendMode === 'SAME_ALL' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6f5569' }}>
                  Insert Dynamic Variable Chips:
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {[
                  { tag: '{{name}}', label: 'Customer Name' },
                  { tag: '{{total_spent}}', label: 'Total Spent' },
                  { tag: '{{order_count}}', label: 'Order Count' },
                  { tag: '{{category}}', label: 'Tier/Category' },
                  { tag: '{{coupon_code}}', label: 'Promo Code' },
                  { tag: '{{discount}}', label: 'Discount Val' },
                ].map((token) => (
                  <button
                    key={token.tag}
                    type="button"
                    onClick={() => setTemplateMessage((prev) => `${prev} ${token.tag}`)}
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      background: '#fff1f4',
                      border: '1px solid #f4d3dd',
                      color: '#d61c5d',
                      fontSize: '0.6875rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    + {token.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Text Area */}
          {sendMode === 'SAME_ALL' ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.35rem' }}>
                Message Body
              </label>
              <textarea
                rows={4}
                value={templateMessage}
                onChange={(e) => setTemplateMessage(e.target.value)}
                placeholder="Write your promo message..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.85rem',
                  border: '1px solid #f4d3dd',
                  color: '#2b1233',
                  fontSize: '0.8125rem',
                  lineHeight: '1.4',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#6f5569', fontWeight: 700 }}>
                Individual messages for selected customers:
              </div>
              {filteredCustomers
                .filter((c) => selectedUserIds.has(c.id))
                .slice(0, 15)
                .map((c) => (
                  <div key={c.id} style={{ border: '1px solid #f4d3dd', borderRadius: '0.65rem', padding: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.25rem' }}>
                      {c.displayName} ({c.category})
                    </div>
                    <textarea
                      rows={2}
                      value={customMessages[c.id] ?? resolveUserMessage(c)}
                      onChange={(e) =>
                        setCustomMessages({ ...customMessages, [c.id]: e.target.value })
                      }
                      style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                  </div>
                ))}
            </div>
          )}

          {/* Targeted Promo / Coupon Code Section */}
          <div
            style={{
              background: attachPromoCode ? '#fff9fa' : '#ffffff',
              borderRadius: '1rem',
              border: attachPromoCode ? '2px solid #ffd1dc' : '1px solid #f4d3dd',
              padding: '1rem',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: attachPromoCode ? '0.75rem' : 0 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#2b1233', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={attachPromoCode}
                  onChange={(e) => setAttachPromoCode(e.target.checked)}
                  style={{ accentColor: '#d61c5d' }}
                />
                <span>🎁 Attach Private Promo Code (Synced to Customer Cart)</span>
              </label>
              {attachPromoCode && (
                <button
                  type="button"
                  onClick={generateRandomPromoCode}
                  style={{
                    padding: '0.2rem 0.55rem',
                    borderRadius: '9999px',
                    border: '1px solid #ffd1dc',
                    background: '#fff1f4',
                    color: '#d61c5d',
                    fontSize: '0.6875rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  🎲 Randomize Code
                </button>
              )}
            </div>

            {attachPromoCode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.2rem' }}>
                      Promo Code
                    </label>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #f4d3dd',
                        fontSize: '0.8125rem',
                        fontWeight: 900,
                        color: '#d61c5d',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.2rem' }}>
                      Discount Type & Val
                    </label>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <select
                        value={promoDiscountType}
                        onChange={(e) => setPromoDiscountType(e.target.value as any)}
                        style={{
                          padding: '0.4rem 0.35rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #f4d3dd',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        <option value="PERCENTAGE">% Off</option>
                        <option value="FIXED">₹ Off</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={promoDiscountValue}
                        onChange={(e) => setPromoDiscountValue(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '0.4rem 0.5rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #f4d3dd',
                          fontSize: '0.8125rem',
                          fontWeight: 800,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.2rem' }}>
                      Min Order Value (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={promoMinOrder}
                      onChange={(e) => setPromoMinOrder(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #f4d3dd',
                        fontSize: '0.75rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.2rem' }}>
                      Validity (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={promoExpiryDays}
                      onChange={(e) => setPromoExpiryDays(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #f4d3dd',
                        fontSize: '0.75rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.6875rem', color: '#166534', background: '#dcfce7', padding: '0.35rem 0.6rem', borderRadius: '0.4rem', fontWeight: 700 }}>
                  ⚡ Synced: When sent, this code automatically appears in the recipient&apos;s Cart view with an instant &ldquo;Apply Code&rdquo; button.
                </div>
              </div>
            )}
          </div>

          {/* Image & Banner Media Attachment */}
          <div style={{ borderTop: '1px dashed #f4d3dd', paddingTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2b1233', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeImage}
                  onChange={(e) => setIncludeImage(e.target.checked)}
                  style={{ accentColor: '#d61c5d' }}
                />
                <span>Attach Promo Image / Banner</span>
              </label>
              {includeImage && (
                <span style={{ fontSize: '0.6875rem', color: '#166534', fontWeight: 800 }}>
                  ✓ Media Active
                </span>
              )}
            </div>

            {includeImage && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* Upload Global Image File */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label
                    style={{
                      padding: '0.45rem 0.85rem',
                      background: '#fff1f4',
                      border: '1px solid #f4d3dd',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      color: '#d61c5d',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span>📁 Upload Image from Computer</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => e.target.files?.[0] && handleGlobalImageUpload(e.target.files[0])}
                    />
                  </label>
                  {customImageUrl && (
                    <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 800 }}>
                      ✓ Local Image Loaded
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.45rem' }}>
                  {PROMO_IMAGE_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedImageUrl(preset.url);
                        setCustomImageUrl('');
                      }}
                      style={{
                        padding: '0.45rem',
                        borderRadius: '0.65rem',
                        border: selectedImageUrl === preset.url && !customImageUrl ? '2px solid #d61c5d' : '1px solid #f4d3dd',
                        background: '#fff1f4',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        color: '#2b1233',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <img src={preset.url} alt="" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Or paste custom image URL..."
                  value={customImageUrl}
                  onChange={(e) => setCustomImageUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #f4d3dd',
                    fontSize: '0.72rem',
                    boxSizing: 'border-box',
                  }}
                />

                <p style={{ margin: '0.15rem 0 0', fontSize: '0.6875rem', color: '#6f5569' }}>
                  💡 Tip: You can also upload different/unique images for each recipient using the &ldquo;📷 Add Custom Pic&rdquo; button on their row in the table!
                </p>
              </div>
            )}
          </div>

          {/* Action Trigger */}
          <button
            type="button"
            disabled={sending || selectedUserIds.size === 0}
            onClick={handleSendBroadcast}
            style={{
              padding: '0.85rem 1.5rem',
              background: 'linear-gradient(135deg, #d61c5d 0%, #a3134a 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9999px',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: sending || selectedUserIds.size === 0 ? 'not-allowed' : 'pointer',
              opacity: sending || selectedUserIds.size === 0 ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(214, 28, 93, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '0.5rem',
            }}
          >
            <span>🚀</span>
            <span>
              {sending
                ? 'Dispatching Campaign...'
                : `Send to ${selectedUserIds.size} Customers via ${channel}`}
            </span>
          </button>

          {/* Broadcast Result Feedback */}
          {broadcastResult && (
            <div
              style={{
                padding: '1rem',
                borderRadius: '0.85rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>✅</span> Broadcast Dispatched Successfully!
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem' }}>
                Dispatched {broadcastResult.dispatchedCount} messages via {broadcastResult.channel}. Campaign ID: <code style={{ fontWeight: 700 }}>{broadcastResult.campaignId.slice(0, 14)}...</code>
              </p>
              {broadcastResult.promoAssigned && (
                <div style={{ marginTop: '0.4rem', padding: '0.35rem 0.6rem', background: '#dcfce7', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, color: '#14532d' }}>
                  🎁 Private Promo Code [{promoCode.toUpperCase()}] successfully saved &amp; linked to {broadcastResult.promoAssigned.assignedCount} customer cart(s)!
                </div>
              )}
              {broadcastResult.previews && broadcastResult.previews.length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {broadcastResult.previews.slice(0, 3).map((p, idx) => (
                    <a
                      key={idx}
                      href={p.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '0.2rem 0.6rem',
                        background: '#ffffff',
                        border: '1px solid #86efac',
                        borderRadius: '9999px',
                        color: '#15803d',
                        textDecoration: 'none',
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                      }}
                    >
                      Open {p.name}&apos;s Chat &rarr;
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
