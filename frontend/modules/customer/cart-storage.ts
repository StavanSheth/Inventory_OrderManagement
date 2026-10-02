import { CartItem } from './catalog-view';

export const CART_STORAGE_KEY = 'melt_cart_items';

/**
 * Loads current cart items from browser localStorage safely.
 */
export function loadCartFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (it) =>
          it &&
          it.product &&
          typeof it.product.id === 'string' &&
          typeof it.quantity === 'number' &&
          it.quantity > 0,
      );
    }
  } catch {
    // Ignore JSON parse or storage access exceptions
  }
  return [];
}

/**
 * Persists cart items into browser localStorage and dispatches a cross-component event.
 */
export function saveCartToStorage(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('melt:cart-updated', { detail: items }));
  } catch {
    // Ignore storage quota or access exceptions
  }
}

/**
 * Merges new items into the existing cart storage.
 */
export function addItemsToCartStorage(newItems: CartItem[]): CartItem[] {
  const current = loadCartFromStorage();
  const merged = [...current];

  for (const newItem of newItems) {
    const idx = merged.findIndex((i) => i.product.id === newItem.product.id);
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        quantity: merged[idx].quantity + newItem.quantity,
      };
    } else {
      merged.push(newItem);
    }
  }

  saveCartToStorage(merged);
  return merged;
}

/**
 * Clears cart items from localStorage.
 */
export function clearCartStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CART_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('melt:cart-updated', { detail: [] }));
  } catch {
    // Ignore
  }
}
