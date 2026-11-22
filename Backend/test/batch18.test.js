'use strict';

// Tests for Batch 18 (Round-5 audit, batch B — Payment / Escrow /
// Dispute State Machine).
//
// Node's built-in runner only — no new dependencies, no MongoDB, no
// network. Run: `npm test` from the Backend folder.
//
// Behaviour under test (read from the code, not assumed):
//   • HIGH 1a — cancelling a PAID at-delivery order refunds in full
//     (refundAmount = total, fee 0, payout 0, status 'refunded'); a
//     merely-submitted reference goes back to 'unpaid' AND the stale
//     reference is cleared (L10).
//   • HIGH 1b — an at-delivery reference is refused until the order is
//     'delivered'; an advance reference while pending still works.
//   • HIGH 2 — a dispute refund on a never-confirmed (payment_submitted)
//     payment records refundAmount 0 and hands the order back to
//     'payment_submitted' (mirror of the release branch, which already
//     did this).
//   • M3 — atomicity: two concurrent decide / confirm / cancel calls —
//     exactly one wins, the loser gets 409 CONCURRENT_UPDATE, the money
//     moves once (stock restored once, one audit log, one resolution).
//   • M4 — escrow never releases without deliveryProof.url; the photo
//     cannot be overwritten while a dispute is open or after the money
//     is settled (released/paid).
//   • M5 — ANY status move returns DISPUTE_OPEN while a dispute is open.
//   • M6 — checkFeeConfig() is loud at startup when the fee % is
//     unset/invalid, quiet-confirming when it is set.
//   • L7 — the release fee is the fee snapshotted at confirm time, not
//     the live env % (feeForRelease).
//   • L8 — partial refunds round FIRST, then validate (99.6 on a
//     Rs 100 order is rejected, not recorded as a "partial" full refund).
//   • L9 — a reason-11 resolution records the amount the cancel already
//     refunded, instead of 0.
//   • L10 — the admin cancel endpoint reuses the buyer-cancel settlement
//     (escrow-held stuck order refunds in full); delivered/released
//     orders are refused.
//
// The Order/Dispute models are stubbed per test with in-memory stores
// whose findOneAndUpdate() awaits one tick and then applies the filter
// + $set synchronously — exactly the atomicity a real MongoDB
// single-document update guarantees. That is the property under test:
// with the check and the write inseparable, two concurrent transitions
// can never both succeed.

const test = require('node:test');
const assert = require('node:assert/strict');

const { calcPlatformFee, platformFeePercent, checkFeeConfig, feeForRelease } = require('../src/utils/payment');
const { cancelSettlementPatch, ADMIN_CANCELLABLE_STATUSES } = require('../src/utils/orderCancel');
const orderController = require('../src/controllers/order.controller');
const paymentController = require('../src/controllers/payment.controller');
const disputeController = require('../src/controllers/dispute.controller');
const adminController = require('../src/controllers/admin.controller');
const Order = require('../src/models/Order');
const Dispute = require('../src/models/Dispute');
const Product = require('../src/models/Product');
const AuditLog = require('../src/models/AuditLog');
const Notification = require('../src/models/Notification');
const User = require('../src/models/User');

// --- Users ---------------------------------------------------------------
const buyer = { _id: 'buyer1', name: 'Shopkeeper', email: 'shop@example.com', role: 'shopkeeper' };
const supplier = { _id: 'supplier1', name: 'Supplier', email: 'sup@example.com', role: 'supplier' };
const admin = { _id: 'admin1', name: 'Admin', email: 'admin@example.com', role: 'admin' };

// --- Fake docs + stores --------------------------------------------------
function makeDoc(fields) {
  const doc = { ...fields };
  doc.savedCount = 0;
  doc.save = async function () { this.savedCount += 1; };
  doc.toObject = function () {
    const out = {};
    for (const [k, v] of Object.entries(this)) {
      if (typeof v !== 'function' && k !== 'savedCount') out[k] = v;
    }
    return out;
  };
  return doc;
}

/** Thenable + .lean(), like Batch 17's stubFindById: one stub serves
 *  both `await Model.findById(id)` and `await Model.findById(id).lean()`. */
function queryable(doc) {
  return {
    lean: async () => doc,
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
  };
}

function matchesFilter(doc, filter) {
  for (const [key, cond] of Object.entries(filter)) {
    const val = doc[key];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$ne' in cond && String(val) === String(cond.$ne)) return false;
      if ('$in' in cond && !cond.$in.map(String).includes(String(val))) return false;
      if ('$nin' in cond && cond.$nin.map(String).includes(String(val))) return false;
    } else if (String(val) !== String(cond)) {
      return false;
    }
  }
  return true;
}

/** Atomic single-document update over an in-memory Map (see header). */
function makeFindOneAndUpdate(store) {
  return async (filter, update) => {
    await Promise.resolve(); // one tick: concurrent callers interleave HERE
    const doc = [...store.values()].find((d) => matchesFilter(d, filter));
    if (!doc) return null;
    // Filter + $set happen synchronously from here — inseparable.
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
    }
    return doc;
  };
}

let orderStore;
let disputeStore;
let productUpdates;
let auditCreates;
let notifications;
let savedFeeEnv;
let originals;

function installStubs() {
  originals = {
    orderFindById: Order.findById,
    orderFindOneAndUpdate: Order.findOneAndUpdate,
    disputeFindById: Dispute.findById,
    disputeFindOneAndUpdate: Dispute.findOneAndUpdate,
    productUpdateOne: Product.updateOne,
    productBulkWrite: Product.bulkWrite,
    auditCreate: AuditLog.create,
    notifCreate: Notification.create,
    userFind: User.find,
  };
  Order.findById = async (id) => orderStore.get(String(id)) || null;
  Order.findOneAndUpdate = makeFindOneAndUpdate(orderStore);
  Dispute.findById = (id) => queryable(disputeStore.get(String(id)) || null);
  Dispute.findOneAndUpdate = makeFindOneAndUpdate(disputeStore);
  Product.updateOne = async (filter, update) => {
    productUpdates.push({ filter, update });
    return { modifiedCount: 1 };
  };
  // Batch 19 (audit L6) — both cancel paths restore stock with ONE
  // bulkWrite (utils/stock.js restoreStock) instead of one updateOne
  // per line. The stub records one entry per op, so the existing
  // "stock restored once, not twice" assertions still hold verbatim.
  Product.bulkWrite = async (ops) => {
    for (const op of ops || []) {
      if (op.updateOne) productUpdates.push({ filter: op.updateOne.filter, update: op.updateOne.update });
    }
    return { modifiedCount: (ops || []).length };
  };
  AuditLog.create = async (doc) => {
    auditCreates.push(doc);
    return { ...doc };
  };
  Notification.create = async (doc) => {
    const n = { _id: `notif-${notifications.length + 1}`, createdAt: new Date(), ...doc };
    notifications.push(n);
    return n;
  };
  User.find = () => ({ lean: async () => [] });
}

function restoreStubs() {
  Order.findById = originals.orderFindById;
  Order.findOneAndUpdate = originals.orderFindOneAndUpdate;
  Dispute.findById = originals.disputeFindById;
  Dispute.findOneAndUpdate = originals.disputeFindOneAndUpdate;
  Product.updateOne = originals.productUpdateOne;
  Product.bulkWrite = originals.productBulkWrite;
  AuditLog.create = originals.auditCreate;
  Notification.create = originals.notifCreate;
  User.find = originals.userFind;
}

test.beforeEach(() => {
  savedFeeEnv = process.env.PLATFORM_FEE_PERCENT;
  process.env.PLATFORM_FEE_PERCENT = '2';
  orderStore = new Map();
  disputeStore = new Map();
  productUpdates = [];
  auditCreates = [];
  notifications = [];
  installStubs();
});

test.afterEach(() => {
  restoreStubs();
  if (savedFeeEnv === undefined) delete process.env.PLATFORM_FEE_PERCENT;
  else process.env.PLATFORM_FEE_PERCENT = savedFeeEnv;
});

// --- Factories -----------------------------------------------------------
function makeOrder(overrides = {}) {
  const doc = makeDoc({
    _id: 'order1',
    orderNumber: 'AT-2026-001',
    buyerId: 'buyer1',
    buyerName: 'Shopkeeper',
    buyerRole: 'shopkeeper',
    supplierId: 'supplier1',
    supplierName: 'Supplier',
    items: [{ productId: 'prod1', productName: 'Rice', quantity: 2 }],
    subtotal: 10000,
    totalAmount: 10000,
    paymentMethod: 'online_advance',
    paymentChannel: 'bank',
    paymentStatus: 'unpaid',
    paymentReference: '',
    platformFee: 0,
    amountHeld: 0,
    payoutAmount: 0,
    refundAmount: 0,
    prevPaymentStatus: '',
    deliveryProof: undefined,
    disputeId: null,
    status: 'pending',
    ...overrides,
  });
  orderStore.set(String(doc._id), doc);
  return doc;
}

function makeDispute(overrides = {}) {
  const doc = makeDoc({
    _id: 'dispute1',
    orderId: 'order1',
    orderNumber: 'AT-2026-001',
    reason: 'wrong_goods',
    reasonLabel: 'Wrong goods',
    description: 'Wrong item delivered.',
    raisedBy: 'buyer1',
    raisedByRole: 'shopkeeper',
    status: 'open',
    resolution: undefined,
    ...overrides,
  });
  disputeStore.set(String(doc._id), doc);
  return doc;
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makeNext() {
  const calls = [];
  const next = (err) => calls.push(err);
  next.calls = calls;
  return next;
}

function captureConsole() {
  const lines = [];
  const origErr = console.error;
  const origLog = console.log;
  console.error = (...a) => lines.push(['error', a.join(' ')]);
  console.log = (...a) => lines.push(['log', a.join(' ')]);
  return { lines, restore() { console.error = origErr; console.log = origLog; } };
}

// --- HIGH 1a: cancel after paid refunds in full ---------------------------
test('HIGH 1a — buyer cancels a PAID at-delivery order: full refund, fee 0, payout 0, status refunded', async () => {
  const order = makeOrder({
    status: 'pending',
    paymentMethod: 'online_at_delivery',
    paymentStatus: 'paid',
    platformFee: 200,
    payoutAmount: 9800,
  });
  const res = makeRes();
  await orderController.updateOrderStatus(
    { params: { id: 'order1' }, body: { status: 'cancelled' }, user: buyer },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'refunded');
  assert.equal(res.body.order.refundAmount, 10000);
  assert.equal(res.body.order.platformFee, 0);
  assert.equal(res.body.order.payoutAmount, 0);
  assert.equal(res.body.order.amountHeld, 0);
  assert.equal(res.body.order.status, 'cancelled');
  assert.equal(productUpdates.length, 1); // stock given back once
  assert.equal(order.savedCount, 0); // no check-then-save anymore
});

test('HIGH 1a + L10 — cancelling a payment_submitted order goes back to unpaid AND clears the stale reference', async () => {
  makeOrder({ status: 'pending', paymentStatus: 'payment_submitted', paymentReference: 'TXN-OLD-1' });
  const res = makeRes();
  await orderController.updateOrderStatus(
    { params: { id: 'order1' }, body: { status: 'cancelled' }, user: buyer },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'unpaid');
  assert.equal(res.body.order.paymentReference, '');
  assert.equal(res.body.order.refundAmount, 0);
});

// --- HIGH 1b: at-delivery reference needs a delivered order ---------------
test('HIGH 1b — at-delivery reference while pending is refused; advance reference while pending works', async () => {
  makeOrder({ status: 'pending', paymentMethod: 'online_at_delivery', paymentStatus: 'unpaid' });
  const res1 = makeRes();
  await paymentController.submitPaymentReference(
    { params: { id: 'order1' }, body: { reference: 'TXN1', channel: 'jazzcash' }, user: buyer },
    res1,
    makeNext()
  );
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.body.error.code, 'INVALID_STATE');
  assert.equal(orderStore.get('order1').paymentStatus, 'unpaid');

  // Same order as an advance order: paying at order time is the flow.
  orderStore.get('order1').paymentMethod = 'online_advance';
  const res2 = makeRes();
  await paymentController.submitPaymentReference(
    { params: { id: 'order1' }, body: { reference: 'TXN1', channel: 'jazzcash' }, user: buyer },
    res2,
    makeNext()
  );
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.order.paymentStatus, 'payment_submitted');
  assert.equal(res2.body.order.paymentReference, 'TXN1');

  // And at-delivery once delivered: allowed.
  const order = orderStore.get('order1');
  order.paymentMethod = 'online_at_delivery';
  order.paymentStatus = 'unpaid';
  order.paymentReference = '';
  order.status = 'delivered';
  const res3 = makeRes();
  await paymentController.submitPaymentReference(
    { params: { id: 'order1' }, body: { reference: 'TXN2', channel: 'bank' }, user: buyer },
    res3,
    makeNext()
  );
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.body.order.paymentStatus, 'payment_submitted');
});

// --- HIGH 2: dispute refund on unconfirmed payment ------------------------
test('HIGH 2 — refund_full on a payment_submitted dispute records 0 and hands the order back to payment_submitted', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'payment_submitted' });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_full', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dispute.status, 'resolved');
  assert.equal(res.body.dispute.resolution.refundAmount, 0);
  assert.equal(res.body.order.paymentStatus, 'payment_submitted');
  assert.equal(res.body.order.refundAmount, 0);
  assert.equal(res.body.order.platformFee, 0);
  assert.equal(res.body.order.payoutAmount, 0);
  assert.equal(res.body.order.prevPaymentStatus, '');
});

test('HIGH 2 (mirror) — release on a payment_submitted dispute still hands it back to payment_submitted', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'payment_submitted' });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'release', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'payment_submitted');
  assert.equal(res.body.dispute.resolution.refundAmount, 0);
});

// --- M3: atomicity — concurrent double calls ------------------------------
test('M3 — two concurrent decideDispute calls: exactly one wins, the loser gets 409, money moves once', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'held_in_escrow', amountHeld: 10000 });
  makeDispute();
  const call = () => {
    const res = makeRes();
    const p = disputeController.decideDispute(
      { params: { id: 'dispute1' }, body: { decision: 'refund_full', note: '' }, user: admin },
      res,
      makeNext()
    );
    return p.then(() => res);
  };
  const [a, b] = await Promise.all([call(), call()]);
  const codes = [a.statusCode, b.statusCode].sort();
  assert.deepEqual(codes, [200, 409]);
  const winner = a.statusCode === 200 ? a : b;
  const loser = a.statusCode === 409 ? a : b;
  assert.equal(loser.body.error.code, 'CONCURRENT_UPDATE');
  assert.equal(winner.body.order.paymentStatus, 'refunded');
  assert.equal(winner.body.order.refundAmount, 10000);
  assert.equal(disputeStore.get('dispute1').status, 'resolved');
  assert.equal(auditCreates.length, 1); // one decision, one audit log
  // Batch 20 (audit (c)-1) — the refund_full decide now sends TWO
  // notifications per party: dispute_resolved AND the distinct
  // payment_refunded event. The old count (2) predates the refund
  // event; the money still moves exactly once.
  assert.equal(notifications.length, 4); // buyer + supplier, once each, x2 types
  assert.equal(notifications.filter((n) => n.type === 'payment_refunded').length, 2);
  assert.equal(notifications.filter((n) => n.type === 'dispute_resolved').length, 2);
});

test('M3 — two concurrent confirmPayment calls: exactly one confirms, the loser gets 409', async () => {
  makeOrder({ status: 'pending', paymentStatus: 'payment_submitted', paymentMethod: 'online_advance' });
  const call = () => {
    const res = makeRes();
    const p = paymentController.confirmPayment(
      { params: { id: 'order1' }, body: {}, user: admin },
      res,
      makeNext()
    );
    return p.then(() => res);
  };
  const [a, b] = await Promise.all([call(), call()]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  const winner = a.statusCode === 200 ? a : b;
  assert.equal(winner.body.order.paymentStatus, 'held_in_escrow');
  assert.equal(winner.body.order.amountHeld, 10000);
  assert.equal(winner.body.order.platformFee, 200); // L7 snapshot at confirm
  assert.equal(orderStore.get('order1').paymentStatus, 'held_in_escrow');
  assert.equal(auditCreates.length, 1);
});

test('M3 — two concurrent cancels: exactly one cancels and restores stock once', async () => {
  makeOrder({ status: 'pending', paymentStatus: 'held_in_escrow', amountHeld: 10000 });
  const call = () => {
    const res = makeRes();
    const p = orderController.updateOrderStatus(
      { params: { id: 'order1' }, body: { status: 'cancelled' }, user: buyer },
      res,
      makeNext()
    );
    return p.then(() => res);
  };
  const [a, b] = await Promise.all([call(), call()]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  assert.equal(orderStore.get('order1').paymentStatus, 'refunded');
  assert.equal(productUpdates.length, 1); // stock restored once, not twice
});

// --- M4: delivery-proof gate ----------------------------------------------
test('M4 + L7 — release without a delivery photo is blocked; with a photo it releases on the SNAPSHOTTED fee, not the live %', async () => {
  const order = makeOrder({
    status: 'delivered',
    paymentMethod: 'online_advance',
    paymentStatus: 'held_in_escrow',
    amountHeld: 10000,
    platformFee: 200, // snapshotted at confirm, when the fee was 2%
    deliveryProof: undefined,
  });
  const res1 = makeRes();
  await paymentController.confirmDeliveryReceipt(
    { params: { id: 'order1' }, body: {}, user: buyer },
    res1,
    makeNext()
  );
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.body.error.code, 'DELIVERY_PROOF_REQUIRED');
  assert.equal(order.paymentStatus, 'held_in_escrow');

  // Photo uploaded, and meanwhile the env % moved 2% -> 5%: the release
  // must still use the Rs 200 snapshot, not Rs 500.
  order.deliveryProof = { url: 'https://example.com/proof.jpg' };
  process.env.PLATFORM_FEE_PERCENT = '5';
  const res2 = makeRes();
  await paymentController.confirmDeliveryReceipt(
    { params: { id: 'order1' }, body: {}, user: buyer },
    res2,
    makeNext()
  );
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.order.paymentStatus, 'released');
  assert.equal(res2.body.order.platformFee, 200);
  assert.equal(res2.body.order.payoutAmount, 9800);
  assert.equal(res2.body.order.amountHeld, 0);
});

test('M4 — delivery photo cannot be overwritten while a dispute is open or after the money is settled', async () => {
  // Open dispute: blocked before the photo is even read.
  makeOrder({ status: 'shipped', paymentStatus: 'unpaid', disputeId: 'dispute1' });
  makeDispute({ status: 'open' });
  const res1 = makeRes();
  await paymentController.uploadDeliveryProof(
    { params: { id: 'order1' }, body: { dataUrl: 'x' }, user: supplier },
    res1,
    makeNext()
  );
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.body.error.code, 'DISPUTE_OPEN');

  // Settled (released): blocked too.
  orderStore.get('order1').disputeId = null;
  orderStore.get('order1').paymentStatus = 'released';
  const res2 = makeRes();
  await paymentController.uploadDeliveryProof(
    { params: { id: 'order1' }, body: { dataUrl: 'x' }, user: supplier },
    res2,
    makeNext()
  );
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.body.error.code, 'INVALID_STATE');
});

// --- M5: dispute freeze blocks the whole lifecycle ------------------------
test('M5 — any status move returns DISPUTE_OPEN while a dispute is open; after resolution the move works', async () => {
  makeOrder({ status: 'confirmed', disputeId: 'dispute1' });
  makeDispute({ status: 'open' });
  const res1 = makeRes();
  await orderController.updateOrderStatus(
    { params: { id: 'order1' }, body: { status: 'processing' }, user: supplier },
    res1,
    makeNext()
  );
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.body.error.code, 'DISPUTE_OPEN');
  assert.equal(orderStore.get('order1').status, 'confirmed');

  disputeStore.get('dispute1').status = 'resolved';
  const res2 = makeRes();
  await orderController.updateOrderStatus(
    { params: { id: 'order1' }, body: { status: 'processing' }, user: supplier },
    res2,
    makeNext()
  );
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.order.status, 'processing');
});

// --- M6: loud fee log ------------------------------------------------------
test('M6 — checkFeeConfig() is loud when the fee % is unset/invalid, and confirms it when set', () => {
  const cap = captureConsole();
  try {
    delete process.env.PLATFORM_FEE_PERCENT;
    assert.equal(checkFeeConfig(), false);
    assert.ok(cap.lines.some(([lvl, msg]) => lvl === 'error' && msg.includes('PLATFORM_FEE_PERCENT')));
    assert.ok(cap.lines.some(([, msg]) => msg.includes('NOT SET')));

    cap.lines.length = 0;
    process.env.PLATFORM_FEE_PERCENT = 'abc';
    assert.equal(checkFeeConfig(), false);
    assert.equal(platformFeePercent(), 0); // behaviour unchanged: garbage -> 0
    assert.ok(cap.lines.some(([, msg]) => msg.includes('invalid')));

    cap.lines.length = 0;
    process.env.PLATFORM_FEE_PERCENT = '2';
    assert.equal(checkFeeConfig(), true);
    assert.ok(cap.lines.some(([lvl, msg]) => lvl === 'log' && msg.includes('2%')));
    assert.equal(calcPlatformFee(10000), 200);
  } finally {
    cap.restore();
  }
});

// --- L7: fee snapshot helper ------------------------------------------------
test('L7 — feeForRelease uses the confirm-time snapshot; a 0 snapshot falls back to the live %', () => {
  process.env.PLATFORM_FEE_PERCENT = '5'; // live % moved after confirm
  assert.equal(feeForRelease({ platformFee: 200 }, 10000), 200); // snapshot wins
  assert.equal(feeForRelease({ platformFee: 0 }, 10000), 500); // no snapshot: live %
  assert.equal(feeForRelease({}, 10000), 500); // pre-Batch-18 order: live %
  process.env.PLATFORM_FEE_PERCENT = '2';
  assert.equal(feeForRelease({ platformFee: 200 }, 10000), 200);
});

// --- L8: round first, then validate -----------------------------------------
test('L8 — partial refund 99.6 on a Rs 100 order is rejected (rounds to the full total); 99.4 passes as 99', async () => {
  makeOrder({ status: 'confirmed', totalAmount: 100, paymentStatus: 'frozen_dispute', prevPaymentStatus: 'held_in_escrow', amountHeld: 100 });
  makeDispute();
  const res1 = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_partial', refundAmount: 99.6 }, user: admin },
    res1,
    makeNext()
  );
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.body.error.code, 'INVALID_REFUND');
  assert.equal(disputeStore.get('dispute1').status, 'open');

  const res2 = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_partial', refundAmount: 99.4 }, user: admin },
    res2,
    makeNext()
  );
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.dispute.resolution.refundAmount, 99);
  assert.equal(res2.body.order.paymentStatus, 'refunded');
});

// --- L9: reason-11 resolution records the already-refunded amount ----------
test('L9 — reason-11 decision on an already-refunded cancelled order records the refunded amount, not 0', async () => {
  makeOrder({
    status: 'cancelled',
    paymentStatus: 'refunded',
    refundAmount: 10000, // set by the cancel itself
    prevPaymentStatus: '',
  });
  makeDispute({ reason: 'supplier_cancelled', reasonLabel: 'Supplier cancelled after advance' });
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_full', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dispute.resolution.refundAmount, 10000);
  assert.equal(res.body.order.paymentStatus, 'refunded');
  assert.equal(res.body.order.refundAmount, 10000);
});

// --- L10: admin cancel -------------------------------------------------------
test('L10 — admin cancels a stuck escrow-held order in full; delivered and released orders are refused', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'held_in_escrow', amountHeld: 5000, totalAmount: 5000, subtotal: 5000 });
  const res1 = makeRes();
  await adminController.cancelOrder(
    { params: { id: 'order1' }, body: { reason: 'Supplier unresponsive' }, user: admin },
    res1,
    makeNext()
  );
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.order.status, 'cancelled');
  assert.equal(res1.body.order.paymentStatus, 'refunded');
  assert.equal(res1.body.order.refundAmount, 5000);
  assert.equal(res1.body.order.platformFee, 0);
  assert.equal(productUpdates.length, 1);
  assert.ok(auditCreates.some((a) => a.action === 'ORDER_CANCELLED'));

  // Delivered: the goods arrived — that goes through a dispute.
  makeOrder({ _id: 'order2', orderNumber: 'AT-2026-002', status: 'delivered', paymentStatus: 'held_in_escrow' });
  const res2 = makeRes();
  await adminController.cancelOrder(
    { params: { id: 'order2' }, body: {}, user: admin },
    res2,
    makeNext()
  );
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.body.error.code, 'INVALID_STATE');

  // Released: money already with the supplier — no claw-back by cancel.
  makeOrder({ _id: 'order3', orderNumber: 'AT-2026-003', status: 'processing', paymentStatus: 'released' });
  const res3 = makeRes();
  await adminController.cancelOrder(
    { params: { id: 'order3' }, body: {}, user: admin },
    res3,
    makeNext()
  );
  assert.equal(res3.statusCode, 400);
  assert.equal(res3.body.error.code, 'INVALID_STATE');
});

test('L10 — admin cancel of a payment_submitted order returns it to unpaid with the reference cleared', async () => {
  makeOrder({ status: 'processing', paymentStatus: 'payment_submitted', paymentReference: 'TXN-OLD-9' });
  const res = makeRes();
  await adminController.cancelOrder(
    { params: { id: 'order1' }, body: {}, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'unpaid');
  assert.equal(res.body.order.paymentReference, '');
});

// --- Shared settlement stays in sync ---------------------------------------
test('shared cancel settlement — paid and held_in_escrow settle identically; admin + buyer paths agree', () => {
  assert.deepEqual(cancelSettlementPatch({ totalAmount: 7000, paymentStatus: 'held_in_escrow' }), {
    refundAmount: 7000, platformFee: 0, payoutAmount: 0, amountHeld: 0, paymentStatus: 'refunded',
  });
  assert.deepEqual(cancelSettlementPatch({ totalAmount: 7000, paymentStatus: 'paid' }), {
    refundAmount: 7000, platformFee: 0, payoutAmount: 0, amountHeld: 0, paymentStatus: 'refunded',
  });
  assert.deepEqual(cancelSettlementPatch({ totalAmount: 7000, paymentStatus: 'payment_submitted' }), {
    paymentStatus: 'unpaid', paymentReference: '',
  });
  assert.deepEqual(cancelSettlementPatch({ totalAmount: 7000, paymentStatus: 'unpaid' }), {});
  assert.deepEqual(ADMIN_CANCELLABLE_STATUSES, ['pending', 'confirmed', 'processing', 'shipped']);
});
