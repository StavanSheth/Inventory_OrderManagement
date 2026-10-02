'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Inventory, RawMaterial, InventoryMovement } from '../../../shared/types/entities.types';
import { apiClient } from '../../services/api-client';
import { exportToExcel, exportToPdf } from '../../utils/export-helpers';

interface OperatorInventoryViewProps {
  branchId: string;
  isOwner?: boolean;
}

export const OperatorInventoryView: React.FC<OperatorInventoryViewProps> = ({ branchId, isOwner = false }) => {
  const [activeTab, setActiveTab] = useState<'products' | 'materials' | 'movements'>('products');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<
    Array<
      Inventory & {
        product_name?: string;
        selling_price?: number;
        tax_rate?: number;
        cgst_rate?: number;
        sgst_rate?: number;
        igst_rate?: number;
        serving_size?: string;
        price_rate?: number;
        serving_sizes_json?: string;
      }
    >
  >([]);
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

  // Pricing & Taxes Modal states
  const [pricingProduct, setPricingProduct] = useState<{
    id: string;
    name: string;
    selling_price: number;
    tax_rate: number;
    cgst_rate: number;
    sgst_rate: number;
    igst_rate: number;
    serving_size: string;
    price_rate: number;
    serving_sizes_json: string;
  } | null>(null);
  const [editSellingPrice, setEditSellingPrice] = useState<string>('0');
  const [editTaxRate, setEditTaxRate] = useState<string>('5');
  const [editCgstRate, setEditCgstRate] = useState<string>('2.5');
  const [editSgstRate, setEditSgstRate] = useState<string>('2.5');
  const [editIgstRate, setEditIgstRate] = useState<string>('0');
  const [editServingSize, setEditServingSize] = useState<string>('100g');
  const [editPriceRate, setEditPriceRate] = useState<string>('0');
  const [editCustomTiers, setEditCustomTiers] = useState<Array<{ name: string; size: string; price: number }>>([]);
  const [pricingSubmitting, setPricingSubmitting] = useState<boolean>(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Movements Date Filter
  const [movementDateFilter, setMovementDateFilter] = useState<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'LAST_12_MONTHS' | 'ALL'>('ALL');

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

  const handleOpenPricing = (
    item: Inventory & {
      product_name?: string;
      selling_price?: number;
      tax_rate?: number;
      cgst_rate?: number;
      sgst_rate?: number;
      igst_rate?: number;
      serving_size?: string;
      price_rate?: number;
      serving_sizes_json?: string;
    }
  ) => {
    if (!isOwner) return;

    const sp = item.selling_price ?? 0;
    const tr = item.tax_rate ?? 5;
    const cgst = item.cgst_rate ?? tr / 2;
    const sgst = item.sgst_rate ?? tr / 2;
    const igst = item.igst_rate ?? 0;
    const ss = item.serving_size || '100g';
    const pr = item.price_rate ?? 0;

    let tiers: Array<{ name: string; size: string; price: number }> = [];
    try {
      if (item.serving_sizes_json) {
        tiers = JSON.parse(item.serving_sizes_json);
      }
    } catch {
      tiers = [];
    }

    setPricingProduct({
      id: item.product_id,
      name: item.product_name ?? item.product_id,
      selling_price: sp,
      tax_rate: tr,
      cgst_rate: cgst,
      sgst_rate: sgst,
      igst_rate: igst,
      serving_size: ss,
      price_rate: pr,
      serving_sizes_json: item.serving_sizes_json || '[]',
    });
    setEditSellingPrice(sp.toString());
    setEditTaxRate(tr.toString());
    setEditCgstRate(cgst.toString());
    setEditSgstRate(sgst.toString());
    setEditIgstRate(igst.toString());
    setEditServingSize(ss);
    setEditPriceRate(pr.toString());
    setEditCustomTiers(tiers);
    setPricingError(null);
  };

  const handleApplyTaxPreset = (rate: number) => {
    setEditTaxRate(rate.toString());
    setEditCgstRate((rate / 2).toString());
    setEditSgstRate((rate / 2).toString());
    setEditIgstRate('0');
  };

  const handleSavePricing = async () => {
    if (!pricingProduct) return;
    setPricingSubmitting(true);
    setPricingError(null);
    try {
      const sp = parseFloat(editSellingPrice);
      const tr = parseFloat(editTaxRate);
      const cgst = parseFloat(editCgstRate);
      const sgst = parseFloat(editSgstRate);
      const igst = parseFloat(editIgstRate);

      if (isNaN(sp) || sp < 0) {
        setPricingError('Please enter a valid selling price');
        setPricingSubmitting(false);
        return;
      }
      if (isNaN(tr) || tr < 0) {
        setPricingError('Please enter a valid tax rate');
        setPricingSubmitting(false);
        return;
      }

      const res = await apiClient.request(`/api/v1/branches/${branchId}/inventory/pricing`, {
        method: 'PATCH',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify({
          productId: pricingProduct.id,
          selling_price: sp,
          tax_rate: tr,
          cgst_rate: isNaN(cgst) ? tr / 2 : cgst,
          sgst_rate: isNaN(sgst) ? tr / 2 : sgst,
          igst_rate: isNaN(igst) ? 0 : igst,
          serving_size: editServingSize.trim() || '100g',
          price_rate: parseFloat(editPriceRate) || 0,
          serving_sizes_json: JSON.stringify(editCustomTiers),
        }),
      });

      if (res.success) {
        setPricingProduct(null);
        await fetchInventory();
      } else {
        setPricingError(res.error?.message || 'Failed to update pricing & tax');
      }
    } catch (err) {
      setPricingError(err instanceof Error ? err.message : 'Error updating pricing & tax');
    } finally {
      setPricingSubmitting(false);
    }
  };

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.request<{
        products: Array<Inventory & { product_name?: string; selling_price?: number; tax_rate?: number; cgst_rate?: number; sgst_rate?: number; igst_rate?: number }>;
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

  const filteredMovements = movements.filter((m) => {
    if (movementDateFilter === 'ALL') return true;
    const createdAt = new Date(m.created_at).getTime();
    const now = new Date();
    if (movementDateFilter === 'TODAY') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return createdAt >= startOfDay;
    }
    if (movementDateFilter === 'THIS_WEEK') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diff).getTime();
      return createdAt >= startOfWeek;
    }
    if (movementDateFilter === 'THIS_MONTH') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return createdAt >= startOfMonth;
    }
    if (movementDateFilter === 'LAST_3_MONTHS') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return createdAt >= d.getTime();
    }
    if (movementDateFilter === 'LAST_6_MONTHS') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return createdAt >= d.getTime();
    }
    if (movementDateFilter === 'LAST_12_MONTHS') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      return createdAt >= d.getTime();
    }
    return true;
  });

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
      <div className="flex items-center justify-between border-b border-[#f4d3dd] pb-3 gap-2 overflow-x-auto">
        <div className="flex space-x-2 overflow-x-auto pb-1 flex-nowrap">
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

        <div className="flex items-center gap-3">
          {isOwner && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'products') {
                    exportToExcel({
                      filename: `inventory-products-${branchId}`,
                      title: 'Finished Products Stock Report',
                      subtitle: `Branch: ${branchId}`,
                      filterSummary: { Branch: branchId, Tab: 'Finished Products', 'Total Items': products.length },
                      columns: [
                        { header: 'Product Name', key: 'product_name' },
                        { header: 'Product ID', key: 'product_id' },
                        { header: 'In Stock', key: 'quantity_on_hand', format: 'number' },
                        { header: 'Unit', key: 'unit' },
                        { header: 'Min Threshold', key: 'min_threshold', format: 'number' },
                        { header: 'Selling Price (₹)', key: 'selling_price', format: 'currency' },
                        { header: 'Tax Rate (%)', key: 'tax_rate', format: 'number' },
                      ],
                      data: products.map((p) => ({
                        ...p,
                        product_name: p.product_name || p.product_id,
                      })),
                    });
                  } else if (activeTab === 'materials') {
                    exportToExcel({
                      filename: `inventory-materials-${branchId}`,
                      title: 'Raw Materials & BOM Stock Report',
                      subtitle: `Branch: ${branchId}`,
                      filterSummary: { Branch: branchId, Tab: 'Raw Materials', 'Total Items': rawMaterials.length },
                      columns: [
                        { header: 'Material Name', key: 'name' },
                        { header: 'Material ID', key: 'id' },
                        { header: 'Current Stock', key: 'current_stock', format: 'number' },
                        { header: 'Unit', key: 'unit' },
                        { header: 'Min Threshold', key: 'min_threshold', format: 'number' },
                        { header: 'Cost per Unit (₹)', key: 'cost_per_unit', format: 'currency' },
                      ],
                      data: rawMaterials,
                    });
                  } else {
                    exportToExcel({
                      filename: `inventory-movements-${branchId}-${movementDateFilter.toLowerCase()}`,
                      title: 'Inventory Movement Ledger Report',
                      subtitle: `Branch: ${branchId} • Filter: ${movementDateFilter}`,
                      filterSummary: { Branch: branchId, 'Date Filter': movementDateFilter, 'Total Movements': filteredMovements.length },
                      columns: [
                        { header: 'Movement ID', key: 'id' },
                        { header: 'Item Name', key: 'item_name' },
                        { header: 'Type', key: 'movement_type' },
                        { header: 'Delta', key: 'quantity_delta', format: 'number' },
                        { header: 'Reason', key: 'reason' },
                        { header: 'Operator', key: 'operator_id' },
                        { header: 'Date', key: 'created_at' },
                      ],
                      data: filteredMovements.map((m) => ({
                        ...m,
                        item_name: m.product_name || m.raw_material_name || m.product_id || m.raw_material_id,
                      })),
                    });
                  }
                }}
                className="px-3 py-1.5 bg-[#f1f8ed] hover:bg-[#e4f3de] border border-[#c2e0b3] text-[#2d6a1e] text-xs font-bold rounded-full transition shadow-xs flex items-center gap-1 cursor-pointer"
                title="Download formatted Excel (.xls) report with active filters"
              >
                <span>📊</span>
                <span>Export Excel</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'products') {
                    exportToPdf({
                      filename: `inventory-products-${branchId}`,
                      title: 'Finished Products Stock Report',
                      subtitle: `Branch: ${branchId}`,
                      filterSummary: { Branch: branchId, Tab: 'Finished Products', 'Total Items': products.length },
                      columns: [
                        { header: 'Product Name', key: 'product_name' },
                        { header: 'In Stock', key: 'quantity_on_hand', format: 'number' },
                        { header: 'Unit', key: 'unit' },
                        { header: 'Min Threshold', key: 'min_threshold', format: 'number' },
                        { header: 'Selling Price (₹)', key: 'selling_price', format: 'currency' },
                        { header: 'GST (%)', key: 'tax_rate', format: 'number' },
                      ],
                      data: products.map((p) => ({
                        ...p,
                        product_name: p.product_name || p.product_id,
                      })),
                    });
                  } else if (activeTab === 'materials') {
                    exportToPdf({
                      filename: `inventory-materials-${branchId}`,
                      title: 'Raw Materials & BOM Stock Report',
                      subtitle: `Branch: ${branchId}`,
                      filterSummary: { Branch: branchId, Tab: 'Raw Materials', 'Total Items': rawMaterials.length },
                      columns: [
                        { header: 'Material Name', key: 'name' },
                        { header: 'Current Stock', key: 'current_stock', format: 'number' },
                        { header: 'Unit', key: 'unit' },
                        { header: 'Min Threshold', key: 'min_threshold', format: 'number' },
                        { header: 'Cost (₹)', key: 'cost_per_unit', format: 'currency' },
                      ],
                      data: rawMaterials,
                    });
                  } else {
                    exportToPdf({
                      filename: `inventory-movements-${branchId}-${movementDateFilter.toLowerCase()}`,
                      title: 'Inventory Movement Ledger Report',
                      subtitle: `Branch: ${branchId} • Filter: ${movementDateFilter}`,
                      filterSummary: { Branch: branchId, 'Date Filter': movementDateFilter, 'Total Movements': filteredMovements.length },
                      columns: [
                        { header: 'Item Name', key: 'item_name' },
                        { header: 'Type', key: 'movement_type' },
                        { header: 'Delta', key: 'quantity_delta', format: 'number' },
                        { header: 'Reason', key: 'reason' },
                        { header: 'Date', key: 'created_at' },
                      ],
                      data: filteredMovements.map((m) => ({
                        ...m,
                        item_name: m.product_name || m.raw_material_name || m.product_id || m.raw_material_id,
                        created_at: new Date(m.created_at).toLocaleString(),
                      })),
                    });
                  }
                }}
                className="px-3 py-1.5 bg-[#fff1f4] hover:bg-white border border-[#ffd1dc] text-[#d61c5d] text-xs font-bold rounded-full transition shadow-xs flex items-center gap-1 cursor-pointer"
                title="Print or Save as PDF with active filters"
              >
                <span>📄</span>
                <span>Export PDF</span>
              </button>
            </div>
          )}

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
                <th className="px-5 py-3.5">Product Name</th>
                <th className="px-4 py-3.5">Serving & Rate</th>
                <th className="px-4 py-3.5">Selling Price</th>
                <th className="px-5 py-3.5">Tax & Sub-Taxes (GST)</th>
                <th className="px-4 py-3.5">Current Stock</th>
                <th className="px-4 py-3.5">Threshold</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4d3dd]/60">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-[#6f5569] font-medium">
                    No products found for this branch.
                  </td>
                </tr>
              ) : (
                products.map((item) => {
                  const isLow = item.quantity <= item.reorder_threshold;
                  const price = item.selling_price ?? 0;
                  const taxRate = item.tax_rate ?? 5;
                  const cgstRate = item.cgst_rate ?? taxRate / 2;
                  const sgstRate = item.sgst_rate ?? taxRate / 2;
                  const igstRate = item.igst_rate ?? 0;
                  const taxAmount = (price * taxRate) / 100;
                  const cgstAmount = (price * cgstRate) / 100;
                  const sgstAmount = (price * sgstRate) / 100;

                  return (
                    <tr key={item.id} className="hover:bg-[#fff1f4]/40 transition">
                      <td className="px-5 py-4 font-bold text-[#2b1233]">
                        {item.product_name ?? item.product_id}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-extrabold text-[#2b1233] text-xs">
                            {item.serving_size || '100g'}
                          </span>
                          <span className="text-[11px] font-mono font-bold text-[#6f5569]">
                            Rate: ₹{(item.price_rate ?? 0).toFixed(2)}
                          </span>
                          {(() => {
                            try {
                              const parsed = item.serving_sizes_json ? JSON.parse(item.serving_sizes_json) : [];
                              if (Array.isArray(parsed) && parsed.length > 0) {
                                return (
                                  <span className="text-[10px] text-[#d61c5d] font-bold">
                                    {parsed.length} custom {parsed.length === 1 ? 'tier' : 'tiers'}
                                  </span>
                                );
                              }
                            } catch {}
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono font-extrabold text-[#d61c5d]">
                        ₹{price.toFixed(2)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-extrabold text-[#2b1233] text-xs">
                            {taxRate}% GST (+₹{taxAmount.toFixed(2)})
                          </span>
                          <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              SGST {sgstRate}% (₹{sgstAmount.toFixed(2)})
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                              CGST {cgstRate}% (₹{cgstAmount.toFixed(2)})
                            </span>
                            {igstRate > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                IGST {igstRate}%
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono font-extrabold">
                        <span className={isLow ? 'text-[#d61c5d]' : 'text-[#2b1233]'}>
                          {item.quantity} units
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[#6f5569] font-semibold">
                        {item.reorder_threshold} units
                      </td>
                      <td className="px-4 py-4">
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
                      <td className="px-5 py-4 text-right space-x-1.5 whitespace-nowrap">
                        {isOwner && (
                          <button
                            onClick={() => handleOpenPricing(item)}
                            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-extrabold rounded-full transition shadow-sm"
                            title="Configure Serving Sizes, Rates & Taxes (Owner Only)"
                          >
                            ⚙️ Price, Sizes & Taxes
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenRecipe(item.product_id, item.product_name ?? item.product_id)}
                          className="px-2.5 py-1 bg-white hover:bg-[#fff1f4] border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
                        >
                          BOM
                        </button>
                        <button
                          onClick={() => handleOpenRefill('product', item.product_id, item.product_name ?? item.product_id)}
                          className="px-2.5 py-1 bg-[#bfe3a6] hover:bg-[#a9d98d] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
                        >
                          + Refill
                        </button>
                        <button
                          onClick={() => handleOpenAdjust('product', item.product_id, item.product_name ?? item.product_id)}
                          className="px-2.5 py-1 bg-[#fff1f4] hover:bg-white border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
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
        <div className="space-y-3">
          {/* Movement Date Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white border border-[#f4d3dd] rounded-2xl">
            <span className="text-xs font-bold text-[#6f5569] uppercase tracking-wider">Date Filter:</span>
            <div className="flex flex-wrap gap-1">
              {[
                { id: 'ALL', label: 'All Time' },
                { id: 'TODAY', label: 'Today' },
                { id: 'THIS_WEEK', label: 'This Week' },
                { id: 'THIS_MONTH', label: 'This Month' },
                { id: 'LAST_3_MONTHS', label: 'Last 3 Months' },
                { id: 'LAST_6_MONTHS', label: 'Last 6 Months' },
                { id: 'LAST_12_MONTHS', label: 'Last 12 Months' },
              ].map((df) => (
                <button
                  key={df.id}
                  onClick={() => setMovementDateFilter(df.id as any)}
                  className={`px-3 py-1 rounded-full text-xs font-extrabold transition cursor-pointer ${
                    movementDateFilter === df.id
                      ? 'bg-[#d61c5d] text-white shadow-xs'
                      : 'bg-[#fff1f4] text-[#2b1233] hover:bg-white border border-[#f4d3dd]'
                  }`}
                >
                  {df.label}
                </button>
              ))}
            </div>
          </div>

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
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[#6f5569] font-sans text-sm">
                    No movements found for the selected time range.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const isPositive = m.quantity_delta > 0;
                  return (
                    <tr key={m.id} className="hover:bg-[#fff1f4]/40 transition">
                      <td className="px-6 py-3.5 text-[#6f5569]">
                        <span className="font-sans font-semibold mr-1.5">
                          {new Date(m.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
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
        </div>
      )}

      {/* Refill / Adjustment Modal */}
      {modalMode && targetItem && (
        <div
          style={{ zIndex: 9999 }}
          className="fixed inset-0 flex items-center justify-center bg-[#2b1233]/65 backdrop-blur-md p-4 overflow-y-auto"
        >
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-4 text-[#2b1233] my-auto">
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
        <div
          style={{ zIndex: 9999 }}
          className="fixed inset-0 flex items-center justify-center bg-[#2b1233]/65 backdrop-blur-md p-4 overflow-y-auto"
        >
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl space-y-4 text-[#2b1233] max-h-[85vh] overflow-y-auto my-auto">
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
                          <div className="flex items-center gap-1.5 w-36 shrink-0">
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
                              className="w-20 px-2.5 py-1.5 bg-white border border-[#f4d3dd] rounded-xl text-xs font-mono text-[#2b1233] focus:outline-none focus:border-[#d61c5d]"
                            />
                            <span className="text-xs text-[#6f5569] font-bold uppercase whitespace-nowrap bg-white px-2 py-1 rounded-lg border border-[#f4d3dd]">
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
        <div
          style={{ zIndex: 9999 }}
          className="fixed inset-0 flex items-center justify-center bg-[#2b1233]/65 backdrop-blur-md p-4 overflow-y-auto"
        >
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-4 text-[#2b1233] my-auto">
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

      {/* Modal 4: Configure Selling Price & GST Tax Rates */}
      {pricingProduct && (
        <div
          style={{ zIndex: 9999 }}
          className="fixed inset-0 bg-[#2b1233]/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-5 sm:p-8 max-w-xl w-full shadow-2xl space-y-4 text-[#2b1233] max-h-[85vh] overflow-y-auto my-auto relative">
            <div className="sticky -top-5 sm:-top-8 bg-white/95 backdrop-blur-md z-20 -mx-5 -mt-5 sm:-mx-8 sm:-mt-8 p-5 sm:p-8 border-b border-[#f4d3dd] flex justify-between items-center shadow-xs">
              <div>
                <h3 className="font-display text-xl font-bold text-[#2b1233] flex items-center gap-2">
                  <span>⚙️</span>
                  <span>Configure Selling Price & Taxes</span>
                </h3>
                <p className="text-xs text-[#6f5569] font-medium mt-0.5">
                  {pricingProduct.name} &bull; <span className="font-mono text-[#d61c5d] font-bold">{pricingProduct.id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPricingProduct(null)}
                className="w-9 h-9 rounded-full bg-[#fff1f4] hover:bg-[#f4d3dd] text-[#2b1233] flex items-center justify-center text-lg font-bold transition shadow-xs"
                title="Close"
              >
                ✕
              </button>
            </div>

            {pricingError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-bold">
                {pricingError}
              </div>
            )}

            {/* Serving Size & Price Rate (Owner Only) */}
            <div className="bg-[#fff1f4]/60 border border-[#f4d3dd] rounded-2xl p-4 space-y-3">
              <span className="text-xs font-black uppercase text-[#6f5569] tracking-wider block">
                Serving Size & Pricing Rate (Owner Only)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#6f5569] mb-1">
                    Standard Serving Size (e.g. 100g, 150g)
                  </label>
                  <input
                    type="text"
                    value={editServingSize}
                    onChange={(e) => setEditServingSize(e.target.value)}
                    placeholder="100g"
                    className="w-full px-3 py-2 bg-white border border-[#f4d3dd] rounded-xl text-xs font-bold text-[#2b1233] focus:outline-none focus:border-[#d61c5d]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#6f5569] mb-1">
                    Price Rate (₹ per unit or standard rate)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={editPriceRate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditPriceRate(val);
                        const rateNum = parseFloat(val);
                        if (!isNaN(rateNum) && rateNum > 0) {
                          setEditSellingPrice(rateNum.toString());
                        }
                      }}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-white border border-[#f4d3dd] rounded-xl text-xs font-mono font-bold text-[#2b1233] focus:outline-none focus:border-[#d61c5d]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Tiered Serving Sizes */}
            <div className="bg-[#fff1f4]/60 border border-[#f4d3dd] rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-[#6f5569] tracking-wider">
                  Custom Tiered Serving Sizes (Optional)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditCustomTiers([
                      ...editCustomTiers,
                      { name: `Size ${editCustomTiers.length + 1}`, size: '150g', price: parseFloat(editSellingPrice) || 150 },
                    ])
                  }
                  className="text-xs text-[#d61c5d] hover:underline font-bold"
                >
                  + Add Size Tier
                </button>
              </div>

              {editCustomTiers.length === 0 ? (
                <p className="text-xs text-[#6f5569] italic">
                  Using default pricing based on rate & standard serving size. Click above to add customized tiers (e.g. Small / Medium / Large).
                </p>
              ) : (
                <div className="space-y-2">
                  {editCustomTiers.map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-[#f4d3dd]">
                      <input
                        type="text"
                        placeholder="Tier Name (e.g. Small)"
                        value={tier.name}
                        onChange={(e) => {
                          const updated = [...editCustomTiers];
                          updated[idx].name = e.target.value;
                          setEditCustomTiers(updated);
                        }}
                        className="flex-1 px-2.5 py-1.5 border border-[#f4d3dd] rounded-lg text-xs font-bold text-[#2b1233]"
                      />
                      <input
                        type="text"
                        placeholder="Size (e.g. 100g)"
                        value={tier.size}
                        onChange={(e) => {
                          const updated = [...editCustomTiers];
                          updated[idx].size = e.target.value;
                          setEditCustomTiers(updated);
                        }}
                        className="w-20 px-2 py-1.5 border border-[#f4d3dd] rounded-lg text-xs font-bold text-[#2b1233]"
                      />
                      <div className="flex items-center gap-1 w-24">
                        <span className="text-xs font-bold text-[#6f5569]">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={tier.price}
                          onChange={(e) => {
                            const updated = [...editCustomTiers];
                            updated[idx].price = parseFloat(e.target.value) || 0;
                            setEditCustomTiers(updated);
                          }}
                          className="w-full px-2 py-1.5 border border-[#f4d3dd] rounded-lg text-xs font-mono font-bold text-[#d61c5d]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditCustomTiers(editCustomTiers.filter((_, i) => i !== idx))}
                        className="text-xs text-[#d61c5d] font-bold px-2 py-1 hover:bg-rose-50 rounded"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Base Selling Price */}
            <div>
              <label className="block text-xs font-bold text-[#6f5569] mb-1">
                Default Base Selling Price (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-2.5 text-[#6f5569] font-bold text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={editSellingPrice}
                  onChange={(e) => setEditSellingPrice(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-full text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] font-semibold font-mono"
                />
              </div>
            </div>

            {/* GST Tax Slabs Presets */}
            <div>
              <label className="block text-xs font-bold text-[#6f5569] mb-1.5">
                Quick GST Tax Slabs (Owner Configured)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: '0% Exempt', rate: 0 },
                  { label: '5% Food/IceCream', rate: 5 },
                  { label: '12% Standard', rate: 12 },
                  { label: '18% Premium', rate: 18 },
                ].map((preset) => (
                  <button
                    key={preset.rate}
                    type="button"
                    onClick={() => handleApplyTaxPreset(preset.rate)}
                    className={`py-1.5 px-2 text-xs font-bold rounded-xl border transition text-center ${
                      parseFloat(editTaxRate) === preset.rate
                        ? 'bg-[#d61c5d] text-white border-[#d61c5d] shadow-sm'
                        : 'bg-white text-[#2b1233] border-[#f4d3dd] hover:bg-[#fff1f4]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Total GST & Sub-Taxes Rates */}
            <div className="bg-[#fff1f4]/60 border border-[#f4d3dd] rounded-2xl p-4 space-y-3">
              <span className="text-xs font-black uppercase text-[#6f5569] tracking-wider block">
                GST Tax & Sub-Tax Details
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#6f5569] mb-1">Total GST %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={editTaxRate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditTaxRate(v);
                      const num = parseFloat(v);
                      if (!isNaN(num)) {
                        setEditCgstRate((num / 2).toString());
                        setEditSgstRate((num / 2).toString());
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-white border border-[#f4d3dd] rounded-lg text-xs font-mono font-bold text-[#2b1233]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-blue-700 mb-1">SGST % (State)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={editSgstRate}
                    onChange={(e) => setEditSgstRate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-mono font-bold text-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-purple-700 mb-1">CGST % (Central)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={editCgstRate}
                    onChange={(e) => setEditCgstRate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-xs font-mono font-bold text-purple-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-700 mb-1">IGST % (Interstate)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={editIgstRate}
                    onChange={(e) => setEditIgstRate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono font-bold text-amber-900"
                  />
                </div>
              </div>

              {/* Dynamic Calculation Live Breakdown */}
              {(() => {
                const sp = parseFloat(editSellingPrice) || 0;
                const tr = parseFloat(editTaxRate) || 0;
                const sgst = parseFloat(editSgstRate) || 0;
                const cgst = parseFloat(editCgstRate) || 0;
                const igst = parseFloat(editIgstRate) || 0;
                const sgstVal = (sp * sgst) / 100;
                const cgstVal = (sp * cgst) / 100;
                const igstVal = (sp * igst) / 100;
                const totalTaxVal = (sp * tr) / 100;
                const finalAmount = sp + totalTaxVal;

                return (
                  <div className="pt-2 border-t border-[#f4d3dd] text-xs space-y-1">
                    <div className="flex justify-between text-[#6f5569]">
                      <span>Base Selling Price:</span>
                      <span className="font-mono font-bold text-[#2b1233]">₹{sp.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-blue-700">
                      <span>&bull; SGST ({sgst}%):</span>
                      <span className="font-mono font-bold">+₹{sgstVal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-purple-700">
                      <span>&bull; CGST ({cgst}%):</span>
                      <span className="font-mono font-bold">+₹{cgstVal.toFixed(2)}</span>
                    </div>
                    {igst > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span>&bull; IGST ({igst}%):</span>
                        <span className="font-mono font-bold">+₹{igstVal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[#2b1233] font-bold pt-1 border-t border-[#f4d3dd]/60">
                      <span>Total Tax Amount:</span>
                      <span className="font-mono">+₹{totalTaxVal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-[#d61c5d] pt-1">
                      <span>Final Price (incl. GST):</span>
                      <span className="font-mono text-base">₹{finalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setPricingProduct(null)}
                disabled={pricingSubmitting}
                className="px-5 py-2.5 bg-[#fff1f4] hover:bg-white border border-[#f4d3dd] text-[#2b1233] text-xs font-extrabold rounded-full transition shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePricing}
                disabled={pricingSubmitting}
                className="px-5 py-2.5 bg-[#d61c5d] hover:bg-[#c21853] disabled:opacity-50 text-white text-xs font-extrabold rounded-full transition shadow-[0_3px_0_#a3134a]"
              >
                {pricingSubmitting ? 'Saving...' : 'Save Price & Taxes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
