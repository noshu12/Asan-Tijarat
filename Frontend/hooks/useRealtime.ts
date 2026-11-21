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
 * CORRECTED 2026-11-21 (backend slice, verified by grep across all
 * controllers): `order_status` and `delivery_proof` are NOT real
 * notification types — they do not exist in the Notification enum and no
 * controller uses them, so nothing below relies on them ever arriving.
 * The order lifecycle arrives as four separate events (confirmed /
 * shipped / delivered / cancelled), payments have a `payment_refunded`
 * event too, and accounts have `account_rejected` / `account_reactivated`
 * alongside verified / suspended.
 *
 * There is deliberately NO product event type in this list (no
 * product_created / stock_changed) — the marketplace and product page
 * therefore revalidate on sync (reconnect / tab visible again) instead of
 * on a live event; if the backend adds a product event later, add its name
 * here and to the marketplace/product subscriptions.
 */
export type RealtimeEventType =
  | 'order_placed'
  | 'order_confirmed'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
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

/** The four order-lifecycle events (there is no generic `order_status`). */
export const ORDER_EVENT_TYPES: RealtimeEventType[] = [
  'order_placed',
  'order_confirmed',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
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

export type RealtimeStatus = 'live' | 'connecting' | 'reconnecting' | 'offline';

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
