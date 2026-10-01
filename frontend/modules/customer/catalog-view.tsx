'use client';

import React, { useState, useEffect } from 'react';
import { orderApiClient, CatalogCategory } from '../../services/order-api-client';
import { Product } from '../../../shared/types/entities.types';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CatalogViewProps {
  branchId: string;
  onAddToCart: (product: Product, quantity: number) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({ branchId, onAddToCart }) => {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    orderApiClient
      .getCatalog(branchId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success) {
          setCategories(res.data.catalog);
          if (res.data.catalog.length > 0) {
            setSelectedCategoryId(res.data.catalog[0].category.id);
          }
        } else {
          setError(res.error.message || 'Failed to load catalog');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [branchId]);

  const handleQuantityChange = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 1;
      const next = Math.max(1, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mr-3"></div>
        <span>Loading catalog...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-800 rounded-lg text-red-300">
        <p className="font-medium">Error loading catalog</p>
        <p className="text-sm opacity-80">{error}</p>
      </div>
    );
  }

  const activeCategory = categories.find((c) => c.category.id === selectedCategoryId) ?? categories[0];

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex space-x-2 border-b border-slate-700/60 pb-2 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat.category.id}
            onClick={() => setSelectedCategoryId(cat.category.id)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
              selectedCategoryId === cat.category.id
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {cat.category.name} ({cat.products.length})
          </button>
        ))}
      </div>

      {/* Product Cards Grid */}
      {activeCategory && activeCategory.products.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeCategory.products.map((product) => {
            const qty = quantities[product.id] ?? 1;
            return (
              <div
                key={product.id}
                className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-white text-base">{product.name}</h3>
                    <span className="text-amber-400 font-bold text-base">₹{product.price.toFixed(2)}</span>
                  </div>
                  {product.description && (
                    <p className="text-sm text-slate-400 mb-4 line-clamp-2">{product.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
                  <div className="flex items-center space-x-2 bg-slate-950 rounded-lg p-1 border border-slate-800">
                    <button
                      onClick={() => handleQuantityChange(product.id, -1)}
                      className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded text-sm font-bold"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm font-semibold text-white">{qty}</span>
                    <button
                      onClick={() => handleQuantityChange(product.id, 1)}
                      className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded text-sm font-bold"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => onAddToCart(product, qty)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-sm transition shadow-sm"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-slate-400 p-8 text-center">No products available in this category.</p>
      )}
    </div>
  );
};
