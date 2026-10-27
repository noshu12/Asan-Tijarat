import type { Product } from './types';

/**
 * Lightweight localStorage cart (SSR-safe). Product snapshots are stored
 * with their quantity so the cart stays self-contained. The backend is
 * only involved at checkout (POST /api/orders), which validates MOQ/stock
 * server-side and creates one order per supplier.
 */

export interface CartEntry {
  product: Product;
  quantity: number;
}

const CART_KEY = 'asan_cart';

export function getCart(): CartEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CartEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as CartEntry;
      return (
        item.product &&
        typeof item.product.id === 'string' &&
        typeof item.quantity === 'number' &&
        item.quantity > 0
      );
    });
  } catch {
    return [];
  }
}

function persist(items: CartEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — cart just won't persist across reloads */
  }
}

export function addToCart(product: Product, quantity?: number): void {
  // Default to the product's MOQ (wholesale minimum), capped at stock.
  const qty = quantity && quantity > 0 ? Math.floor(quantity) : Math.max(product.moq, 1);
  const items = getCart();
  const existing = items.find((entry) => entry.product.id === product.id);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + qty, Math.max(product.stock, 1));
  } else {
    items.push({ product, quantity: Math.min(qty, Math.max(product.stock, 1)) });
  }
  persist(items);
}

export function setQuantity(productId: string, quantity: number): void {
  if (quantity < 1 || !Number.isFinite(quantity)) {
    removeFromCart(productId);
    return;
  }
  const items = getCart();
  const entry = items.find((item) => item.product.id === productId);
  if (entry) {
    // Never go below the MOQ, never above the available stock.
    const floor = Math.max(entry.product.moq, 1);
    const ceil = Math.max(entry.product.stock, floor);
    entry.quantity = Math.min(Math.max(Math.floor(quantity), floor), ceil);
    persist(items);
  }
}

export function removeFromCart(productId: string): void {
  persist(getCart().filter((entry) => entry.product.id !== productId));
}

export function clearCart(): void {
  persist([]);
}

export function cartCount(): number {
  return getCart().reduce((total, entry) => total + entry.quantity, 0);
}