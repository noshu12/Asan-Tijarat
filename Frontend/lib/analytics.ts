/**
 * Batch 16 — B8 GA4 analytics helper.
 *
 * The Measurement ID comes ONLY from the env var
 * NEXT_PUBLIC_GA_MEASUREMENT_ID — it is NEVER hardcoded here or anywhere
 * in code. If the var is missing/empty, every function below is a silent
 * no-op: no script tag, no network calls, no console noise, and the site
 * works exactly as before.
 *
 * All events go through this helper — no component calls `gtag` directly.
 * NO PII in any payload: only product/order ids, categories, amounts and
 * the user's own search text (what they typed in the marketplace search
 * box). Never a name, email, phone, CNIC, address or user identifier.
 *
 * Event names (exactly six — grep `track[A-Z]` to audit call sites):
 *   page_view (manual — see GoogleAnalytics.tsx, config uses
 *     send_page_view: false so GA4's automatic page_view never
 *     double-counts), product_view, add_to_cart, checkout_start,
 *     order_placed, search, filter_used.
 */

export const GA_MEASUREMENT_ID: string | undefined =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined;

export function isAnalyticsEnabled(): boolean {
  return Boolean(GA_MEASUREMENT_ID);
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Calls gtag when the snippet is ready; before that (or if the library
 * is still loading) the call is queued in dataLayer, which gtag drains
 * on load — so an early event is never lost and never throws.
 */
function gtag(...args: unknown[]): void {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') {
    window.gtag(...args);
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

type GAEventParams = Record<string, string | number | boolean>;

function trackEvent(name: string, params: GAEventParams = {}): void {
  if (!isAnalyticsEnabled()) return;
  gtag('event', name, params);
}

/** Manual page_view — fired by GoogleAnalytics on mount + route change. */
export function trackPageview(path: string): void {
  if (!isAnalyticsEnabled()) return;
  gtag('event', 'page_view', { page_path: path });
}

/** Product detail page viewed — product id + category only. */
export function trackProductView(productId: string, category: string): void {
  trackEvent('product_view', { product_id: productId, category });
}

/** Item added to cart — product id + quantity added in this click only. */
export function trackAddToCart(productId: string, quantity: number): void {
  trackEvent('add_to_cart', { product_id: productId, quantity });
}

/** Checkout modal opened (order placement started). */
export function trackCheckoutStart(): void {
  trackEvent('checkout_start');
}

/** Order created — order id + total amount only (one event per order). */
export function trackOrderPlaced(orderId: string, totalAmount: number): void {
  trackEvent('order_placed', { order_id: orderId, total_amount: totalAmount });
}

/** Marketplace search submitted — the query text the user typed. */
export function trackSearch(searchTerm: string): void {
  trackEvent('search', { search_term: searchTerm });
}

/** Marketplace filter changed — filter name + value only. */
export function trackFilterUsed(filterName: string, filterValue: string): void {
  trackEvent('filter_used', { filter_name: filterName, filter_value: filterValue });
}
