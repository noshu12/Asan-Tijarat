/**
 * 🧾 ORDER SERVICE — order pipeline data-access layer.
 *
 * ⚡ BACKEND INTEGRATION CONTRACT
 * OrderProvider, dashboards and order tables go through these methods for
 * ALL order reads/writes. Replace ONLY internals with API calls:
 *
 *   getFallbackOrders()    →  GET   /api/orders                 (seed payload)
 *   readStoredOrders()     →  —     (offline cache hydrate)
 *   withPlacedOrders()     →  POST  /api/orders                 { items, paymentMethod, shippingAddress }
 *   withOrderStatus()      →  PATCH /api/orders/:id/status      { status }
 *   persistOrders()        →  —     (remove once API owns persistence)
 */
import { CartItem, Order, OrderItem, OrderStatus, User } from '@/lib/types';
import { INITIAL_ORDERS } from '@/lib/mockData';

export const ORDERS_STORAGE_KEY = 'asan-orders';
/** Platform escrow commission taken on every trade. */
export const ESCROW_FEE_RATE = 0.015;
const ORDER_SEQ_PAD = 3;

const isOrder = (value: unknown): value is Order => {
  if (!value || typeof value !== 'object') return false;
  const order = value as Order;
  return typeof order.id === 'string' && typeof order.orderNumber === 'string' && Array.isArray(order.items);
};

/** Sanitises any untrusted array (localStorage / API payload) down to Orders. */
export function sanitizeOrders(value: unknown): Order[] {
  return Array.isArray(value) ? value.filter(isOrder) : [];
}

/** Seed orders bundled with the app until the API supplies history. */
export function getFallbackOrders(): Order[] {
  return INITIAL_ORDERS;
}

/**
 * Offline cache hydrate — returns cached orders, or null when absent/corrupt
 * (caller keeps the seed payload).
 */
export function readStoredOrders(): Order[] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ORDERS_STORAGE_KEY);
  if (raw === null) return null;
  try {
    return sanitizeOrders(JSON.parse(raw));
  } catch {
    window.localStorage.removeItem(ORDERS_STORAGE_KEY);
    return null;
  }
}

/** Local mirror of server state (delete once a real API persists orders). */
export function persistOrders(orders: Order[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // Storage unavailable — orders stay in memory for this session; never throw.
  }
}

/** Splits mixed cart lines into one purchase group per supplier. */
export function groupCartItemsBySupplier(items: CartItem[]): Record<string, CartItem[]> {
  return items.reduce<Record<string, CartItem[]>>((groups, item) => {
    const supplierId = item.product.supplierId;
    groups[supplierId] = [...(groups[supplierId] ?? []), item];
    return groups;
  }, {});
}

/** Formats an incremental order reference, e.g. AT-2026-007. */
export function generateOrderNumber(sequence: number): string {
  return `AT-${new Date().getFullYear()}-${String(sequence).padStart(ORDER_SEQ_PAD, '0')}`;
}

/** Shapes cart lines into immutable receipt line-items. */
function composeOrderItems(supplierItems: CartItem[]): OrderItem[] {
  return supplierItems.map((item) => ({
    productId: item.product.id,
    productName: item.product.name,
    productImage: item.product.image,
    unitPrice: item.product.price,
    quantity: item.quantity,
    unit: item.product.unit,
    supplierName: item.product.supplierName,
  }));
}

/**
 * Builds one escrow-backed order out of a supplier purchase group.
 * Kept pure & deterministic so invoice/totals math stays testable.
 */
function composeOrder(
  buyer: User,
  supplierId: string,
  supplierItems: CartItem[],
  options: {
    sequence: number;
    paymentMethod: Order['paymentMethod'];
    shippingAddress: string;
    createdAt: string;
  }
): Order {
  const subtotal = supplierItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const platformFee = Math.round(subtotal * ESCROW_FEE_RATE);

  return {
    id: `ord_${Date.now()}_${options.sequence - 1}`,
    orderNumber: generateOrderNumber(options.sequence),
    buyerId: buyer.id,
    buyerName: buyer.businessName || buyer.name,
    buyerRole: buyer.role,
    supplierId,
    supplierName: supplierItems[0].product.supplierName,
    items: composeOrderItems(supplierItems),
    subtotal,
    platformFee,
    totalAmount: subtotal + platformFee,
    status: 'Pending',
    createdAt: options.createdAt,
    shippingAddress: options.shippingAddress,
    paymentMethod: options.paymentMethod,
    paymentStatus: 'Paid',
  };
}

/**
 * MOCK OF: POST /api/orders — fans a cart out into one order per supplier,
 * newest-first. `existing` provides numbering continuity.
 */
export function withPlacedOrders(
  existing: Order[],
  input: {
    buyer: User;
    items: CartItem[];
    paymentMethod: Order['paymentMethod'];
    shippingAddress: string;
  }
): Order[] {
  const grouped = Object.entries(groupCartItemsBySupplier(input.items));
  const createdAt = new Date().toISOString();

  const newOrders = grouped.map(([supplierId, supplierItems], index) =>
    composeOrder(input.buyer, supplierId, supplierItems, {
      sequence: existing.length + index + 1,
      paymentMethod: input.paymentMethod,
      shippingAddress: input.shippingAddress,
      createdAt,
    })
  );

  return [...newOrders, ...existing];
}

/**
 * MOCK OF: PATCH /api/orders/:id/status — advances/retracts an order along
 * the pipeline (Pending → Confirmed → Shipped → Delivered / Cancelled).
 */
export function withOrderStatus(orders: Order[], orderId: string, status: OrderStatus): Order[] {
  return orders.map((order) => (order.id === orderId ? { ...order, status } : order));
}
