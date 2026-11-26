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

// FIX (Batch 03) — Navbar ka cart badge reactive nahi tha: wo localStorage
// ko render ke waqt parhta tha, is liye cart badalne pe badge update nahi
// hota tha. Ab har cart change pe ye custom event dispatch hota hai, aur
// Navbar isko sun ke apna count update karta hai. 'storage' event sirf
// doosre tab me chalta hai, is liye same-tab updates ke liye ye event lazmi hai.
export const CART_UPDATED_EVENT = 'asan-cart-updated';

function notifyCartUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

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
  // FIX (Batch 03) — Navbar badge ko batado ke cart badal gaya hai.
  notifyCartUpdated();
}

export function addToCart(product: Product, quantity?: number): void {
  // FIX (Batch 03) — stock=0 wala product cart me add hi nahi hona chahiye.
  // Pehle cap Math.max(stock, 1) tha, is liye stock 0 hone pe bhi quantity 1
  // add ho jati thi aur checkout pe fail hoti thi.
  if (product.stock <= 0) return;
  // Default to the product's MOQ (wholesale minimum), capped at stock.
  const qty = quantity && quantity > 0 ? Math.floor(quantity) : Math.max(product.moq, 1);
  const items = getCart();
  const existing = items.find((entry) => entry.product.id === product.id);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + qty, Math.max(product.stock, 0));
  } else {
    items.push({ product, quantity: Math.min(qty, Math.max(product.stock, 0)) });
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
    // FIX (Batch 03) — stock 0 ho gaya ho to item cart se nikal do; usko
    // quantity 1 pe rakhna galat tha (cap pehle Math.max(stock, 1) tha).
    if (entry.product.stock <= 0) {
      removeFromCart(productId);
      return;
    }
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