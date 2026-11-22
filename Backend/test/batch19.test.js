'use strict';

// Tests for Batch 19 (Round-5 audit, batch C — Performance).
//
// Node's built-in runner only — no new dependencies, no MongoDB, no
// network. Run: `npm test` from the Backend folder.
//
// Behaviour under test (read from the code, not assumed):
//   • H1 — analytics never loads orders: Order.find is never called;
//     totals / top lists / daily buckets all come from Order.aggregate
//     pipelines, and the daily pipeline $matches createdAt >= 14 days
//     ago. Response shape (all-time totals, top 5, 14 daily buckets)
//     is unchanged.
//   • H2 — admin users / products / orders paginate with the getOrders
//     pattern: page/limit/totalPages/safePage (page 999 clamps to the
//     last page), total comes back, and the old silent 300/500 caps
//     are gone.
//   • M2 — chat pages newest-first (sort createdAt: -1) with a `before`
//     cursor (createdAt $lt) and hasMore; the wire order is newest
//     first (the API client reverses it — see Frontend/lib/api.ts).
//   • M5 — list projections: listUsers .select() excludes `avatar`
//     (but keeps `documents` metadata — the KYC viewer renders from
//     it); orders/disputes/notifications lists project too.
//   • M6 — checkout resolves the whole cart with ONE Product.find
//     ({ _id: { $in: ids } }) + id map; Product.findById is never
//     called, and validation order / error messages are unchanged.
//   • M7 — ?includeOutOfStock=true skips the public list's status
//     filter; without it the filter still applies.
//   • L2 — contacts return total/totalPages + clamped page.
//     (Batch 22 removed the audit-log endpoint — Round-5 audit h-M3 —
//     so the audit-log half of this test went with it; the contacts
//     half still proves the same Batch 19 fix.)
//   • L6 — stock restores go through ONE bulkWrite (restoreStock),
//     not one updateOne per line; empty sets are a no-op.
//   • L8 — notifyAdmins still notifies every admin (now via Promise.all).
//   • L10 — GET /api/products/categories returns distinct live
//     categories + live product total + distinct live-supplier count.
//
// Every model method is stubbed per test with in-memory fakes; the
// originals are restored after each test so no other test file (or
// test) ever sees a stub.

const test = require('node:test');
const assert = require('node:assert/strict');

const analyticsController = require('../src/controllers/analytics.controller');
const adminController = require('../src/controllers/admin.controller');
const messageController = require('../src/controllers/message.controller');
const orderController = require('../src/controllers/order.controller');
const productController = require('../src/controllers/product.controller');
const disputeController = require('../src/controllers/dispute.controller');
const notificationController = require('../src/controllers/notification.controller');
const { restoreStock } = require('../src/utils/stock');
const { notifyAdmins } = require('../src/utils/notify');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const Dispute = require('../src/models/Dispute');
const Message = require('../src/models/Message');
const Notification = require('../src/models/Notification');
const AuditLog = require('../src/models/AuditLog');
const ContactMessage = require('../src/models/ContactMessage');
const Counter = require('../src/models/Counter');

// --- Response / next fakes (same shape as test/batch17.test.js) --------
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

// --- Chainable Mongoose query fake ---------------------------------------
// Records every link in the chain (sort / skip / limit / select) and
// resolves lean() to `rows`. One fake serves every list shape:
//   .find().sort().skip().limit().select().lean()
//   .find().sort().limit().lean()
//   .find().sort().skip().limit().lean()
function chainable(rows, capture = {}) {
  const q = {
    sort(arg) {
      capture.sort = arg;
      return q;
    },
    skip(n) {
      capture.skip = n;
      return q;
    },
    limit(n) {
      capture.limit = n;
      return q;
    },
    select(arg) {
      capture.select = arg;
      return q;
    },
    lean: async () => rows,
  };
  return q;
}

// --- Stub save / restore ---------------------------------------------------
let originals = {};

function saveOriginals() {
  originals = {
    orderAggregate: Order.aggregate,
    orderFind: Order.find,
    orderFindById: Order.findById,
    orderCreate: Order.create,
    orderCount: Order.countDocuments,
    productFind: Product.find,
    productFindById: Product.findById,
    productUpdateOne: Product.updateOne,
    productBulkWrite: Product.bulkWrite,
    productCount: Product.countDocuments,
    productDistinct: Product.distinct,
    userFind: User.find,
    userCount: User.countDocuments,
    disputeFind: Dispute.find,
    disputeCount: Dispute.countDocuments,
    messageFind: Message.find,
    notifFind: Notification.find,
    notifCreate: Notification.create,
    notifCount: Notification.countDocuments,
    auditFind: AuditLog.find,
    auditCount: AuditLog.countDocuments,
    contactFind: ContactMessage.find,
    contactCount: ContactMessage.countDocuments,
    counterExists: Counter.exists,
    counterFindOneAndUpdate: Counter.findOneAndUpdate,
  };
}

function restoreOriginals() {
  Order.aggregate = originals.orderAggregate;
  Order.find = originals.orderFind;
  Order.findById = originals.orderFindById;
  Order.create = originals.orderCreate;
  Order.countDocuments = originals.orderCount;
  Product.find = originals.productFind;
  Product.findById = originals.productFindById;
  Product.updateOne = originals.productUpdateOne;
  Product.bulkWrite = originals.productBulkWrite;
  Product.countDocuments = originals.productCount;
  Product.distinct = originals.productDistinct;
  User.find = originals.userFind;
  User.countDocuments = originals.userCount;
  Dispute.find = originals.disputeFind;
  Dispute.countDocuments = originals.disputeCount;
  Message.find = originals.messageFind;
  Notification.find = originals.notifFind;
  Notification.create = originals.notifCreate;
  Notification.countDocuments = originals.notifCount;
  AuditLog.find = originals.auditFind;
  AuditLog.countDocuments = originals.auditCount;
  ContactMessage.find = originals.contactFind;
  ContactMessage.countDocuments = originals.contactCount;
  Counter.exists = originals.counterExists;
  Counter.findOneAndUpdate = originals.counterFindOneAndUpdate;
}

test.beforeEach(() => saveOriginals());
test.afterEach(() => restoreOriginals());

const SUPPLIER_ID = '507f1f77bcf86cd799439011';
const BUYER_ID = '507f1f77bcf86cd799439012';

// --- H1: analytics ---------------------------------------------------------
test('H1 supplier analytics aggregates in Mongo and never loads orders', async () => {
  const pipelines = [];
  Order.find = () => {
    throw new Error('Order.find must never be called by analytics (H1)');
  };
  Order.aggregate = async (pipeline) => {
    pipelines.push(pipeline);
    const hasUnwind = pipeline.some((s) => s.$unwind);
    const hasDateGroup = pipeline.some(
      (s) => s.$group && s.$group._id && typeof s.$group._id === 'object' && s.$group._id.$dateToString
    );
    if (hasUnwind) {
      return [
        { _id: 'p1', productName: 'Basmati Rice', quantity: 10, revenue: 2500 },
        { _id: 'p2', productName: 'Flour', quantity: 4, revenue: 800 },
      ];
    }
    if (hasDateGroup) {
      const today = new Date().toISOString().slice(0, 10);
      return [{ _id: today, revenue: 1000, orders: 2 }];
    }
    // Totals, grouped by status.
    return [
      { _id: 'delivered', orders: 2, revenue: 1500 },
      { _id: 'pending', orders: 1, revenue: 200 },
      { _id: 'cancelled', orders: 1, revenue: 999 },
    ];
  };

  const req = { user: { _id: SUPPLIER_ID, role: 'supplier' } };
  const res = makeRes();
  await analyticsController.getSupplierAnalytics(req, res, makeNext());

  assert.equal(res.statusCode, 200);
  assert.equal(pipelines.length, 3);
  // All-time totals keep their old meaning: cancelled excluded from money.
  assert.equal(res.body.totalOrders, 4);
  assert.deepEqual(res.body.ordersByStatus, { delivered: 2, pending: 1, cancelled: 1 });
  assert.equal(res.body.revenueTotal, 1700);
  assert.equal(res.body.revenueDelivered, 1500);
  // Top products come from the aggregation, in shape.
  assert.equal(res.body.topProducts.length, 2);
  assert.equal(res.body.topProducts[0].productId, 'p1');
  assert.equal(res.body.topProducts[0].revenue, 2500);
  // 14 daily buckets, zero-filled except today.
  assert.equal(res.body.dailyRevenue.length, 14);
  const todayBucket = res.body.dailyRevenue.find((b) => b.revenue === 1000);
  assert.ok(todayBucket);
  assert.equal(todayBucket.orders, 2);
  assert.ok(res.body.dailyRevenue.every((b) => b.revenue === 0 || b.revenue === 1000));

  // The daily pipeline only ever asks Mongo for the last 14 days.
  const dailyPipeline = pipelines.find((p) =>
    p.some((s) => s.$group && s.$group._id && typeof s.$group._id === 'object' && s.$group._id.$dateToString)
  );
  const dailyMatch = dailyPipeline.find((s) => s.$match);
  assert.ok(dailyMatch.$match.createdAt.$gte instanceof Date);
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  assert.ok(dailyMatch.$match.createdAt.$gte.getTime() >= fourteenDaysAgo);
  assert.ok(dailyMatch.$match.createdAt.$gte.getTime() <= Date.now());
  assert.equal(dailyMatch.$match.status.$ne, 'cancelled');
});

test('H1 shopkeeper analytics aggregates in Mongo (spent + top suppliers)', async () => {
  Order.find = () => {
    throw new Error('Order.find must never be called by analytics (H1)');
  };
  Order.aggregate = async (pipeline) => {
    const hasUnwind = pipeline.some((s) => s.$unwind);
    const hasDateGroup = pipeline.some(
      (s) => s.$group && s.$group._id && typeof s.$group._id === 'object' && s.$group._id.$dateToString
    );
    if (hasUnwind) return [];
    if (hasDateGroup) return [];
    return [
      { _id: 'delivered', orders: 1, spent: 500 },
      { _id: 'pending', orders: 2, spent: 300 },
    ];
  };
  // Top-suppliers pipeline is the non-date, non-unwind $group by
  // supplierId — it returns its rows from the same totals stub above
  // only when the group key is $supplierId; distinguish by _id shape.
  const realAggregate = Order.aggregate;
  Order.aggregate = async (pipeline) => {
    const group = pipeline.find((s) => s.$group);
    if (group && group.$group._id === '$supplierId') {
      return [{ _id: 's1', supplierName: 'Sup A', orders: 3, spent: 800 }];
    }
    return realAggregate(pipeline);
  };

  const req = { user: { _id: BUYER_ID, role: 'shopkeeper' } };
  const res = makeRes();
  await analyticsController.getShopkeeperAnalytics(req, res, makeNext());

  assert.equal(res.body.totalOrders, 3);
  assert.equal(res.body.spentTotal, 800);
  assert.equal(res.body.spentDelivered, 500);
  assert.equal(res.body.topSuppliers.length, 1);
  assert.equal(res.body.topSuppliers[0].supplierId, 's1');
  assert.equal(res.body.dailySpent.length, 14);
});

test('H1 analytics still refuses the wrong role without touching Mongo', async () => {
  let aggregateCalls = 0;
  Order.aggregate = async () => {
    aggregateCalls += 1;
    return [];
  };
  const req = { user: { _id: BUYER_ID, role: 'shopkeeper' } };
  const res = makeRes();
  await analyticsController.getSupplierAnalytics(req, res, makeNext());
  assert.equal(res.statusCode, 403);
  assert.equal(aggregateCalls, 0);
});

// --- H2: admin pagination ----------------------------------------------------
test('H2 listUsers paginates (page/limit/totalPages/safePage) and drops avatar', async () => {
  const capture = {};
  const rows = Array.from({ length: 50 }, (_, i) => ({
    _id: `u${i}`,
    name: `User ${i}`,
    email: `u${i}@example.com`,
    role: 'supplier',
    avatar: 'data:image/png;base64,xxxx',
    documents: { cnicFront: { url: '/uploads/kyc/x.jpg' } },
    cnic: 'encrypted',
  }));
  User.countDocuments = async () => 120;
  User.find = () => chainable(rows, capture);

  const req = { query: { page: '999', limit: '50' }, user: { role: 'admin' } };
  const res = makeRes();
  await adminController.listUsers(req, res, makeNext());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 120);
  assert.equal(res.body.totalPages, 3);
  // Page 999 clamps to the last page (safePage), like getOrders.
  assert.equal(res.body.page, 3);
  assert.equal(res.body.limit, 50);
  assert.equal(capture.skip, 100);
  assert.equal(capture.limit, 50);
  // Projection: avatar + identity numbers excluded; documents metadata kept
  // (the KYC viewer renders from it — see the controller comment).
  assert.ok(String(capture.select).includes('-avatar'));
  assert.ok(String(capture.select).includes('-cnic'));
  assert.ok(!String(capture.select).includes('-documents'));
});

test('H2 listProducts + listOrders paginate and project', async () => {
  const productCapture = {};
  const orderCapture = {};
  Product.countDocuments = async () => 55;
  Product.find = () => chainable([{ _id: 'p1', name: 'Rice' }], productCapture);
  Order.countDocuments = async () => 210;
  Order.find = () => chainable([{ _id: 'o1', orderNumber: 'AT-2026-001' }], orderCapture);

  const resP = makeRes();
  await adminController.listProducts({ query: { page: '2' }, user: { role: 'admin' } }, resP, makeNext());
  assert.equal(resP.body.total, 55);
  assert.equal(resP.body.totalPages, 2);
  assert.equal(resP.body.page, 2);
  assert.equal(productCapture.skip, 50);
  assert.ok(String(productCapture.select).includes('name'));
  assert.ok(!String(productCapture.select).includes('description'));

  const resO = makeRes();
  await adminController.listOrders({ query: { page: '1', limit: '50' }, user: { role: 'admin' } }, resO, makeNext());
  assert.equal(resO.body.total, 210);
  assert.equal(resO.body.totalPages, 5);
  assert.equal(orderCapture.skip, 0);
  assert.ok(String(orderCapture.select).includes('paymentReference'));
});

// --- L2: contacts totals -------------------------------------------------
// Batch 22 (Round-5 audit h-M3) — the audit-log endpoint is deleted, so
// this test now covers contacts only; the clamped-page behaviour it
// proves is unchanged.
test('L2 contacts return total/totalPages and clamp the page', async () => {
  ContactMessage.countDocuments = async () => 0;
  ContactMessage.find = () => chainable([], {});

  const resContacts = makeRes();
  await adminController.listContacts({ query: { page: '1', limit: '50' } }, resContacts, makeNext());
  assert.equal(resContacts.body.total, 0);
  assert.equal(resContacts.body.totalPages, 1);
  assert.equal(resContacts.body.page, 1);
});

// --- M2: chat paging ---------------------------------------------------------
test('M2 chat pages newest-first, supports a before cursor, reports hasMore', async () => {
  const capture = {};
  let findQuery = null;
  const newestFirst = [
    { _id: 'm3', text: 'third', createdAt: new Date('2026-11-22T10:03:00.000Z') },
    { _id: 'm2', text: 'second', createdAt: new Date('2026-11-22T10:02:00.000Z') },
    { _id: 'm1', text: 'first', createdAt: new Date('2026-11-22T10:01:00.000Z') },
  ];
  Order.findById = async () => ({ _id: 'o1', buyerId: BUYER_ID, supplierId: SUPPLIER_ID });
  Message.find = (query) => {
    findQuery = query;
    return chainable(newestFirst, capture);
  };

  const req = {
    params: { id: 'o1' },
    query: { limit: '3' },
    user: { _id: BUYER_ID, role: 'shopkeeper' },
  };
  const res = makeRes();
  await messageController.listMessages(req, res, makeNext());

  assert.deepEqual(capture.sort, { createdAt: -1, _id: -1 });
  assert.equal(capture.limit, 3);
  // Wire order is newest-first (the API client reverses it for display).
  assert.deepEqual(res.body.messages.map((m) => m.id), ['m3', 'm2', 'm1']);
  assert.equal(res.body.hasMore, true);

  // `before` narrows to older messages only.
  const reqBefore = {
    params: { id: 'o1' },
    query: { limit: '100', before: '2026-11-22T10:02:30.000Z' },
    user: { _id: BUYER_ID, role: 'shopkeeper' },
  };
  const resBefore = makeRes();
  await messageController.listMessages(reqBefore, resBefore, makeNext());
  assert.ok(findQuery.createdAt.$lt instanceof Date);
  assert.equal(findQuery.createdAt.$lt.toISOString(), '2026-11-22T10:02:30.000Z');
});

// --- M5: other list projections ----------------------------------------------
test('M5 getOrders, disputes and notifications project their lists', async () => {
  const orderCapture = {};
  const disputeCapture = {};
  const notifCapture = {};
  Order.countDocuments = async () => 1;
  Order.find = () => chainable([{ _id: 'o1' }], orderCapture);
  Dispute.countDocuments = async () => 1;
  Dispute.find = () => chainable([{ _id: 'd1' }], disputeCapture);
  Notification.countDocuments = async () => 1;
  Notification.find = () => chainable([{ _id: 'n1' }], notifCapture);

  await orderController.getOrders(
    { query: {}, user: { _id: BUYER_ID, role: 'shopkeeper' } },
    makeRes(),
    makeNext()
  );
  assert.ok(String(orderCapture.select).includes('orderNumber'));
  assert.ok(String(orderCapture.select).includes('items'));

  // Batch 22 (Round-5 audit h-M5) — listMyDisputes is deleted, so the
  // dispute projection is now proven through listDisputesAdmin, which
  // carries the same .select() list.
  await disputeController.listDisputesAdmin(
    { query: {}, user: { _id: BUYER_ID, role: 'admin' } },
    makeRes(),
    makeNext()
  );
  assert.ok(String(disputeCapture.select).includes('reasonLabel'));

  await notificationController.listNotifications(
    { query: {}, user: { _id: BUYER_ID, role: 'shopkeeper' } },
    makeRes(),
    makeNext()
  );
  assert.ok(String(notifCapture.select).includes('type'));
});

// --- M6: checkout $in -------------------------------------------------------
test('M6 checkout fetches the whole cart with one $in query, never findById', async () => {
  const stock = new Map([['p1', 10], ['p2', 5]]);
  const findFilters = [];
  Product.find = (filter) => {
    findFilters.push(filter);
    const ids = filter._id.$in;
    const all = [
      { _id: 'p1', name: 'Basmati Rice', price: 100, unit: 'bag', moq: 1, stock: 10, supplierId: 's1', supplierName: 'Sup A', image: 'img1' },
      { _id: 'p2', name: 'Flour', price: 50, unit: 'bag', moq: 2, stock: 5, supplierId: 's2', supplierName: 'Sup B', image: 'img2' },
    ];
    return { lean: async () => all.filter((p) => ids.includes(p._id)) };
  };
  Product.findById = () => {
    throw new Error('Product.findById must never be called at checkout (M6)');
  };
  Product.updateOne = async (filter, update) => {
    await Promise.resolve();
    const id = String(filter._id);
    const have = stock.get(id);
    if (have === undefined) return { modifiedCount: 0 };
    if (filter.stock && filter.stock.$gte !== undefined && have < filter.stock.$gte) {
      return { modifiedCount: 0 };
    }
    stock.set(id, have + (update.$inc ? update.$inc.stock : 0));
    return { modifiedCount: 1 };
  };
  let seq = 10;
  Counter.exists = async () => true;
  Counter.findOneAndUpdate = async () => ({ seq: (seq += 1) });
  const createdOrders = [];
  Order.create = async (doc) => {
    const order = { ...doc, _id: `o${createdOrders.length + 1}` };
    createdOrders.push(order);
    return order;
  };
  const notified = [];
  Notification.create = async (doc) => {
    notified.push(doc);
    return { _id: `n${notified.length}`, createdAt: new Date(), ...doc };
  };

  const req = {
    body: {
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 2 },
      ],
      shippingAddress: 'Shop 1, Karachi',
      paymentMethod: 'online_advance',
      paymentChannel: 'bank',
    },
    user: { _id: BUYER_ID, role: 'shopkeeper', businessName: 'My Shop' },
  };
  const res = makeRes();
  await orderController.createOrder(req, res, makeNext());

  assert.equal(res.statusCode, 201);
  // Exactly ONE catalogue read, with the whole cart in $in.
  assert.equal(findFilters.length, 1);
  assert.deepEqual([...findFilters[0]._id.$in].sort(), ['p1', 'p2']);
  // One order per supplier, stock reserved once per line.
  assert.equal(res.body.count, 2);
  assert.equal(stock.get('p1'), 8);
  assert.equal(stock.get('p2'), 3);
  // Both suppliers notified (L8 Promise.all fan-out).
  assert.equal(notified.filter((n) => n.type === 'order_placed').length, 2);
});

test('M6 checkout validation order is unchanged (missing product still 404s)', async () => {
  Product.find = () => ({ lean: async () => [] });
  Product.findById = () => {
    throw new Error('Product.findById must never be called at checkout (M6)');
  };
  const req = {
    body: {
      items: [{ productId: 'ghost', quantity: 1 }],
      shippingAddress: 'Shop 1',
    },
    user: { _id: BUYER_ID, role: 'shopkeeper', businessName: 'My Shop' },
  };
  const res = makeRes();
  await orderController.createOrder(req, res, makeNext());
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND');
});

// --- M7 + L10: products -----------------------------------------------------
test('M7 includeOutOfStock skips the status filter; without it the filter applies', async () => {
  const seenQueries = [];
  Product.countDocuments = async () => 0;
  Product.find = (query) => {
    seenQueries.push(query);
    return chainable([], {});
  };

  const resPlain = makeRes();
  await productController.getProducts({ query: {} }, resPlain, makeNext());
  assert.deepEqual(seenQueries[0].status, { $ne: 'Out of Stock' });

  const resFlag = makeRes();
  await productController.getProducts({ query: { includeOutOfStock: 'true' } }, resFlag, makeNext());
  assert.equal(seenQueries[1].status, undefined);
});

test('L10 product categories returns distinct live categories + totals', async () => {
  Product.distinct = async (field) => {
    if (field === 'category') return ['Spices', 'Rice', 'Rice'];
    if (field === 'supplierId') return ['s1', 's2', 's3'];
    return [];
  };
  Product.countDocuments = async () => 350;
  const res = makeRes();
  await productController.getProductCategories({}, res, makeNext());
  assert.deepEqual(res.body.categories, ['Rice', 'Spices']);
  assert.equal(res.body.total, 350);
  assert.equal(res.body.suppliers, 3);
});

// --- L6: restoreStock ----------------------------------------------------------
test('L6 restoreStock sends one bulkWrite for the whole set; empty set is a no-op', async () => {
  const bulkCalls = [];
  Product.bulkWrite = async (ops) => {
    bulkCalls.push(ops);
    return { modifiedCount: ops.length };
  };
  const result = await restoreStock(Product, [
    { productId: 'p1', quantity: 2 },
    { productId: 'p2', quantity: 5 },
  ]);
  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].length, 2);
  assert.deepEqual(bulkCalls[0][0], {
    updateOne: { filter: { _id: 'p1' }, update: { $inc: { stock: 2 } } },
  });
  assert.equal(result.modifiedCount, 2);

  const empty = await restoreStock(Product, []);
  assert.equal(empty, null);
  assert.equal(bulkCalls.length, 1);
});

// --- L8: notifyAdmins ----------------------------------------------------------
test('L8 notifyAdmins notifies every admin (parallel fan-out)', async () => {
  const notified = [];
  User.find = () => ({
    lean: async () => [{ _id: 'a1' }, { _id: 'a2' }, { _id: 'a3' }],
  });
  Notification.create = async (doc) => {
    notified.push(doc);
    return { _id: `n${notified.length}`, createdAt: new Date(), ...doc };
  };
  await notifyAdmins({ type: 'order_placed', title: 'T', message: 'M', link: '/x' });
  assert.equal(notified.length, 3);
  assert.deepEqual(
    notified.map((n) => String(n.userId)).sort(),
    ['a1', 'a2', 'a3']
  );
});
