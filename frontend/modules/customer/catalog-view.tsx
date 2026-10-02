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
      <div className="flex items-center justify-center p-12 text-[#6f5569]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d61c5d] mr-3"></div>
        <span className="font-bold text-sm">Loading scoops...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white border border-[#f4d3dd] rounded-3xl text-[#d61c5d] shadow-sm">
        <p className="font-bold">Error loading catalog</p>
        <p className="text-sm opacity-80">{error}</p>
      </div>
    );
  }

  const activeCategory = categories.find((c) => c.category.id === selectedCategoryId) ?? categories[0];

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex space-x-2 border-b border-[#f4d3dd] pb-3 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat.category.id}
            onClick={() => setSelectedCategoryId(cat.category.id)}
            className={`px-5 py-2.5 rounded-full font-extrabold text-sm transition whitespace-nowrap ${
              selectedCategoryId === cat.category.id
                ? 'bg-[#d61c5d] text-white shadow-[0_4px_0_#a3134a]'
                : 'bg-white border border-[#f4d3dd] text-[#2b1233] hover:bg-[#fff1f4]'
            }`}
          >
            {cat.category.name} ({cat.products.length})
          </button>
        ))}
      </div>

      {/* Product Cards Grid */}
      {activeCategory && activeCategory.products.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeCategory.products.map((product) => {
            const qty = quantities[product.id] ?? 1;
            return (
              <div
                key={product.id}
                className="bg-white border border-[#f4d3dd] rounded-3xl p-6 flex flex-col justify-between shadow-[0_10px_30px_-15px_rgba(120,20,60,0.12)] hover:shadow-[0_16px_40px_-16px_rgba(120,20,60,0.22)] transition"
              >
                <div>
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <h3 className="font-display font-semibold text-[#2b1233] text-lg leading-tight">{product.name}</h3>
                    <span className="text-[#d61c5d] font-extrabold text-sm bg-[#fff1f4] px-3 py-1 rounded-full border border-[#f4d3dd] whitespace-nowrap">
                      ₹{product.price.toFixed(2)}
                    </span>
                  </div>
                  {product.description && (
                    <p className="text-sm text-[#6f5569] mb-5 line-clamp-2 leading-relaxed">{product.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#f4d3dd]">
                  <div className="flex items-center space-x-1.5 bg-[#fff1f4] rounded-full p-1 border border-[#f4d3dd]">
                    <button
                      onClick={() => handleQuantityChange(product.id, -1)}
                      className="w-7 h-7 flex items-center justify-center text-[#2b1233] hover:bg-white rounded-full text-sm font-black transition"
                    >
                      -
                    </button>
                    <span className="w-7 text-center text-sm font-extrabold text-[#2b1233]">{qty}</span>
                    <button
                      onClick={() => handleQuantityChange(product.id, 1)}
                      className="w-7 h-7 flex items-center justify-center text-[#2b1233] hover:bg-white rounded-full text-sm font-black transition"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => onAddToCart(product, qty)}
                    className="px-5 py-2.5 bg-[#d61c5d] hover:bg-[#c21853] text-white font-extrabold rounded-full text-sm transition shadow-[0_4px_0_#a3134a] hover:translate-y-[2px] hover:shadow-[0_2px_0_#a3134a]"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[#6f5569] p-8 text-center font-bold">No treats available in this category.</p>
      )}
    </div>
  );
};
