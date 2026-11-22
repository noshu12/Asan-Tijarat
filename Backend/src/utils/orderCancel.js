'use strict';

/**
 * Shared cancel settlement (Batch 18 — audit HIGH 1 + LOW L10).
 *
 * ONE rule for what cancelling does to the money, used by BOTH cancel
 * paths so they can never drift apart again:
 *   • the buyer's cancel — PATCH /api/orders/:id/status (pending only)
 *   • the admin cancel — POST /api/admin/orders/:id/cancel (stuck orders)
 *
 * Rules (the money never moves through an API — this is the record the
 * admin acts on):
 *   held_in_escrow / paid → full refund in full: refundAmount = total,
 *     platformFee 0, payoutAmount 0, amountHeld 0, status 'refunded'.
 *     (HIGH 1: a 'paid' at-delivery order cancelled the same way — the
 *     old code only handled held_in_escrow, so a paid order stayed paid
 *     with the payout still recorded and the shopkeeper got nothing.)
 *   payment_submitted → back to 'unpaid' — the reference was never
 *     confirmed, so no money was ever in — AND the stale reference is
 *     cleared (L10), so a fresh reference can be submitted later
 *     instead of the old unconfirmed one lingering on the order.
 *   anything else (unpaid / released / refunded / frozen_dispute) →
 *     no money patch: unpaid has nothing to return, released money is
 *     already with the supplier (a dispute decides that, not a cancel),
 *     refunded is already settled, and frozen_dispute is blocked by the
 *     DISPUTE_OPEN guard before this ever runs.
 *
 * Pure function of the order's fields — no DB write here. Callers apply
 * the returned patch with a conditional findOneAndUpdate (Batch 18, M3)
 * so two concurrent cancels can never both settle the same order.
 */
function cancelSettlementPatch(order) {
  const total = order.totalAmount || 0;
  if (order.paymentStatus === 'held_in_escrow' || order.paymentStatus === 'paid') {
    return {
      refundAmount: total,
      platformFee: 0,
      payoutAmount: 0,
      amountHeld: 0,
      paymentStatus: 'refunded',
    };
  }
  if (order.paymentStatus === 'payment_submitted') {
    return { paymentStatus: 'unpaid', paymentReference: '' };
  }
  return {};
}

/**
 * Order statuses the ADMIN cancel endpoint accepts (L10). A stuck order
 * can sit at any of these — pending, confirmed, processing or shipped.
 * 'delivered' is NOT here: the goods arrived, so a cancel would refund
 * goods the shopkeeper already has — that goes through a dispute.
 * 'cancelled' is terminal by definition.
 */
const ADMIN_CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing', 'shipped'];

module.exports = { cancelSettlementPatch, ADMIN_CANCELLABLE_STATUSES };
