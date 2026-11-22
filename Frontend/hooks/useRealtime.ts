import { createContext, useContext, useEffect, useRef } from 'react';
import type { NotificationItem } from '@/lib/types';

/**
 * Batch 13 — realtime (SSE) shared types + hooks.
 *
 * The backend slice owns GET /api/realtime/stream. Every event it sends is
 * shaped exactly like a NotificationItem ({ id, type, title, message,
 * link, orderId, createdAt }) and the SSE event name IS the notification
 * type, so one parsed object serves the bell, the toasts and every page.
 *
 * CORRECTED 2026-11-22 (Batch 24, TEAMLY REALTIME audit RT-2..RT-5 —
 * the Batch 13 note below is now WRONG and kept only as history):
 * Batch 23 added `order_status` plus six product / two user event types
 * to the Notification enum, and the backend emits them. The order
 * lifecycle still ALSO arrives as four separate events (confirmed /
 * shipped / delivered / cancelled) — `order_status` is the generic
 * one, fired alongside them on every status change — payments still
 * have `payment_refunded`, and accounts still have
 * `account_rejected` / `account_reactivated` alongside verified /
 * suspended. `delivery_proof` is still NOT a real notification type
 * (verified again 2026-11-22: it does not exist in the enum and no
 * controller uses it).
 *
 * Product events (Batch 23) carry NO product fields in the payload —
 * only the standard { id, type, title, message, link, orderId,
 * createdAt } shape. The product id is parsed from `link`
 * (`/product/<id>`) with idFromEventLink() below; pages then GET that
 * one product instead of refetching the list.
 */
export type RealtimeEventType =
  | 'order_placed'
  | 'order_confirmed'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'order_status'
  | 'product_created'
  | 'product_updated'
  | 'product_approved'
  | 'product_rejected'
  | 'stock_updated'
  | 'price_updated'
  | 'user_registered'
  | 'kyc_submitted'
  | 'payment_submitted'
  | 'payment_held'
  | 'payment_released'
  | 'payment_refunded'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'chat_message'
  | 'rating_received'
  | 'account_verified'
  | 'account_suspended'
  | 'account_rejected'
  | 'account_reactivated';

/** One SSE frame, parsed. The backend never sends `read` — live events are always unread. */
export type RealtimeEvent = Omit<NotificationItem, 'type'> & {
  type: RealtimeEventType;
};

/** Every event type, for the bell (it upserts all of them). */
export const ALL_REALTIME_EVENT_TYPES: RealtimeEventType[] = [
  'order_placed',
  'order_confirmed',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
  'order_status',
  'product_created',
  'product_updated',
  'product_approved',
  'product_rejected',
  'stock_updated',
  'price_updated',
  'user_registered',
  'kyc_submitted',
  'payment_submitted',
  'payment_held',
  'payment_released',
  'payment_refunded',
  'dispute_opened',
  'dispute_resolved',
  'chat_message',
  'rating_received',
  'account_verified',
  'account_suspended',
  'account_rejected',
  'account_reactivated',
];

/**
 * Batch 24 — parse the entity id out of an event `link`.
 * Product events carry `/product/<productId>`, user events
 * `/admin/users/<userId>`, KYC events `/admin/kyc/<userId>`, order
 * events `/admin/orders/<orderId>` (admins) or the portal order link
 * (parties). The payload itself carries no productId / stock / price,
 * so this is the only way to know WHICH row changed. Returns null
 * when the link does not contain the segment (never throws).
 */
export function idFromEventLink(link: string | undefined | null, segment: string): string | null {
  if (!link) return null;
  const match = link.match(new RegExp(`/${segment}/([^/?#]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * The order events: order_placed, the four lifecycle events, AND the
 * generic `order_status` (Batch 23, added to the enum first — see the
 * header note; RT-5). `order_status` fires on every status change,
 * alongside the specific lifecycle event, so handlers that update a
 * row in place subscribe to this whole group and treat order_placed
 * (prepend) separately from the rest (update in place).
 */
export const ORDER_EVENT_TYPES: RealtimeEventType[] = [
  'order_placed',
  'order_confirmed',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
  'order_status',
];

/** All product events (Batch 23). */
export const PRODUCT_EVENT_TYPES: RealtimeEventType[] = [
  'product_created',
  'product_updated',
  'product_approved',
  'product_rejected',
  'stock_updated',
  'price_updated',
];

/** Product events that change one listing's price/stock row in place. */
export const PRODUCT_UPDATE_EVENT_TYPES: RealtimeEventType[] = [
  'product_updated',
  'stock_updated',
  'price_updated',
];

/** All payment events. */
export const PAYMENT_EVENT_TYPES: RealtimeEventType[] = [
  'payment_submitted',
  'payment_held',
  'payment_released',
  'payment_refunded',
];

/** All account events. */
export const ACCOUNT_EVENT_TYPES: RealtimeEventType[] = [
  'account_verified',
  'account_suspended',
  'account_rejected',
  'account_reactivated',
];

export type RealtimeStatus = 'live' | 'connecting' | 'reconnecting' | 'offline' | 'too_many_tabs';

export type RealtimeHandler = (event: RealtimeEvent) => void;

export interface RealtimeContextValue {
  status: RealtimeStatus;
  /**
   * Bumps every time the connection is (re-)established after a drop, and
   * when a hidden tab becomes visible again — i.e. whenever events may
   * have been missed. Pages watch it (via useLiveRefreshKey) and silently
   * refetch what they show.
   */
  syncKey: number;
  /**
   * Subscribe to event types. Returns an unsubscribe function. The handler
   * is always the latest render's closure (kept in a ref), so subscribing
   * once is enough even when the handler closes over changing state.
   */
  subscribe: (types: RealtimeEventType[], handler: RealtimeHandler) => () => void;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return ctx;
}

/**
 * Run `handler` for every incoming event whose type is in `types`.
 * The subscription is created once (re-created only if the type list
 * itself changes); the handler is read from a ref so it never goes stale.
 */
export function useRealtimeEvent(types: RealtimeEventType[], handler: RealtimeHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const { subscribe } = useRealtime();
  // Sorted join is the stable identity of the type list — an inline array
  // literal would re-subscribe on every render.
  const typesKey = [...types].sort().join(',');
  useEffect(() => {
    return subscribe(types, (event) => handlerRef.current(event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, typesKey]);
}

/**
 * One-liner for list pages: bump the page's `refreshKey` (which its fetch
 * effect already depends on) whenever a matching live event arrives OR a
 * sync is due (reconnect / tab visible again). `bump` is normally
 * `() => setRefreshKey((k) => k + 1)`.
 *
 * The page's fetch effect must skip its `setLoading(true)` on a refreshKey
 * bump — see the `prevRefreshKeyRef` pattern in the wired pages — so a
 * live update never flashes a spinner, resets scroll, or closes a modal.
 */
export function useLiveRefreshKey(eventTypes: RealtimeEventType[], bump: () => void): void {
  const { syncKey } = useRealtime();
  useRealtimeEvent(eventTypes, () => bump());
  // The mount fetch already loads fresh data, so a syncKey that is already
  // non-zero when this page mounts must NOT trigger a second fetch.
  const lastSyncKeyRef = useRef(syncKey);
  useEffect(() => {
    if (lastSyncKeyRef.current === syncKey) return;
    lastSyncKeyRef.current = syncKey;
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);
}
