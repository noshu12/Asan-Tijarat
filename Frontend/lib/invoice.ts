/**
 * 🖨️ INVOICE UTILITIES — printable receipt generation for orders.
 *
 * Builds a standalone, brand-styled HTML receipt (Asan Tijarat theme) and
 * opens it in a popup window where the user can print straight away or choose
 * "Save as PDF" from the browser dialog. Purely presentational: every value
 * comes from the Order entity produced by services/orderService.
 */
import { Order, OrderItem } from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Brand palette (mirrors tailwind.config.ts "asan-*" tokens)          */
/* ------------------------------------------------------------------ */
const BRAND = {
  dark: '#0B3D2E',
  mid: '#1A6B4A',
  accent: '#27AE7A',
  warning: '#E09B2D',
  error: '#E74C3C',
  ink: '#1A202C',
  muted: '#718096',
  border: '#E2E8F0',
  surface: '#F7FAFC',
} as const;

/** Escapes untrusted text before it enters the invoice HTML. */
function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function money(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString('en-PK')}`;
}

function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(isoDate);
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function paymentPill(paymentStatus: Order['paymentStatus']): string {
  const palette: Record<Order['paymentStatus'], { bg: string; fg: string }> = {
    Paid: { bg: '#ECFDF5', fg: BRAND.mid },
    Pending: { bg: '#FEF6E7', fg: BRAND.warning },
    Refunded: { bg: '#FDEDEC', fg: BRAND.error },
  };
  const tone = palette[paymentStatus];
  return `<span class="pill" style="background:${tone.bg};color:${tone.fg};border-color:${tone.fg}22">${escapeHtml(paymentStatus)}</span>`;
}

/** Renders the itemised line-rows of an order's receipt table. */
function receiptRows(items: OrderItem[]): string {
  return items
    .map(
      (item, index) => `
      <tr>
        <td class="ta-c">${index + 1}</td>
        <td>
          <span class="item-name">${escapeHtml(item.productName)}</span>
          <span class="item-sub">Sold by ${escapeHtml(item.supplierName)}</span>
        </td>
        <td class="ta-r">${money(item.unitPrice)} / ${escapeHtml(item.unit)}</td>
        <td class="ta-c">${item.quantity}</td>
        <td class="ta-r strong">${money(item.unitPrice * item.quantity)}</td>
      </tr>`
    )
    .join('');
}

/** Builds one receipt's inner markup (shared by single & bulk views). */
function receiptMarkup(order: Order): string {
  return `
  <section class="receipt">
    <header class="head">
      <div class="brand">
        <div class="logo-mark">AT</div>
        <div>
          <h1>Asan Tijarat</h1>
          <p>Pakistan's AI-Powered B2B Wholesale Marketplace</p>
        </div>
      </div>
      <div class="meta ta-r">
        <p class="invoice-tag">INVOICE</p>
        <p class="order-no">${escapeHtml(order.orderNumber)}</p>
        <p class="order-date">${formatDate(order.createdAt)}</p>
      </div>
    </header>

    <div class="info-grid">
      <div class="info-card">
        <p class="label">Buyer</p>
        <p class="who">${escapeHtml(order.buyerName)}</p>
        <p class="sub">${escapeHtml(order.buyerRole.charAt(0).toUpperCase() + order.buyerRole.slice(1))} Account</p>
      </div>
      <div class="info-card">
        <p class="label">Supplier</p>
        <p class="who">${escapeHtml(order.supplierName)}</p>
        <p class="sub">Wholesale Vendor</p>
      </div>
      <div class="info-card">
        <p class="label">Payment</p>
        <p class="who">${escapeHtml(order.paymentMethod)}</p>
        <p class="sub">${paymentPill(order.paymentStatus)}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="ta-c">#</th>
          <th>Item Description</th>
          <th class="ta-r">Unit Rate</th>
          <th class="ta-c">Qty</th>
          <th class="ta-r">Line Total</th>
        </tr>
      </thead>
      <tbody>${receiptRows(order.items)}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
      <div class="row"><span>Platform Escrow Fee (1.5%)</span><span>${money(order.platformFee)}</span></div>
      <div class="row grand"><span>Total Amount</span><span>${money(order.totalAmount)}</span></div>
    </div>

    <div class="ship">
      <p class="label">Deliver To</p>
      <p>${escapeHtml(order.shippingAddress)}</p>
    </div>

    <footer class="foot">
      Funds are held safely in Asan Tijarat Escrow until delivery confirmation.
      This invoice was generated automatically — no signature required.<br />
      <strong>Order Status:</strong> ${escapeHtml(order.status)} &nbsp;·&nbsp; <strong>Payment:</strong> ${escapeHtml(order.paymentStatus)}
    </footer>
  </section>`;
}

/** Wraps receipts in a self-contained print-ready HTML document. */
function buildDocument(orders: Order[]): string {
  const body = orders.map(receiptMarkup).join('<div class="page-break"></div>');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${orders.length === 1 ? `Invoice ${escapeHtml(orders[0].orderNumber)}` : `${orders.length} Invoices`} — Asan Tijarat</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: ${BRAND.surface}; color: ${BRAND.ink}; padding: 24px; }
    .receipt { max-width: 800px; margin: 0 auto 28px; background: #fff; border: 1px solid ${BRAND.border}; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(11,61,46,.08); }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 22px 26px; background: ${BRAND.dark}; color: #fff; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .logo-mark { width: 44px; height: 44px; border-radius: 12px; background: ${BRAND.accent}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 17px; letter-spacing: .5px; color: #fff; }
    .brand h1 { font-size: 19px; letter-spacing: -.2px; }
    .brand p { font-size: 10.5px; opacity: .75; margin-top: 2px; }
    .invoice-tag { font-size: 10px; letter-spacing: 2px; opacity: .7; }
    .order-no { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; font-size: 15px; margin-top: 2px; color: #7EE2B8; }
    .order-date { font-size: 11px; opacity: .75; margin-top: 2px; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 18px 26px 0; }
    .info-card { border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 12px 14px; background: #fff; }
    .label { font-size: 9.5px; letter-spacing: 1.4px; text-transform: uppercase; color: ${BRAND.muted}; font-weight: 700; }
    .who { font-weight: 700; font-size: 13.5px; margin-top: 4px; }
    .sub { font-size: 11px; color: ${BRAND.muted}; margin-top: 3px; }
    .pill { display: inline-block; border: 1px solid; padding: 1px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 700; }
    table { width: calc(100% - 52px); margin: 20px auto 0; border-collapse: collapse; font-size: 12px; }
    th { background: ${BRAND.surface}; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: .8px; font-size: 9.5px; padding: 9px 10px; text-align: left; border-bottom: 1px solid ${BRAND.border}; }
    td { padding: 10px; border-bottom: 1px solid ${BRAND.border}; vertical-align: top; }
    .item-name { display: block; font-weight: 700; font-size: 12.5px; }
    .item-sub { display: block; color: ${BRAND.muted}; font-size: 10.5px; margin-top: 2px; }
    .ta-r { text-align: right; } .ta-c { text-align: center; } .strong { font-weight: 700; }
    .totals { width: calc(100% - 52px); margin: 14px auto 0; font-size: 12.5px; }
    .totals .row { display: flex; justify-content: space-between; padding: 5px 10px; color: ${BRAND.muted}; }
    .totals .grand { border-top: 2px solid ${BRAND.dark}; margin-top: 6px; padding-top: 10px; font-size: 15px; font-weight: 800; color: ${BRAND.mid}; }
    .ship { margin: 16px 26px 0; padding: 11px 14px; border-radius: 10px; background: #ECFDF5; border: 1px solid #BBEAD4; font-size: 11.5px; }
    .ship p { margin-top: 3px; }
    .foot { margin: 18px 26px 20px; padding-top: 12px; border-top: 1px dashed ${BRAND.border}; font-size: 10.5px; color: ${BRAND.muted}; text-align: center; line-height: 1.6; }
    .page-break { height: 0; border-top: 2px dashed #CBD5E1; max-width: 800px; margin: 26px auto; }
    @media print { body { padding: 0; background: #fff; } .receipt { box-shadow: none; break-inside: avoid; } .page-break { border-color: #fff; height: 24px; } @page { margin: 12mm; } }
  </style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * Opens one or more receipts in a popup window and fires the browser print
 * dialog (where users can pick a printer or "Save as PDF").
 * @returns true when the window opened, false when a popup blocker stopped it.
 */
export function printInvoices(orders: Order[]): boolean {
  if (orders.length === 0 || typeof window === 'undefined') return false;

  const printWindow = window.open('', '_blank', 'width=920,height=720');
  if (!printWindow) return false;

  printWindow.document.open();
  printWindow.document.write(buildDocument(orders));
  printWindow.document.close();

  let hasQueuedPrint = false;
  const queuePrint = (): void => {
    if (hasQueuedPrint) return;
    hasQueuedPrint = true;
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 350);
  };

  printWindow.addEventListener('load', queuePrint);
  // Fallback for browsers whose popup finishes loading before the listener attaches.
  window.setTimeout(queuePrint, 800);
  return true;
}

/** Convenience wrapper for a single-order receipt. */
export function printInvoice(order: Order): boolean {
  return printInvoices([order]);
}
