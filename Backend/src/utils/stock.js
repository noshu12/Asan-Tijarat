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
 *
 * Batch 19 (audit L6) — this loop deliberately stays one updateOne per
 * line instead of a bulkWrite: the per-line modifiedCount IS the race
 * gate (the loser gets 0), and a bulkWrite result only reports an
 * aggregate modifiedCount, so it cannot say WHICH line failed without
 * extra reads. The restore path below has no such gate — every line is
 * unconditionally given back — so it takes the bulkWrite.
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

/**
 * Gives stock back for every line in ONE bulkWrite (Batch 19, audit L6).
 * Used by both cancel paths (buyer cancel in order.controller.js,
 * admin cancel in admin.controller.js) — the old per-line updateOne
 * loop cost one round trip per cart line. Every op is an unconditional
 * $inc, so no per-line result is needed: a cancelled order's stock
 * always goes back in full. No-op on an empty set.
 */
async function restoreStock(ProductModel, lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  return ProductModel.bulkWrite(
    lines.map((line) => ({
      updateOne: {
        filter: { _id: line.productId },
        update: { $inc: { stock: line.quantity } },
      },
    }))
  );
}

module.exports = { reserveStock, restoreStock };
