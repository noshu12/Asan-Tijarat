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
 * box) — and even that is redacted first (Batch 20, audit (d)-4):
 * email-like and phone-like patterns are replaced with '[redacted]'
 * before anything is sent to Google. Never a name, email, phone, CNIC,
 * address or user identifier.
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
  trackEvent('search', { search_term: redactSearchTerm(searchTerm) });
}

/**
 * Batch 20 (audit (d)-4) — `search_term` is GA4's standard recommended
 * parameter, but it used to carry the raw typed text: a user who typed
 * their own name, email or phone number into the marketplace search box
 * sent it straight to Google. Email-like and phone-like patterns are
 * replaced with '[redacted]' BEFORE sending; the rest of the query
 * (the actual product words) still goes through, so search analytics
 * keeps working. Redaction lives here — the one place every search
 * event passes through — not at the call site, so no future caller can
 * forget it.
 *
 * Email: user@domain.tld. Phone: any run of 8+ digits, optionally
 * separated by spaces / dashes / brackets / a leading + (covers
 * 03001234567, 0300-1234567, +92 300 1234567). Shorter digit runs
 * (quantities, years, product codes like "1121") are left alone.
 */
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;

export function redactSearchTerm(searchTerm: string): string {
  return searchTerm
    .replace(EMAIL_PATTERN, '[redacted]')
    .replace(PHONE_PATTERN, '[redacted]');
}

/** Marketplace filter changed — filter name + value only. */
export function trackFilterUsed(filterName: string, filterValue: string): void {
  trackEvent('filter_used', { filter_name: filterName, filter_value: filterValue });
}
