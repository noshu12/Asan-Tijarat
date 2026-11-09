/**
 * Platform fee (Batch 05).
 *
 * The fee % is UNDECIDED — it lives in the env var PLATFORM_FEE_PERCENT and
 * defaults to 0, so no fee is ever charged until Noushad sets it. Nothing in
 * this batch hardcodes a fee %: every fee is computed through
 * calcPlatformFee() below. Add to Backend/.env when the % is decided, e.g.
 * PLATFORM_FEE_PERCENT=2  (2% of the order total).
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

module.exports = { platformFeePercent, calcPlatformFee };
