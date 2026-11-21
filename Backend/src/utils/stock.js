'use strict';

// Stock reservation (Batch 13) — the two-phase checkout step pulled out
// of controllers/order.controller.js so its race behaviour can be
// unit-tested with no MongoDB (the test fakes Product.updateOne with
// the same atomic filter+update semantics MongoDB guarantees).
//
// RACE-CONDITION RULE: stock is reserved with ONE atomic update whose
// filter itself demands enough stock ({ stock: { $gte: quantity } }).
// MongoDB executes that filter+decrement as a single atomic step, so
// two simultaneous checkouts can never oversell the same product —
// the loser gets modifiedCount 0. The friendly pre-check in the
// controller (quantity > product.stock) is only a fast error message;
// THIS is the real gate.
//
// `ProductModel` is passed in (instead of required) so tests can hand
// in a fake; the controller passes the real Product model.

/**
 * Reserves stock for every line, in order. On the FIRST line that
 * cannot be reserved, every reservation made so far is given back and
 * the call reports the failed line — so a failed checkout never leaves
 * stock held. Returns { ok: true } or { ok: false, failedLine }.
 */
async function reserveStock(ProductModel, lines) {
  const reserved = [];
  for (const line of lines) {
    const r = await ProductModel.updateOne(
      { _id: line.productId, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity } }
    );
    if (r.modifiedCount === 0) {
      for (const done of reserved) {
        await ProductModel.updateOne({ _id: done.productId }, { $inc: { stock: done.quantity } });
      }
      return { ok: false, failedLine: line };
    }
    reserved.push(line);
  }
  return { ok: true };
}

module.exports = { reserveStock };
