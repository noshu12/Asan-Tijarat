'use strict';

// Tests for Batch 20 (Round-5 audit, batch D — Realtime + GA4, backend
// half).
//
// Node's built-in runner only — no new dependencies, no MongoDB, no
// network. Run: `npm test` from the Backend folder.
//
// Behaviour under test (audit (c)-1 — `payment_refunded` was wired
// everywhere but never emitted):
//   • a cancel that actually refunds money (escrowed or paid) emits a
//     DISTINCT payment_refunded notification, next to order_cancelled —
//     buyer cancel and admin cancel alike;
//   • a cancel with no money to return (unpaid, or a merely-submitted
//     reference going back to 'unpaid') emits NO payment_refunded;
//   • a dispute refund decision (refund_full / refund_partial /
//     return_goods) on a frozen escrowed payment emits payment_refunded;
//   • release emits none; a refund decision on money never confirmed
//     in (payment_submitted / unpaid) emits none; a never-frozen
//     dispute (the cancel already refunded AND already notified)
//     emits none — no double-notify of the same refund.
//
// Same in-memory stub harness as Batch 18 (atomic findOneAndUpdate over
// a Map); the `notifications` array records every Notification.create,
// so the tests assert on the notification TYPE, not just the count.

const test = require('node:test');
const assert = require('node:assert/strict');

const orderController = require('../src/controllers/order.controller');
const disputeController = require('../src/controllers/dispute.controller');
const adminController = require('../src/controllers/admin.controller');
const Order = require('../src/models/Order');
const Dispute = require('../src/models/Dispute');
const Product = require('../src/models/Product');
const AuditLog = require('../src/models/AuditLog');
const Notification = require('../src/models/Notification');

// --- Users ---------------------------------------------------------------
const buyer = { _id: 'buyer1', name: 'Shopkeeper', email: 'shop@example.com', role: 'shopkeeper' };
const admin = { _id: 'admin1', name: 'Admin', email: 'admin@example.com', role: 'admin' };

// --- Fake docs + stores (mirrors Batch 18) -------------------------------
function makeDoc(fields) {
  const doc = { ...fields };
  doc.save = async function () { };
  doc.toObject = function () {
    const out = {};
    for (const [k, v] of Object.entries(this)) {
      if (typeof v !== 'function') out[k] = v;
    }
    return out;
  };
  return doc;
}

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

function makeFindOneAndUpdate(store) {
  return async (filter, update) => {
    await Promise.resolve();
    const doc = [...store.values()].find((d) => matchesFilter(d, filter));
    if (!doc) return null;
    if (update.$set) Object.assign(doc, update.$set);
    return doc;
  };
}

let orderStore;
let disputeStore;
let productUpdates;
let auditCreates;
let notifications;
let originals;

function installStubs() {
  originals = {
    orderFindById: Order.findById,
    orderFindOneAndUpdate: Order.findOneAndUpdate,
    disputeFindById: Dispute.findById,
    disputeFindOneAndUpdate: Dispute.findOneAndUpdate,
    productBulkWrite: Product.bulkWrite,
    auditCreate: AuditLog.create,
    notifCreate: Notification.create,
  };
  Order.findById = async (id) => orderStore.get(String(id)) || null;
  Order.findOneAndUpdate = makeFindOneAndUpdate(orderStore);
  Dispute.findById = (id) => queryable(disputeStore.get(String(id)) || null);
  Dispute.findOneAndUpdate = makeFindOneAndUpdate(disputeStore);
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
}

function restoreStubs() {
  Order.findById = originals.orderFindById;
  Order.findOneAndUpdate = originals.orderFindOneAndUpdate;
  Dispute.findById = originals.disputeFindById;
  Dispute.findOneAndUpdate = originals.disputeFindOneAndUpdate;
  Product.bulkWrite = originals.productBulkWrite;
  AuditLog.create = originals.auditCreate;
  Notification.create = originals.notifCreate;
}

test.beforeEach(() => {
  orderStore = new Map();
  disputeStore = new Map();
  productUpdates = [];
  auditCreates = [];
  notifications = [];
  installStubs();
});

test.afterEach(() => {
  restoreStubs();
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

function refundNotifs() {
  return notifications.filter((n) => n.type === 'payment_refunded');
}

// --- (c)-1: buyer cancel --------------------------------------------------
test('(c)-1 — buyer cancels an escrow-held order: payment_refunded is emitted next to order_cancelled', async () => {
  makeOrder({ status: 'pending', paymentStatus: 'held_in_escrow', amountHeld: 10000 });
  const res = makeRes();
  await orderController.updateOrderStatus(
    { params: { id: 'order1' }, body: { status: 'cancelled' }, user: buyer },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'refunded');
  // The buyer is excluded from their own action's notifications, so only
  // the supplier gets each event — one of each type.
  assert.equal(notifications.filter((n) => n.type === 'order_cancelled').length, 1);
  assert.equal(refundNotifs().length, 1);
  assert.match(refundNotifs()[0].message, /Rs 10000/);
  assert.match(refundNotifs()[0].title, /AT-2026-001/);
});

test('(c)-1 — buyer cancels a PAID at-delivery order: payment_refunded is emitted', async () => {
  makeOrder({ status: 'pending', paymentMethod: 'online_at_delivery', paymentStatus: 'paid', platformFee: 200, payoutAmount: 9800 });
  const res = makeRes();
  await orderController.updateOrderStatus(
    { params: { id: 'order1' }, body: { status: 'cancelled' }, user: buyer },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'refunded');
  assert.equal(refundNotifs().length, 1);
});

test('(c)-1 — buyer cancels an unpaid order: NO payment_refunded (nothing to return)', async () => {
  makeOrder({ status: 'pending', paymentStatus: 'unpaid' });
  const res = makeRes();
  await orderController.updateOrderStatus(
    { params: { id: 'order1' }, body: { status: 'cancelled' }, user: buyer },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(notifications.filter((n) => n.type === 'order_cancelled').length, 1);
  assert.equal(refundNotifs().length, 0);
});

test('(c)-1 — buyer cancels a payment_submitted order: NO payment_refunded (reference was never confirmed)', async () => {
  makeOrder({ status: 'pending', paymentStatus: 'payment_submitted', paymentReference: 'TXN-OLD-1' });
  const res = makeRes();
  await orderController.updateOrderStatus(
    { params: { id: 'order1' }, body: { status: 'cancelled' }, user: buyer },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'unpaid');
  assert.equal(refundNotifs().length, 0);
});

// --- (c)-1: admin cancel ---------------------------------------------------
test('(c)-1 — admin cancels an escrow-held order: payment_refunded goes to BOTH parties', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'held_in_escrow', amountHeld: 5000, totalAmount: 5000, subtotal: 5000 });
  const res = makeRes();
  await adminController.cancelOrder(
    { params: { id: 'order1' }, body: { reason: 'Supplier unresponsive' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'refunded');
  // The admin is neither party, so both buyer + supplier get each event.
  assert.equal(notifications.filter((n) => n.type === 'order_cancelled').length, 2);
  assert.equal(refundNotifs().length, 2);
});

test('(c)-1 — admin cancels a payment_submitted order: NO payment_refunded', async () => {
  makeOrder({ status: 'processing', paymentStatus: 'payment_submitted', paymentReference: 'TXN-OLD-9' });
  const res = makeRes();
  await adminController.cancelOrder(
    { params: { id: 'order1' }, body: {}, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'unpaid');
  assert.equal(refundNotifs().length, 0);
});

// --- (c)-1: dispute decisions ---------------------------------------------
test('(c)-1 — refund_full on a frozen escrowed payment: payment_refunded is emitted to both parties', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'held_in_escrow', amountHeld: 10000 });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_full', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'refunded');
  assert.equal(notifications.filter((n) => n.type === 'dispute_resolved').length, 2);
  assert.equal(refundNotifs().length, 2);
  assert.match(refundNotifs()[0].message, /Rs 10000/);
});

test('(c)-1 — refund_partial on a frozen escrowed payment: payment_refunded carries the partial amount', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'held_in_escrow', amountHeld: 10000 });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_partial', refundAmount: 4000, note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.refundAmount, 4000);
  assert.equal(refundNotifs().length, 2);
  assert.match(refundNotifs()[0].message, /Rs 4000/);
});

test('(c)-1 — return_goods on a frozen escrowed payment: payment_refunded is emitted', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'held_in_escrow', amountHeld: 10000 });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'return_goods', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(refundNotifs().length, 2);
});

test('(c)-1 — release decision: NO payment_refunded (money goes to the supplier)', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'held_in_escrow', amountHeld: 10000 });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'release', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'released');
  assert.equal(refundNotifs().length, 0);
});

test('(c)-1 — refund_full on a never-confirmed (payment_submitted) payment: NO payment_refunded', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'payment_submitted' });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_full', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'payment_submitted');
  assert.equal(refundNotifs().length, 0);
});

test('(c)-1 — refund_full on an unpaid payment: NO payment_refunded (no money was ever paid)', async () => {
  makeOrder({ status: 'confirmed', paymentStatus: 'frozen_dispute', prevPaymentStatus: 'unpaid' });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_full', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order.paymentStatus, 'refunded');
  assert.equal(refundNotifs().length, 0);
});

test('(c)-1 — refund_full on a never-frozen dispute: NO second payment_refunded (the cancel already sent it)', async () => {
  // Reason-11 claim on a cancelled order whose advance was already
  // refunded at cancel time: the resolution records the cancel's
  // refundAmount, but the notification for that refund went out on the
  // cancel path — deciding the dispute must not repeat it.
  makeOrder({ status: 'cancelled', paymentStatus: 'refunded', refundAmount: 10000 });
  makeDispute();
  const res = makeRes();
  await disputeController.decideDispute(
    { params: { id: 'dispute1' }, body: { decision: 'refund_full', note: '' }, user: admin },
    res,
    makeNext()
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dispute.resolution.refundAmount, 10000);
  assert.equal(refundNotifs().length, 0);
});
