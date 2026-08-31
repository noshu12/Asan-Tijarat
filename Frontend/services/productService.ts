/**
 * 📦 PRODUCT SERVICE — catalogue data-access layer.
 *
 * ⚡ BACKEND INTEGRATION CONTRACT
 * The ProductProvider and every page/component go through these methods for
 * ALL catalogue reads/writes. Replace ONLY internals with API calls:
 *
 *   getFallbackCatalogue()          →  GET  /api/products           (initial payload)
 *   readStoredCatalogue()           →  —    (offline cache hydrate)
 *   withCreatedProduct()            →  POST /api/products
 *   withUpdatedProduct()            →  PATCH /api/products/:id       { name, price, stock, moq, status }
 *   withRemovedProduct()            →  DELETE /api/products/:id
 *   persistCatalogue()              →  —    (remove once API owns persistence)
 */
import { Product, User } from '@/lib/types';
import { INITIAL_PRODUCTS } from '@/lib/mockData';

export const PRODUCTS_STORAGE_KEY = 'asan-products';

export type CreateProductInput = Pick<
  Product,
  'name' | 'category' | 'price' | 'unit' | 'moq' | 'stock' | 'description' | 'image'
>;

/** Fields editable from the supplier "Edit lot" dialog. */
export interface UpdateProductInput {
  name?: string;
  price?: number;
  stock?: number;
  moq?: number;
  status?: Product['status'];
}

const isProduct = (value: unknown): value is Product => {
  if (!value || typeof value !== 'object') return false;
  const product = value as Product;
  return typeof product.id === 'string' && typeof product.name === 'string' && Number.isFinite(product.price);
};

/** Sanitises any untrusted array (localStorage / API payload) down to Products. */
export function sanitizeProducts(value: unknown): Product[] {
  return Array.isArray(value) ? value.filter(isProduct) : [];
}

/** Server-provided starter catalogue shown before the first successful fetch. */
export function getFallbackCatalogue(): Product[] {
  return INITIAL_PRODUCTS;
}

/**
 * Offline cache hydrate — returns previously cached catalogue, or null when
 * nothing cached/corrupt (caller keeps fallback).
 */
export function readStoredCatalogue(): Product[] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(PRODUCTS_STORAGE_KEY);
  if (raw === null) return null;
  try {
    return sanitizeProducts(JSON.parse(raw));
  } catch {
    window.localStorage.removeItem(PRODUCTS_STORAGE_KEY);
    return null;
  }
}

/** Local mirror of server state (delete once a real API persists catalogue). */
export function persistCatalogue(products: Product[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
  } catch {
    // Storage unavailable — catalogue stays in memory for this session; never throw.
  }
}

/** Derives listing status purely from stock levels. */
export function deriveStockStatus(stock: number): Product['status'] {
  return stock > 0 ? 'Active' : 'Out of Stock';
}

/** Maps create-form payload + supplier identity onto a full Product entity. */
export function composeNewProduct(input: CreateProductInput, supplier: User): Product {
  return {
    ...input,
    id: `prod_${Date.now()}`,
    supplierId: supplier.id,
    supplierName: supplier.businessName || supplier.name,
    supplierCity: supplier.city || 'Pakistan',
    supplierVerified: Boolean(supplier.verified),
    rating: 0,
    reviewCount: 0,
    ordersCount: 0,
    status: deriveStockStatus(input.stock),
  };
}

/** MOCK OF: POST /api/products — prepends the freshly created listing. */
export function withCreatedProduct(catalogue: Product[], input: CreateProductInput, supplier: User): Product[] {
  return [composeNewProduct(input, supplier), ...catalogue];
}

/**
 * MOCK OF: PATCH /api/products/:id — immutably applies supplier edits
 * (name / price / stock / MOQ / status) to a single lot.
 */
export function withUpdatedProduct(
  catalogue: Product[],
  productId: string,
  patch: UpdateProductInput
): Product[] {
  return catalogue.map((product) =>
    product.id === productId ? { ...product, ...patch } : product
  );
}

/** MOCK OF: DELETE /api/products/:id. */
export function withRemovedProduct(catalogue: Product[], productId: string): Product[] {
  return catalogue.filter((product) => product.id !== productId);
}
