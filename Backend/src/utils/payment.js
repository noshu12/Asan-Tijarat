/**
 * Platform fee (Batch 05).
 *
 * The fee % is DECIDED — 2%, decided 2026-11-22 (supersedes the old
 * "UNDECIDED" note below). It lives in the env var PLATFORM_FEE_PERCENT
 * and is set to 2 in Backend/.env and on Render. Nothing in this batch
 * hardcodes a fee %: every fee is computed through calcPlatformFee()
 * below. Add to Backend/.env when the % changes, e.g.
 * PLATFORM_FEE_PERCENT=2  (2% of the order total).
 *
 * Fee TIMING (unchanged by Batch 18): the fee is DEDUCTED at release —
 * at-delivery orders at confirm (they go straight to 'paid'), advance
 * orders when the escrow releases. What Batch 18 changed is WHERE the %
 * comes from at release: the fee is now SNAPSHOTTED at confirm time
 * (see feeForRelease), so a % change between confirm and release no
 * longer changes what an already-confirmed order pays.
 *
 * If the env var is missing or garbage, calcPlatformFee() still returns
 * 0 (never crash, never over-charge) — but that is a misconfiguration,
 * not a silent default: checkFeeConfig() logs it LOUDLY at server
 * startup (Batch 18, audit M6), so a lost Render env var can no longer
 * silently give away 2% on every order.
 */

/** Reads the configured fee %, clamped to 0–100. Garbage or missing → 0. */
function platformFeePercent() {
  const raw = parseFloat(process.env.PLATFORM_FEE_PERCENT || '0');
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(raw, 100);
}

/** Whole-rupee fee on an order total (rounded — no paisa fractions). */
function calcPlatformFee(totalAmount) {
  const total = Math.max(0, Number(totalAmount) || 0);
  return Math.round((total * platformFeePercent()) / 100);
}

/**
 * Batch 18 (audit M6) — loud startup check for the fee config. Call
 * once from server.js at boot. Returns true when a usable % is
 * configured, false otherwise. Never throws and never stops the boot:
 * the server keeps running on 0% so a missing var is a loud warning,
 * not an outage — but the warning is impossible to miss in the logs.
 */
function checkFeeConfig() {
  const raw = process.env.PLATFORM_FEE_PERCENT;
  if (raw === undefined || String(raw).trim() === '') {
    console.error('[fee] ❌ PLATFORM_FEE_PERCENT is NOT SET — platform fee is 0% and every release pays out the full order total.');
    console.error('[fee]   → set PLATFORM_FEE_PERCENT=2 in Backend/.env (local) and on Render (production), then restart / redeploy.');
    return false;
  }
  const pct = parseFloat(raw);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    console.error(`[fee] ❌ PLATFORM_FEE_PERCENT="${raw}" is invalid — platform fee falls back to 0%.`);
    console.error('[fee]   → set it to a number between 0 and 100 (decided: 2) and restart / redeploy.');
    return false;
  }
  console.log(`[fee] Platform fee is ${pct}% (PLATFORM_FEE_PERCENT).`);
  return true;
}

/**
 * Batch 18 (audit L7) — the fee used when money RELEASES to the
 * supplier. This is the fee SNAPSHOTTED on the order at confirm time
 * (order.platformFee), not the live env % — so a % change between
 * confirm and release never changes what an already-confirmed order
 * pays. A snapshot of 0 means the fee was 0 when the money was
 * confirmed (or the order was confirmed before Batch 18 snapshotted
 * anything) — then the live % applies, so escrow orders confirmed
 * before this batch still release with the fee instead of silently
 * dropping to 0.
 */
function feeForRelease(order, totalAmount) {
  const snapshot = Number(order && order.platformFee) || 0;
  if (snapshot > 0) return snapshot;
  return calcPlatformFee(totalAmount);
}

module.exports = { platformFeePercent, calcPlatformFee, checkFeeConfig, feeForRelease };
