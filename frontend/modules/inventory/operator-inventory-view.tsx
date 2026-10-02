'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Inventory, RawMaterial, InventoryMovement } from '../../../shared/types/entities.types';
import { apiClient } from '../../services/api-client';

interface OperatorInventoryViewProps {
  branchId: string;
}

export const OperatorInventoryView: React.FC<OperatorInventoryViewProps> = ({ branchId }) => {
  const [activeTab, setActiveTab] = useState<'products' | 'materials' | 'movements'>('products');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Array<Inventory & { product_name?: string }>>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [lowStock, setLowStock] = useState<{ products: Inventory[]; rawMaterials: RawMaterial[] }>({
    products: [],
    rawMaterials: [],
  });
  const [movements, setMovements] = useState<Array<InventoryMovement & { product_name?: string; raw_material_name?: string }>>([]);

  // Modal states
  const [modalMode, setModalMode] = useState<'refill' | 'adjust' | null>(null);
  const [targetItem, setTargetItem] = useState<{
    type: 'product' | 'material';
    id: string;
    name: string;
    unit?: string;
  } | null>(null);
  const [modalQuantity, setModalQuantity] = useState<string>('');
  const [modalReason, setModalReason] = useState<string>('');
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.request<{
        products: Array<Inventory & { product_name?: string }>;
        rawMaterials: RawMaterial[];
        lowStock: { products: Inventory[]; rawMaterials: RawMaterial[] };
      }>(`/api/v1/branches/${branchId}/inventory`, {
        authenticated: true,
        requireSession: true,
      });

      if (res.success) {
        setProducts(res.data.products);
        setRawMaterials(res.data.rawMaterials);
        setLowStock(res.data.lowStock);
      } else {
        setError(res.error.message || 'Failed to fetch inventory');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching inventory');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const fetchMovements = useCallback(async () => {
    try {
      const res = await apiClient.request<Array<InventoryMovement & { product_name?: string; raw_material_name?: string }>>(
        `/api/v1/branches/${branchId}/inventory/movements`,
        {
          authenticated: true,
          requireSession: true,
        },
      );
      if (res.success) {
        setMovements(res.data);
      }
    } catch (_err) {
      void _err;
    }
  }, [branchId]);

  useEffect(() => {
    fetchInventory();
    fetchMovements();
  }, [fetchInventory, fetchMovements]);

  const handleOpenRefill = (type: 'product' | 'material', id: string, name: string, unit?: string) => {
    setTargetItem({ type, id, name, unit });
    setModalMode('refill');
    setModalQuantity('');
    setModalReason('Stock refill');
    setModalError(null);
  };

  const handleOpenAdjust = (type: 'product' | 'material', id: string, name: string, unit?: string) => {
    setTargetItem({ type, id, name, unit });
    setModalMode('adjust');
    setModalQuantity('');
    setModalReason('');
    setModalError(null);
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetItem || !modalQuantity) return;
    const qty = parseFloat(modalQuantity);
    if (isNaN(qty)) {
      setModalError('Please enter a valid numeric quantity');
      return;
    }

    if (modalMode === 'adjust' && !modalReason.trim()) {
      setModalError('Adjustment reason is strictly mandatory');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    try {
      if (modalMode === 'refill') {
        const body = targetItem.type === 'product'
          ? { productId: targetItem.id, quantity: qty, reason: modalReason.trim() }
          : { rawMaterialId: targetItem.id, quantity: qty, reason: modalReason.trim() };

        const res = await apiClient.request(`/api/v1/branches/${branchId}/inventory/refill`, {
          method: 'POST',
          authenticated: true,
          requireSession: true,
          body: JSON.stringify(body),
        });

        if (!res.success) {
          throw new Error(res.error.message || 'Refill failed');
        }
      } else if (modalMode === 'adjust') {
        const body = targetItem.type === 'product'
          ? { productId: targetItem.id, delta: qty, reason: modalReason.trim() }
          : { rawMaterialId: targetItem.id, delta: qty, reason: modalReason.trim() };

        const res = await apiClient.request(`/api/v1/branches/${branchId}/inventory/adjust`, {
          method: 'POST',
          authenticated: true,
          requireSession: true,
          body: JSON.stringify(body),
        });

        if (!res.success) {
          throw new Error(res.error.message || 'Adjustment failed');
        }
      }

      setModalMode(null);
      await fetchInventory();
      await fetchMovements();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  const totalLowStockCount = lowStock.products.length + lowStock.rawMaterials.length;

  return (
    <div className="space-y-6">
      {/* Low Stock Alert Banner */}
      {totalLowStockCount > 0 && (
        <div className="p-4 bg-amber-950/40 border border-amber-800 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h4 className="text-sm font-bold text-amber-300">
                Low Stock Warning ({totalLowStockCount} items below threshold)
              </h4>
              <p className="text-xs text-amber-200/80">
                {lowStock.products.length} finished product(s) and {lowStock.rawMaterials.length} raw material(s) need refilling.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab(lowStock.products.length > 0 ? 'products' : 'materials')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition"
          >
            View Low Stock
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'products'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Finished Products ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('materials')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'materials'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Raw Materials / BOM ({rawMaterials.length})
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'movements'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Movement Ledger ({movements.length})
          </button>
        </div>

        <button
          onClick={() => {
            fetchInventory();
            fetchMovements();
          }}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
        >
          <span>↻ Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Tab 1: Finished Products Table */}
      {activeTab === 'products' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Product Name</th>
                <th className="px-6 py-3">Current Stock</th>
                <th className="px-6 py-3">Threshold</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No products found for this branch.
                  </td>
                </tr>
              ) : (
                products.map((item) => {
                  const isLow = item.quantity <= item.reorder_threshold;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4 font-semibold text-white">
                        {item.product_name ?? item.product_id}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold">
                        <span className={isLow ? 'text-rose-400' : 'text-emerald-400'}>
                          {item.quantity} units
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {item.reorder_threshold} units
                      </td>
                      <td className="px-6 py-4">
                        {isLow ? (
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-rose-950/80 border border-rose-800 text-rose-300">
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                            OPTIMAL
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenRefill('product', item.product_id, item.product_name ?? item.product_id)}
                          className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 text-xs font-semibold rounded transition"
                        >
                          + Refill
                        </button>
                        <button
                          onClick={() => handleOpenAdjust('product', item.product_id, item.product_name ?? item.product_id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold rounded transition"
                        >
                          ± Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Raw Materials Table */}
      {activeTab === 'materials' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Material Name</th>
                <th className="px-6 py-3">Available Quantity</th>
                <th className="px-6 py-3">Unit</th>
                <th className="px-6 py-3">Threshold</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rawMaterials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No raw materials tracked for this branch.
                  </td>
                </tr>
              ) : (
                rawMaterials.map((mat) => {
                  const isLow = mat.current_quantity <= mat.reorder_threshold;
                  return (
                    <tr key={mat.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4 font-semibold text-white">{mat.name}</td>
                      <td className="px-6 py-4 font-mono font-bold">
                        <span className={isLow ? 'text-rose-400' : 'text-emerald-400'}>
                          {mat.current_quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{mat.unit}</td>
                      <td className="px-6 py-4 text-slate-400">{mat.reorder_threshold}</td>
                      <td className="px-6 py-4">
                        {isLow ? (
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-rose-950/80 border border-rose-800 text-rose-300">
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                            AVAILABLE
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenRefill('material', mat.id, mat.name, mat.unit)}
                          className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 text-xs font-semibold rounded transition"
                        >
                          + Refill
                        </button>
                        <button
                          onClick={() => handleOpenAdjust('material', mat.id, mat.name, mat.unit)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold rounded transition"
                        >
                          ± Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Movement Ledger */}
      {activeTab === 'movements' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Item / Target</th>
                <th className="px-6 py-3">Delta</th>
                <th className="px-6 py-3">Reason</th>
                <th className="px-6 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500 font-sans text-sm">
                    No movements recorded yet.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isPositive = m.quantity_delta > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-3.5 text-slate-400">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-6 py-3.5 font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          m.movement_type === 'ORDER_CONSUMPTION' ? 'bg-amber-950/80 border border-amber-800 text-amber-300' :
                          m.movement_type === 'ORDER_REVERSAL' ? 'bg-indigo-950/80 border border-indigo-800 text-indigo-300' :
                          m.movement_type === 'REFILL' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-200 font-sans">
                        {m.product_name ?? m.raw_material_name ?? m.product_id ?? m.raw_material_id}
                      </td>
                      <td className={`px-6 py-3.5 font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? `+${m.quantity_delta}` : m.quantity_delta}
                      </td>
                      <td className="px-6 py-3.5 text-slate-400 font-sans">{m.reason ?? '—'}</td>
                      <td className="px-6 py-3.5 text-slate-400">
                        {m.reference_type ? `${m.reference_type}: ${m.reference_id?.slice(0, 8)}...` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Refill / Adjustment Modal */}
      {modalMode && targetItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">
              {modalMode === 'refill' ? 'Refill Stock' : 'Manual Stock Adjustment'}
            </h3>
            <p className="text-xs text-slate-400">
              Target: <span className="text-white font-semibold">{targetItem.name}</span> ({targetItem.type})
            </p>

            {modalError && (
              <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-300">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmitModal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {modalMode === 'refill' ? 'Quantity to Add (+)' : 'Delta (+ for increase, - for decrease)'}
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder={modalMode === 'refill' ? 'e.g. 50' : 'e.g. -5 or 10'}
                  value={modalQuantity}
                  onChange={(e) => setModalQuantity(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Reason {modalMode === 'adjust' && <span className="text-rose-400">* mandatory</span>}
                </label>
                <input
                  type="text"
                  required={modalMode === 'adjust'}
                  placeholder={modalMode === 'refill' ? 'Stock refill' : 'e.g. Damaged inventory, expired stock, recount'}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition"
                >
                  {modalSubmitting ? 'Saving...' : 'Confirm Mutation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
