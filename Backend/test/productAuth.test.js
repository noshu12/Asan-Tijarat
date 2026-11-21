'use strict';

// Tests for the product ownership guard (Batch 13, B7):
//   • Backend/src/controllers/product.controller.js —
//     checkProductOwnership(product, user, action), used by
//     updateProduct (PATCH /api/products/:id) and deleteProduct
//     (DELETE /api/products/:id). A supplier must never edit or delete
//     another supplier's listing.
//
// Node's built-in runner only — no new dependencies, no MongoDB, no
// network. Run: `npm test` from the Backend folder.
//
// The guard is tested at the level the harness allows: directly, as a
// pure function. The handlers themselves call this exact function
// before any write (verified by reading updateProduct/deleteProduct),
// and the routes already require the 'supplier' role, so a shopkeeper
// or admin never reaches the guard at all. A live end-to-end check
// (supplier B PATCHes supplier A's product -> 403 NOT_YOUR_PRODUCT)
// is listed as a manual step in the Batch 13 report.

const test = require('node:test');
const assert = require('node:assert/strict');

const { checkProductOwnership } = require('../src/controllers/product.controller');

const SUPPLIER_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SUPPLIER_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function productOf(supplierId) {
  return { _id: 'cccccccccccccccccccccccc', supplierId, name: 'Basmati Rice' };
}

function userWith(id) {
  return { _id: id, role: 'supplier' };
}

test('owner may edit their own product (guard returns null)', () => {
  assert.equal(checkProductOwnership(productOf(SUPPLIER_A), userWith(SUPPLIER_A)), null);
});

test('another supplier may NOT edit the product -> 403 NOT_YOUR_PRODUCT', () => {
  const err = checkProductOwnership(productOf(SUPPLIER_A), userWith(SUPPLIER_B));
  assert.equal(err.code, 'NOT_YOUR_PRODUCT');
  assert.match(err.message, /only edit your own product/);
});

test('another supplier may NOT delete the product -> same code, delete wording', () => {
  const err = checkProductOwnership(productOf(SUPPLIER_A), userWith(SUPPLIER_B), 'delete');
  assert.equal(err.code, 'NOT_YOUR_PRODUCT');
  assert.match(err.message, /only delete your own product/);
});

test('owner may delete their own product (guard returns null)', () => {
  assert.equal(checkProductOwnership(productOf(SUPPLIER_B), userWith(SUPPLIER_B), 'delete'), null);
});

test('ObjectId vs string ids compare equal (String() on both sides)', () => {
  // Mongoose ids arrive as ObjectIds; the guard stringifies both, so
  // the same id in different shapes still matches.
  const objectIdLike = { toString: () => SUPPLIER_A };
  assert.equal(checkProductOwnership(productOf(objectIdLike), userWith(SUPPLIER_A)), null);
  assert.equal(checkProductOwnership(productOf(SUPPLIER_A), userWith(objectIdLike)), null);
});
