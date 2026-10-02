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

  // Recipe / BOM Modal states
  const [recipeProduct, setRecipeProduct] = useState<{ id: string; name: string } | null>(null);
  const [recipeComponents, setRecipeComponents] = useState<Array<{ rawMaterialId: string; quantityRequired: number }>>([]);
  const [recipeLoading, setRecipeLoading] = useState<boolean>(false);
  const [recipeSubmitting, setRecipeSubmitting] = useState<boolean>(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  // Add Raw Material Modal states
  const [showAddMatModal, setShowAddMatModal] = useState<boolean>(false);
  const [newMatName, setNewMatName] = useState<string>('');
  const [newMatUnit, setNewMatUnit] = useState<string>('units');
  const [newMatQuantity, setNewMatQuantity] = useState<string>('0');
  const [newMatThreshold, setNewMatThreshold] = useState<string>('10');
  const [matSubmitting, setMatSubmitting] = useState<boolean>(false);
  const [matError, setMatError] = useState<string | null>(null);

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

  const handleOpenRecipe = async (productId: string, productName: string) => {
    setRecipeProduct({ id: productId, name: productName });
    setRecipeComponents([]);
    setRecipeError(null);
    setRecipeLoading(true);

    try {
      const res = await apiClient.request<Array<{ raw_material_id: string; quantity_required: number }>>(
        `/api/v1/branches/${branchId}/inventory/bom/${productId}`,
        {
          authenticated: true,
          requireSession: true,
        },
      );

      if (res.success) {
        setRecipeComponents(
          res.data.map((c) => ({
            rawMaterialId: c.raw_material_id,
            quantityRequired: c.quantity_required,
          })),
        );
      } else {
        setRecipeError(res.error.message || 'Failed to load recipe');
      }
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : 'Error loading recipe');
    } finally {
      setRecipeLoading(false);
    }
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeProduct) return;

    setRecipeSubmitting(true);
    setRecipeError(null);

    try {
      const formatted = recipeComponents.filter((c) => c.rawMaterialId && c.quantityRequired > 0);
      const res = await apiClient.request(
        `/api/v1/branches/${branchId}/inventory/bom/${recipeProduct.id}`,
        {
          method: 'PUT',
          authenticated: true,
          requireSession: true,
          body: JSON.stringify({ components: formatted }),
        },
      );

      if (!res.success) {
        throw new Error(res.error.message || 'Failed to update recipe');
      }

      setRecipeProduct(null);
      await fetchInventory();
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : 'Error saving recipe');
    } finally {
      setRecipeSubmitting(false);
    }
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatName.trim()) return;

    setMatSubmitting(true);
    setMatError(null);

    try {
      const res = await apiClient.request(`/api/v1/branches/${branchId}/inventory/raw-materials`, {
        method: 'POST',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify({
          name: newMatName.trim(),
          unit: newMatUnit.trim(),
          current_quantity: parseFloat(newMatQuantity) || 0,
          reorder_threshold: parseFloat(newMatThreshold) || 0,
        }),
      });

      if (!res.success) {
        throw new Error(res.error.message || 'Failed to create raw material');
      }

      setShowAddMatModal(false);
      setNewMatName('');
      setNewMatQuantity('0');
      setNewMatThreshold('10');
      await fetchInventory();
    } catch (err) {
      setMatError(err instanceof Error ? err.message : 'Error creating material');
    } finally {
      setMatSubmitting(false);
    }
  };

  const totalLowStockCount = lowStock.products.length + lowStock.rawMaterials.length;

  return (
    <div className="space-y-6">
      {/* Low Stock Alert Banner */}
      {totalLowStockCount > 0 && (
        <div className="p-4 bg-[#ffcf4d]/25 border border-[#ffcf4d] rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🍦</span>
            <div>
              <h4 className="text-sm font-extrabold text-[#2b1233]">
                Low Stock Alert ({totalLowStockCount} items below threshold)
              </h4>
              <p className="text-xs text-[#2b1233]/80 font-medium">
                {lowStock.products.length} finished product(s) and {lowStock.rawMaterials.length} raw material(s) need refilling.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab(lowStock.products.length > 0 ? 'products' : 'materials')}
            className="px-4 py-2 bg-[#2b1233] hover:bg-[#431d4e] text-white font-extrabold text-xs rounded-full transition shadow-sm"
          >
            View Low Stock
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-[#f4d3dd] pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 text-xs font-extrabold rounded-full transition ${
              activeTab === 'products'
                ? 'bg-[#d61c5d] text-white shadow-[0_3px_0_#a3134a]'
                : 'bg-white border border-[#f4d3dd] text-[#2b1233] hover:bg-[#fff1f4]'
            }`}
          >
            Finished Products ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('materials')}
            className={`px-4 py-2 text-xs font-extrabold rounded-full transition ${
              activeTab === 'materials'
                ? 'bg-[#d61c5d] text-white shadow-[0_3px_0_#a3134a]'
                : 'bg-white border border-[#f4d3dd] text-[#2b1233] hover:bg-[#fff1f4]'
            }`}
          >
            Raw Materials / BOM ({rawMaterials.length})
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-2 text-xs font-extrabold rounded-full transition ${
              activeTab === 'movements'
                ? 'bg-[#d61c5d] text-white shadow-[0_3px_0_#a3134a]'
                : 'bg-white border border-[#f4d3dd] text-[#2b1233] hover:bg-[#fff1f4]'
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
          className="text-xs text-[#6f5569] hover:text-[#2b1233] font-extrabold flex items-center space-x-1"
        >
          <span>↻ Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-white border border-[#f4d3dd] rounded-2xl text-[#d61c5d] text-sm font-bold shadow-sm">
          {error}
        </div>
      )}

      {/* Tab 1: Finished Products Table */}
      {activeTab === 'products' && (
        <div className="bg-white border border-[#f4d3dd] rounded-2xl shadow-[0_8px_24px_-12px_rgba(120,20,60,0.12)] overflow-hidden">
          <table className="w-full text-left text-sm text-[#2b1233]">
            <thead className="bg-[#fff1f4] text-xs uppercase text-[#6f5569] font-extrabold border-b border-[#f4d3dd]">
              <tr>
                <th className="px-6 py-3.5">Product Name</th>
                <th className="px-6 py-3.5">Current Stock</th>
                <th className="px-6 py-3.5">Threshold</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4d3dd]/60">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#6f5569] font-medium">
                    No products found for this branch.
                  </td>
                </tr>
              ) : (
                products.map((item) => {
                  const isLow = item.quantity <= item.reorder_threshold;
                  return (
                    <tr key={item.id} className="hover:bg-[#fff1f4]/40 transition">
                      <td className="px-6 py-4 font-bold text-[#2b1233]">
                        {item.product_name ?? item.product_id}
                      </td>
                      <td className="px-6 py-4 font-mono font-extrabold">
                        <span className={isLow ? 'text-[#d61c5d]' : 'text-[#2b1233]'}>
                          {item.quantity} units
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#6f5569] font-semibold">
                        {item.reorder_threshold} units
                      </td>
                      <td className="px-6 py-4">
                        {isLow ? (
                          <span className="px-3 py-1 text-xs font-black rounded-full bg-[#ffc2d4] text-[#2b1233]">
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-[#bfe3a6] text-[#2b1233]">
                            OPTIMAL
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenRecipe(item.product_id, item.product_name ?? item.product_id)}
                          className="px-3 py-1 bg-white hover:bg-[#fff1f4] border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
                        >
                          Recipe / BOM
                        </button>
                        <button
                          onClick={() => handleOpenRefill('product', item.product_id, item.product_name ?? item.product_id)}
                          className="px-3 py-1 bg-[#bfe3a6] hover:bg-[#a9d98d] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
                        >
                          + Refill
                        </button>
                        <button
                          onClick={() => handleOpenAdjust('product', item.product_id, item.product_name ?? item.product_id)}
                          className="px-3 py-1 bg-[#fff1f4] hover:bg-white border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
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
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs text-[#6f5569] font-bold">
              Branch Raw Materials & Recipe Ingredients
            </span>
            <button
              onClick={() => {
                setShowAddMatModal(true);
                setMatError(null);
              }}
              className="px-4 py-1.5 bg-[#d61c5d] hover:bg-[#b8144e] text-white text-xs font-bold rounded-full transition shadow-[0_3px_0_#a3134a]"
            >
              + Add Raw Material
            </button>
          </div>
          <div className="bg-white border border-[#f4d3dd] rounded-2xl shadow-[0_8px_24px_-12px_rgba(120,20,60,0.12)] overflow-hidden">
            <table className="w-full text-left text-sm text-[#2b1233]">
            <thead className="bg-[#fff1f4] text-xs uppercase text-[#6f5569] font-extrabold border-b border-[#f4d3dd]">
              <tr>
                <th className="px-6 py-3.5">Material Name</th>
                <th className="px-6 py-3.5">Available Quantity</th>
                <th className="px-6 py-3.5">Unit</th>
                <th className="px-6 py-3.5">Threshold</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4d3dd]/60">
              {rawMaterials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[#6f5569] font-medium">
                    No raw materials tracked for this branch.
                  </td>
                </tr>
              ) : (
                rawMaterials.map((mat) => {
                  const isLow = mat.current_quantity <= mat.reorder_threshold;
                  return (
                    <tr key={mat.id} className="hover:bg-[#fff1f4]/40 transition">
                      <td className="px-6 py-4 font-bold text-[#2b1233]">{mat.name}</td>
                      <td className="px-6 py-4 font-mono font-extrabold">
                        <span className={isLow ? 'text-[#d61c5d]' : 'text-[#2b1233]'}>
                          {mat.current_quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#6f5569] font-semibold">{mat.unit}</td>
                      <td className="px-6 py-4 text-[#6f5569] font-semibold">{mat.reorder_threshold}</td>
                      <td className="px-6 py-4">
                        {isLow ? (
                          <span className="px-3 py-1 text-xs font-black rounded-full bg-[#ffc2d4] text-[#2b1233]">
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-[#bfe3a6] text-[#2b1233]">
                            AVAILABLE
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenRefill('material', mat.id, mat.name, mat.unit)}
                          className="px-3 py-1 bg-[#bfe3a6] hover:bg-[#a9d98d] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
                        >
                          + Refill
                        </button>
                        <button
                          onClick={() => handleOpenAdjust('material', mat.id, mat.name, mat.unit)}
                          className="px-3 py-1 bg-[#fff1f4] hover:bg-white border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
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
        </div>
      )}

      {/* Tab 3: Movement Ledger */}
      {activeTab === 'movements' && (
        <div className="bg-white border border-[#f4d3dd] rounded-2xl shadow-[0_8px_24px_-12px_rgba(120,20,60,0.12)] overflow-hidden">
          <table className="w-full text-left text-sm text-[#2b1233]">
            <thead className="bg-[#fff1f4] text-xs uppercase text-[#6f5569] font-extrabold border-b border-[#f4d3dd]">
              <tr>
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Item / Target</th>
                <th className="px-6 py-3.5">Delta</th>
                <th className="px-6 py-3.5">Reason</th>
                <th className="px-6 py-3.5">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4d3dd]/60 font-mono text-xs">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[#6f5569] font-sans text-sm">
                    No movements recorded yet.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isPositive = m.quantity_delta > 0;
                  return (
                    <tr key={m.id} className="hover:bg-[#fff1f4]/40 transition">
                      <td className="px-6 py-3.5 text-[#6f5569]">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-6 py-3.5 font-bold">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                          m.movement_type === 'ORDER_CONSUMPTION' ? 'bg-[#ffcf4d] text-[#2b1233]' :
                          m.movement_type === 'ORDER_REVERSAL' ? 'bg-[#a9bfff] text-[#2b1233]' :
                          m.movement_type === 'REFILL' ? 'bg-[#bfe3a6] text-[#2b1233]' :
                          'bg-[#fff1f4] text-[#2b1233]'
                        }`}>
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-[#2b1233] font-sans font-bold">
                        {m.product_name ?? m.raw_material_name ?? m.product_id ?? m.raw_material_id}
                      </td>
                      <td className={`px-6 py-3.5 font-bold ${isPositive ? 'text-[#2b1233]' : 'text-[#d61c5d]'}`}>
                        {isPositive ? `+${m.quantity_delta}` : m.quantity_delta}
                      </td>
                      <td className="px-6 py-3.5 text-[#6f5569] font-sans">{m.reason ?? '—'}</td>
                      <td className="px-6 py-3.5 text-[#6f5569]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1233]/45 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-4 text-[#2b1233]">
            <h3 className="font-display text-xl font-bold text-[#2b1233]">
              {modalMode === 'refill' ? 'Refill Stock' : 'Manual Stock Adjustment'}
            </h3>
            <p className="text-xs text-[#6f5569] font-medium">
              Target: <span className="text-[#2b1233] font-bold">{targetItem.name}</span> ({targetItem.type})
            </p>

            {modalError && (
              <div className="p-3 bg-white border border-[#f4d3dd] rounded-xl text-xs text-[#d61c5d] font-bold">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmitModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#6f5569] mb-1">
                  {modalMode === 'refill' ? 'Quantity to Add (+)' : 'Delta (+ for increase, - for decrease)'}
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder={modalMode === 'refill' ? 'e.g. 50' : 'e.g. -5 or 10'}
                  value={modalQuantity}
                  onChange={(e) => setModalQuantity(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-full text-[#2b1233] text-sm font-semibold focus:outline-none focus:border-[#d61c5d]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6f5569] mb-1">
                  Reason {modalMode === 'adjust' && <span className="text-[#d61c5d]">* mandatory</span>}
                </label>
                <input
                  type="text"
                  required={modalMode === 'adjust'}
                  placeholder={modalMode === 'refill' ? 'Stock refill' : 'e.g. Damaged inventory, expired stock, recount'}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-full text-[#2b1233] text-sm font-semibold focus:outline-none focus:border-[#d61c5d]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  disabled={modalSubmitting}
                  className="px-5 py-2.5 bg-[#fff1f4] hover:bg-white border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2.5 bg-[#d61c5d] hover:bg-[#c21853] disabled:opacity-50 text-white text-xs font-extrabold rounded-full transition shadow-[0_3px_0_#a3134a]"
                >
                  {modalSubmitting ? 'Saving...' : 'Confirm Mutation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recipe / BOM Management Modal */}
      {recipeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1233]/45 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-4 text-[#2b1233] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#f4d3dd] pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#2b1233]">Product BOM Recipe</h3>
                <p className="text-xs text-[#6f5569] font-medium">
                  Configuring ingredients for <span className="font-bold text-[#d61c5d]">{recipeProduct.name}</span>
                </p>
              </div>
              <button
                onClick={() => setRecipeProduct(null)}
                className="text-[#6f5569] hover:text-[#2b1233] font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {recipeError && (
              <div className="p-3 bg-white border border-[#f4d3dd] rounded-xl text-xs text-[#d61c5d] font-bold">
                {recipeError}
              </div>
            )}

            {recipeLoading ? (
              <div className="py-8 text-center text-xs text-[#6f5569] font-bold">Loading recipe ingredients...</div>
            ) : (
              <form onSubmit={handleSaveRecipe} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-[#6f5569]">Required Components</label>
                    <button
                      type="button"
                      onClick={() => {
                        const firstMat = rawMaterials[0]?.id ?? '';
                        setRecipeComponents([...recipeComponents, { rawMaterialId: firstMat, quantityRequired: 1 }]);
                      }}
                      className="text-xs text-[#d61c5d] hover:underline font-bold"
                    >
                      + Add Ingredient
                    </button>
                  </div>

                  {recipeComponents.length === 0 ? (
                    <div className="p-4 bg-[#fff1f4] rounded-2xl text-center text-xs text-[#6f5569]">
                      No ingredients configured. Direct finished stock will be consumed upon confirmation.
                    </div>
                  ) : (
                    recipeComponents.map((comp, idx) => {
                      const selectedMat = rawMaterials.find((m) => m.id === comp.rawMaterialId);
                      return (
                        <div key={idx} className="flex items-center gap-2 bg-[#fff1f4]/60 p-2.5 rounded-2xl border border-[#f4d3dd]">
                          <select
                            value={comp.rawMaterialId}
                            onChange={(e) => {
                              const updated = [...recipeComponents];
                              updated[idx].rawMaterialId = e.target.value;
                              setRecipeComponents(updated);
                            }}
                            className="flex-1 px-3 py-1.5 bg-white border border-[#f4d3dd] rounded-xl text-xs text-[#2b1233] font-semibold focus:outline-none focus:border-[#d61c5d]"
                          >
                            {rawMaterials.map((m) => (
                              <option key={m.id} value={m.id} disabled={!m.active}>
                                {m.name} ({m.unit}){m.active ? '' : ' - Inactive'}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1 w-28">
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              required
                              value={comp.quantityRequired}
                              onChange={(e) => {
                                const updated = [...recipeComponents];
                                updated[idx].quantityRequired = parseFloat(e.target.value) || 0;
                                setRecipeComponents(updated);
                              }}
                              className="w-full px-2.5 py-1.5 bg-white border border-[#f4d3dd] rounded-xl text-xs font-mono text-[#2b1233] focus:outline-none focus:border-[#d61c5d]"
                            />
                            <span className="text-[10px] text-[#6f5569] font-bold uppercase truncate">
                              {selectedMat?.unit ?? 'units'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setRecipeComponents(recipeComponents.filter((_, i) => i !== idx));
                            }}
                            className="px-2 py-1 text-xs text-[#d61c5d] hover:bg-rose-50 rounded-lg font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-[#f4d3dd]">
                  <button
                    type="button"
                    onClick={() => setRecipeProduct(null)}
                    disabled={recipeSubmitting}
                    className="px-5 py-2.5 bg-[#fff1f4] hover:bg-white border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={recipeSubmitting}
                    className="px-5 py-2.5 bg-[#d61c5d] hover:bg-[#c21853] disabled:opacity-50 text-white text-xs font-extrabold rounded-full transition shadow-[0_3px_0_#a3134a]"
                  >
                    {recipeSubmitting ? 'Saving Recipe...' : 'Save Recipe'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add Raw Material Modal */}
      {showAddMatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1233]/45 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-4 text-[#2b1233]">
            <h3 className="font-display text-xl font-bold text-[#2b1233]">Create Raw Material</h3>

            {matError && (
              <div className="p-3 bg-white border border-[#f4d3dd] rounded-xl text-xs text-[#d61c5d] font-bold">
                {matError}
              </div>
            )}

            <form onSubmit={handleCreateMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#6f5569] mb-1">Material Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Whole Milk, Cocoa Powder, Vanilla Extract"
                  value={newMatName}
                  onChange={(e) => setNewMatName(e.target.value)}
                  className="w-full px-4 py-2 bg-[#fff1f4] border border-[#f4d3dd] rounded-full text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] font-semibold"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Unit *</label>
                  <input
                    type="text"
                    required
                    placeholder="ml, g, units"
                    value={newMatUnit}
                    onChange={(e) => setNewMatUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-[#fff1f4] border border-[#f4d3dd] rounded-full text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Initial Stock</label>
                  <input
                    type="number"
                    step="any"
                    value={newMatQuantity}
                    onChange={(e) => setNewMatQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-[#fff1f4] border border-[#f4d3dd] rounded-full text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] font-semibold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Threshold</label>
                  <input
                    type="number"
                    step="any"
                    value={newMatThreshold}
                    onChange={(e) => setNewMatThreshold(e.target.value)}
                    className="w-full px-3 py-2 bg-[#fff1f4] border border-[#f4d3dd] rounded-full text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] font-semibold font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMatModal(false)}
                  disabled={matSubmitting}
                  className="px-5 py-2.5 bg-[#fff1f4] hover:bg-white border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={matSubmitting}
                  className="px-5 py-2.5 bg-[#d61c5d] hover:bg-[#c21853] disabled:opacity-50 text-white text-xs font-extrabold rounded-full transition shadow-[0_3px_0_#a3134a]"
                >
                  {matSubmitting ? 'Creating...' : 'Create Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
