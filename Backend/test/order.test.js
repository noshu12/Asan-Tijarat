'use strict';

// Tests for order checkout maths + stock reservation (Batch 13, B7):
//   • Backend/src/utils/orderTotals.js — calcLineTotal / sumLineTotals
//     (the maths pulled out of controllers/order.controller.js)
//   • Backend/src/utils/stock.js — reserveStock, the atomic
//     findOneAndUpdate({ stock: { $gte: quantity } }, { $inc }) gate
//     that stops two simultaneous checkouts overselling one product.
//
// Node's built-in runner only — no new dependencies, no MongoDB, no
// network. Run: `npm test` from the Backend folder.
//
// The stock tests use a fake Product model whose updateOne() applies
// the filter + $inc in ONE synchronous step after an async tick —
// exactly the atomicity MongoDB guarantees for a single-document
// update. That is the property under test: with the check and the
// decrement inseparable, two concurrent reserves of 4 from a stock
// of 5 can never both succeed. A LIVE-DB race check (two real
// checkouts against one mongod) is still listed as a manual step in
// the Batch 13 report — it needs a running MongoDB, which this
// harness deliberately never spins up.

const test = require('node:test');
const assert = require('node:assert/strict');

const { calcLineTotal, sumLineTotals } = require('../src/utils/orderTotals');
const { reserveStock } = require('../src/utils/stock');

// --- Order totals --------------------------------------------------------
test('line total is catalogue price x quantity', () => {
  assert.equal(calcLineTotal(250, 4), 1000);
  assert.equal(calcLineTotal(999, 1), 999);
  assert.equal(calcLineTotal(1500, 0), 0);
});

test('subtotal sums the resolved lines (one order per supplier group)', () => {
  const lines = [
    { _lineTotal: 1000 },
    { _lineTotal: 250 },
    { _lineTotal: 4999 },
  ];
  assert.equal(sumLineTotals(lines), 6249);
  assert.equal(sumLineTotals([]), 0);
});

test('subtotal is the plain item sum — no fee, tax or delivery added at checkout', () => {
  // totalAmount = subtotal (see order.controller.js); the platform fee
  // is taken from the supplier payout later, never added to the bill.
  const lines = [{ _lineTotal: calcLineTotal(10000, 2) }];
  assert.equal(sumLineTotals(lines), 20000);
});

// --- Fake Product model with MongoDB's atomic update semantics ----------
function makeFakeProduct(initialStock) {
  // id -> stock
  const store = new Map(Object.entries(initialStock));
  return {
    store,
    async updateOne(filter, update) {
      // One async tick, so two concurrent callers can interleave HERE —
      // then the filter check + decrement happen synchronously, which
      // is the atomicity a real MongoDB single-document update gives.
      await Promise.resolve();
      const id = String(filter._id);
      const stock = store.get(id);
      if (stock === undefined) return { modifiedCount: 0 };
      if (filter.stock && filter.stock.$gte !== undefined && stock < filter.stock.$gte) {
        return { modifiedCount: 0 };
      }
      store.set(id, stock + (update.$inc ? update.$inc.stock : 0));
      return { modifiedCount: 1 };
    },
  };
}

// --- Stock race ------------------------------------------------------------
test('two simultaneous orders cannot oversell: stock 5, two checkouts of 4 -> exactly one wins', async () => {
  const Product = makeFakeProduct({ prodA: 5 });
  const linesA = [{ productId: 'prodA', productName: 'Rice', quantity: 4 }];
  const linesB = [{ productId: 'prodA', productName: 'Rice', quantity: 4 }];

  const [a, b] = await Promise.all([
    reserveStock(Product, linesA),
    reserveStock(Product, linesB),
  ]);

  // Exactly one reservation succeeded; the loser is told which line ran low.
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1);
  const loser = a.ok ? b : a;
  assert.equal(loser.ok, false);
  assert.equal(loser.failedLine.productId, 'prodA');
  // Final stock is 1 — never negative, never double-decremented.
  assert.equal(Product.store.get('prodA'), 1);
});

test('a failed line rolls back earlier reservations in the same checkout', async () => {
  const Product = makeFakeProduct({ prodA: 10, prodB: 2 });
  const lines = [
    { productId: 'prodA', productName: 'Rice', quantity: 3 },
    { productId: 'prodB', productName: 'Flour', quantity: 5 }, // only 2 in stock
  ];

  const result = await reserveStock(Product, lines);
  assert.equal(result.ok, false);
  assert.equal(result.failedLine.productId, 'prodB');
  // prodA's reservation was given back in full.
  assert.equal(Product.store.get('prodA'), 10);
  assert.equal(Product.store.get('prodB'), 2);
});

test('insufficient stock on the first line reserves nothing', async () => {
  const Product = makeFakeProduct({ prodA: 1 });
  const result = await reserveStock(Product, [
    { productId: 'prodA', productName: 'Rice', quantity: 2 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(Product.store.get('prodA'), 1);
});

test('exact-stock checkout succeeds and leaves zero', async () => {
  const Product = makeFakeProduct({ prodA: 4 });
  const result = await reserveStock(Product, [
    { productId: 'prodA', productName: 'Rice', quantity: 4 },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.failedLine, undefined);
  assert.equal(Product.store.get('prodA'), 0);
});

test('unknown product id fails the reservation (modifiedCount 0)', async () => {
  const Product = makeFakeProduct({ prodA: 10 });
  const result = await reserveStock(Product, [
    { productId: 'nope', productName: 'Ghost', quantity: 1 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.failedLine.productId, 'nope');
});
