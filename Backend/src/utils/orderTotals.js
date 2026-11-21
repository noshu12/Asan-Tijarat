'use strict';

// Order totals (Batch 13) — the pure maths pulled out of
// controllers/order.controller.js so it can be unit-tested with no
// MongoDB. The controller still owns validation (MOQ, stock, unknown
// product); these functions only add numbers.
//
// Money rule: totalAmount is just the items subtotal — no delivery fee,
// no tax, no platform fee at checkout (the fee is taken from the
// supplier payout later, see utils/payment.js). Prices are whole PKR,
// so integer maths; a fractional price would still sum exactly here
// and is rounded only where it is displayed.

/** One line: catalogue price x quantity. */
function calcLineTotal(unitPrice, quantity) {
  return unitPrice * quantity;
}

/**
 * Subtotal of resolved order lines. Each line carries the `_lineTotal`
 * the controller computed from the LIVE catalogue price (never a price
 * the client sent — the request body only sends productId + quantity).
 */
function sumLineTotals(lines) {
  let subtotal = 0;
  for (const line of lines) subtotal += line._lineTotal;
  return subtotal;
}

module.exports = { calcLineTotal, sumLineTotals };
