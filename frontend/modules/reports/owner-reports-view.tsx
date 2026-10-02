'use client';

import React, { useState } from 'react';
import { Branch } from '@/shared/types/entities.types';

export interface OwnerReportsViewProps {
  branches: Branch[];
  selectedBranchId?: string;
}

type ReportSection = 'history' | 'inventory' | 'branches' | 'ledger' | 'customers';

export default function OwnerReportsView({ branches, selectedBranchId = 'ALL' }: OwnerReportsViewProps) {
  const [downloadingType, setDownloadingType] = useState<ReportSection | null>(null);

  // Filters for Customer Report
  const [customerAgeGroup, setCustomerAgeGroup] = useState<string>('ALL');
  const [customerOrderAmount, setCustomerOrderAmount] = useState<string>('ALL');
  const [customerOrderFreq, setCustomerOrderFreq] = useState<string>('ALL');

  // Share modal state
  const [shareReportType, setShareReportType] = useState<ReportSection | null>(null);
  const [shareRecipientName, setShareRecipientName] = useState<string>('');
  const [shareRecipientContact, setShareRecipientContact] = useState<string>('');
  const [shareChannel, setShareChannel] = useState<'WHATSAPP' | 'EMAIL'>('WHATSAPP');
  const [shareSuccess, setShareSuccess] = useState<boolean>(false);

  // Trigger download directly from API
  const handleDownloadReport = async (type: ReportSection) => {
    setDownloadingType(type);
    try {
      const url = new URL('/api/v1/owner/reports', window.location.origin);
      url.searchParams.set('type', type);
      url.searchParams.set('format', 'csv');
      url.searchParams.set('branchId', selectedBranchId);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to generate report export');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `icecream-melt-${type}-report-${timestamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error generating report download');
    } finally {
      setDownloadingType(null);
    }
  };

  // Share report summary to individual
  const handleShareReport = () => {
    if (!shareRecipientContact.trim()) {
      alert('Please enter a phone number or email address');
      return;
    }

    const reportTitles: Record<ReportSection, string> = {
      history: 'Order History & Sales Audit Report',
      inventory: 'Inventory Valuation & Stock Balance Report',
      branches: 'Multi-Branch Enterprise Operations Report',
      ledger: 'Financial GST & Revenue Ledger Report',
      customers: 'Customer Segmentation & Analytics Report',
    };

    const title = reportTitles[shareReportType ?? 'history'];
    const summaryText = `Hello ${shareRecipientName || 'Team'}! 📊 Here is the official ${title} from IceCream Melt ERP.\n\nGenerated on: ${new Date().toLocaleDateString()}\nScope: ${selectedBranchId === 'ALL' ? 'Enterprise (All Branches)' : 'Branch ' + selectedBranchId}\nStatus: Audited & Reconciled.\n\nYou can access or review this report directly in the Owner Portal.`;

    if (shareChannel === 'WHATSAPP') {
      const cleanPhone = shareRecipientContact.replace(/[^0-9]/g, '');
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(summaryText)}`;
      window.open(waUrl, '_blank');
    } else {
      const mailtoUrl = `mailto:${shareRecipientContact}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(summaryText)}`;
      window.location.href = mailtoUrl;
    }

    setShareSuccess(true);
    setTimeout(() => {
      setShareSuccess(false);
      setShareReportType(null);
    }, 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          borderRadius: '1.5rem',
          padding: '2rem 2.25rem',
          color: '#ffffff',
          boxShadow: '0 12px 36px -12px rgba(49, 46, 129, 0.35)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.18)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.65rem' }}>
            <span>📥</span> Owner Executive Analytics
          </div>
          <h1 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.85rem', fontWeight: 800, margin: 0 }}>
            Reports & Data Exports Hub
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', fontWeight: 500, maxWidth: '650px' }}>
            Download complete CSV spreadsheets for Orders, Inventory, Branches, Ledger, and Customer Profiles. Share reports with team members or accountants via WhatsApp or Email.
          </p>
        </div>
      </div>

      {/* Reports Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {/* Report 1: Order History */}
        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.5rem', boxShadow: '0 6px 20px -8px rgba(120, 20, 60, 0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '2rem' }}>📜</span>
              <span style={{ background: '#eff6ff', color: '#1e40af', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 800 }}>
                Orders & Sales
              </span>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.15rem', fontWeight: 800, color: '#2b1233', margin: '0.75rem 0 0.35rem' }}>
              Order History Report
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0, lineHeight: 1.4 }}>
              Full chronological order audit logs with order numbers, timestamps, item counts, totals, payment statuses, and branch mappings.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px dashed #f4d3dd', paddingTop: '1rem' }}>
            <button
              type="button"
              disabled={downloadingType === 'history'}
              onClick={() => handleDownloadReport('history')}
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                background: '#2b1233',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {downloadingType === 'history' ? 'Exporting...' : '📥 Download CSV'}
            </button>
            <button
              type="button"
              onClick={() => setShareReportType('history')}
              style={{
                padding: '0.65rem 0.85rem',
                background: '#fff1f4',
                color: '#d61c5d',
                border: '1px solid #f4d3dd',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Share 📤
            </button>
          </div>
        </div>

        {/* Report 2: Inventory */}
        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.5rem', boxShadow: '0 6px 20px -8px rgba(120, 20, 60, 0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '2rem' }}>📦</span>
              <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 800 }}>
                Stock & Valuation
              </span>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.15rem', fontWeight: 800, color: '#2b1233', margin: '0.75rem 0 0.35rem' }}>
              Inventory Valuation Report
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0, lineHeight: 1.4 }}>
              Current stock on hand for finished ice cream tubs and raw dairy/flavor ingredients, reorder thresholds, and stock health status.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px dashed #f4d3dd', paddingTop: '1rem' }}>
            <button
              type="button"
              disabled={downloadingType === 'inventory'}
              onClick={() => handleDownloadReport('inventory')}
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                background: '#2b1233',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {downloadingType === 'inventory' ? 'Exporting...' : '📥 Download CSV'}
            </button>
            <button
              type="button"
              onClick={() => setShareReportType('inventory')}
              style={{
                padding: '0.65rem 0.85rem',
                background: '#fff1f4',
                color: '#d61c5d',
                border: '1px solid #f4d3dd',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Share 📤
            </button>
          </div>
        </div>

        {/* Report 3: Branches */}
        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.5rem', boxShadow: '0 6px 20px -8px rgba(120, 20, 60, 0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '2rem' }}>🏢</span>
              <span style={{ background: '#fdf2f8', color: '#9d174d', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 800 }}>
                Multi-Branch
              </span>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.15rem', fontWeight: 800, color: '#2b1233', margin: '0.75rem 0 0.35rem' }}>
              Branch Operations Report
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0, lineHeight: 1.4 }}>
              Enterprise performance summary across all operating branches, total order volume, completed fulfillment rate, and active statuses.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px dashed #f4d3dd', paddingTop: '1rem' }}>
            <button
              type="button"
              disabled={downloadingType === 'branches'}
              onClick={() => handleDownloadReport('branches')}
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                background: '#2b1233',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {downloadingType === 'branches' ? 'Exporting...' : '📥 Download CSV'}
            </button>
            <button
              type="button"
              onClick={() => setShareReportType('branches')}
              style={{
                padding: '0.65rem 0.85rem',
                background: '#fff1f4',
                color: '#d61c5d',
                border: '1px solid #f4d3dd',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Share 📤
            </button>
          </div>
        </div>

        {/* Report 4: Ledger & GST Tax */}
        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.5rem', boxShadow: '0 6px 20px -8px rgba(120, 20, 60, 0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '2rem' }}>📑</span>
              <span style={{ background: '#dcfce7', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 800 }}>
                Financial & GST
              </span>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.15rem', fontWeight: 800, color: '#2b1233', margin: '0.75rem 0 0.35rem' }}>
              Financial & GST Ledger Report
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: 0, lineHeight: 1.4 }}>
              Payment method breakdown (Cash vs UPI vs Card), estimated CGST (2.5%), SGST (2.5%), and net taxable turnover for accountants.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px dashed #f4d3dd', paddingTop: '1rem' }}>
            <button
              type="button"
              disabled={downloadingType === 'ledger'}
              onClick={() => handleDownloadReport('ledger')}
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                background: '#2b1233',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {downloadingType === 'ledger' ? 'Exporting...' : '📥 Download CSV'}
            </button>
            <button
              type="button"
              onClick={() => setShareReportType('ledger')}
              style={{
                padding: '0.65rem 0.85rem',
                background: '#fff1f4',
                color: '#d61c5d',
                border: '1px solid #f4d3dd',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Share 📤
            </button>
          </div>
        </div>

        {/* Report 5: Customer Categorization & Analytics */}
        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.5rem', boxShadow: '0 6px 20px -8px rgba(120, 20, 60, 0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gridColumn: 'span 2' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '2rem' }}>👥</span>
              <span style={{ background: '#fce7f3', color: '#9d174d', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 800 }}>
                Customer Categorization & Analytics
              </span>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.15rem', fontWeight: 800, color: '#2b1233', margin: '0.75rem 0 0.35rem' }}>
              Customer Insights & Demographics Report
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#6f5569', margin: '0 0 1rem', lineHeight: 1.4 }}>
              Categorized user data with order frequency, total spending, average ticket size, and age group breakdown.
            </p>

            {/* In-card filters for customer report */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: '#fff1f4', padding: '0.85rem', borderRadius: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.2rem' }}>
                  Filter by Age Group
                </label>
                <select
                  value={customerAgeGroup}
                  onChange={(e) => setCustomerAgeGroup(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '0.5rem', border: '1px solid #f4d3dd', fontSize: '0.75rem', fontWeight: 700 }}
                >
                  <option value="ALL">All Ages</option>
                  <option value="18-24">18 - 24 Years</option>
                  <option value="25-34">25 - 34 Years</option>
                  <option value="35-49">35 - 49 Years</option>
                  <option value="50+">50+ Years</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.2rem' }}>
                  Filter by Order Amount
                </label>
                <select
                  value={customerOrderAmount}
                  onChange={(e) => setCustomerOrderAmount(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '0.5rem', border: '1px solid #f4d3dd', fontSize: '0.75rem', fontWeight: 700 }}
                >
                  <option value="ALL">Any Spending Amount</option>
                  <option value="<500">Under ₹500</option>
                  <option value="500-2000">₹500 - ₹2,000</option>
                  <option value=">2000">Over ₹2,000 (VIP High Spend)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.2rem' }}>
                  Filter by Order Frequency
                </label>
                <select
                  value={customerOrderFreq}
                  onChange={(e) => setCustomerOrderFreq(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '0.5rem', border: '1px solid #f4d3dd', fontSize: '0.75rem', fontWeight: 700 }}
                >
                  <option value="ALL">All Frequencies</option>
                  <option value="1">1 Order (Single Visit)</option>
                  <option value="2-5">2 - 5 Orders</option>
                  <option value="6+">6+ Orders (Loyal Shoppers)</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px dashed #f4d3dd', paddingTop: '1rem' }}>
            <button
              type="button"
              disabled={downloadingType === 'customers'}
              onClick={() => handleDownloadReport('customers')}
              style={{
                flex: 1,
                padding: '0.75rem 1.25rem',
                background: 'linear-gradient(135deg, #d61c5d 0%, #a3134a 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(214, 28, 93, 0.25)',
              }}
            >
              {downloadingType === 'customers' ? 'Exporting Customers...' : '📥 Download Categorized Customers CSV'}
            </button>
            <button
              type="button"
              onClick={() => setShareReportType('customers')}
              style={{
                padding: '0.75rem 1.25rem',
                background: '#fff1f4',
                color: '#d61c5d',
                border: '1px solid #f4d3dd',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Share Report 📤
            </button>
          </div>
        </div>
      </div>

      {/* Share / Send to Individual Modal */}
      {shareReportType && (
        <div
          style={{ zIndex: 10000 }}
          className="fixed inset-0 bg-[#2b1233]/70 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-4 text-[#2b1233]">
            <div className="flex justify-between items-center border-b border-[#f4d3dd] pb-3">
              <h3 className="font-display text-lg font-bold text-[#2b1233]">
                Share Report via {shareChannel}
              </h3>
              <button
                type="button"
                onClick={() => setShareReportType(null)}
                className="w-8 h-8 rounded-full bg-[#fff1f4] text-[#2b1233] flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6f5569] mb-1">Channel</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShareChannel('WHATSAPP')}
                  className={`p-2.5 rounded-xl border text-xs font-bold ${
                    shareChannel === 'WHATSAPP'
                      ? 'border-[#25D366] bg-[#25D366]/10 text-[#25D366]'
                      : 'border-[#f4d3dd] bg-white text-[#6f5569]'
                  }`}
                >
                  💬 WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setShareChannel('EMAIL')}
                  className={`p-2.5 rounded-xl border text-xs font-bold ${
                    shareChannel === 'EMAIL'
                      ? 'border-[#4a154b] bg-[#4a154b]/10 text-[#4a154b]'
                      : 'border-[#f4d3dd] bg-white text-[#6f5569]'
                  }`}
                >
                  📧 Email
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6f5569] mb-1">Recipient Name</label>
              <input
                type="text"
                placeholder="e.g. Chief Accountant, Store Manager"
                value={shareRecipientName}
                onChange={(e) => setShareRecipientName(e.target.value)}
                className="w-full px-3 py-2 bg-[#fff1f4] border border-[#f4d3dd] rounded-xl text-xs font-bold text-[#2b1233]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6f5569] mb-1">
                {shareChannel === 'WHATSAPP' ? 'WhatsApp Phone Number *' : 'Email Address *'}
              </label>
              <input
                type={shareChannel === 'WHATSAPP' ? 'tel' : 'email'}
                placeholder={shareChannel === 'WHATSAPP' ? 'e.g. 919876543210' : 'e.g. finance@icecream-melt.com'}
                value={shareRecipientContact}
                onChange={(e) => setShareRecipientContact(e.target.value)}
                className="w-full px-3 py-2 bg-[#fff1f4] border border-[#f4d3dd] rounded-xl text-xs font-bold text-[#2b1233]"
              />
            </div>

            {shareSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-xl text-center">
                ✓ Report Summary Sent!
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#f4d3dd]">
              <button
                type="button"
                onClick={() => setShareReportType(null)}
                className="px-4 py-2 bg-[#fff1f4] text-[#2b1233] text-xs font-bold rounded-full"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleShareReport}
                className="px-5 py-2 bg-[#d61c5d] text-white text-xs font-bold rounded-full shadow-[0_3px_0_#a3134a]"
              >
                Send Summary Now &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
