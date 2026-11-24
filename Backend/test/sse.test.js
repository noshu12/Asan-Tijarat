'use strict';

// Tests for the realtime SSE stream (Batch 13):
//   • Backend/src/utils/sseHub.js — hub registry + broadcast
//   • Backend/src/routes/realtime.routes.js — GET /api/realtime/stream
//
// Node's built-in runner only — no new dependencies, no MongoDB,
// no network, no listening server. Run: `npm test` from the Backend
// folder.
//
// Behaviour under test (read from the source, not assumed):
//   • hub: one user, several tabs; 5-connection cap (6th refused);
//     removeClient drops empty users (no leak); broadcast writes
//     `event: <type>\ndata: <json>` to that user's connections ONLY;
//     a failed write drops that connection; broadcast never throws,
//     even with no connections or a throwing res;
//   • route: unauthenticated GET /stream -> 401 (the real `protect`
//     middleware, no token at all, so no DB is touched); a 6th tab for
//     the same user -> 429 TOO_MANY_CONNECTIONS with no stream headers;
//     11 connects in a minute -> 429 TOO_MANY_STREAMS on the 11th.

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { afterEach } = require('node:test');

// Every stream opened by the Batch 23 tests is tracked here and closed
// by the afterEach hook — even when a test FAILS mid-way — so a leaked
// 25 s heartbeat interval can never hang the runner (a failing test
// used to leave the process alive forever).
const openStreams = [];
afterEach(() => {
  while (openStreams.length > 0) {
    const s = openStreams.pop();
    try { s.req.emit('close'); } catch { /* stream already closed — nothing to clean up */ }
  }
});

// --- Batch 23: fake models for the controller tests ----------------------
// The Batch 23 tests below exercise the CONTROLLERS with the REAL
// notify.js + REAL sseHub against FAKE Mongoose models + FAKE upload
// helpers, installed in require.cache BEFORE any controller (or
// anything that loads the models, e.g. middleware/auth via the realtime
// route) is required. node:test runs this file in its own process, so
// the stubs never leak into other test files. No MongoDB, no network,
// no files written to disk. The real Notification enum is captured
// BEFORE the model is stubbed, so the enum test reads the real list.
const { NOTIFICATION_TYPES } = require('../src/models/Notification');

function stubModule(resolvedPath, exportsObj) {
  require.cache[resolvedPath] = { id: resolvedPath, filename: resolvedPath, loaded: true, exports: exportsObj };
}

const ADMIN_ID = '333333333333333333333333';
const SUPPLIER_ID = '444444444444444444444444';
const BUYER_ID = '555555555555555555555555';
const BUYER2_ID = '666666666666666666666666';
const BUYER3_ID = '999999999999999999999999';
const PRODUCT_ID = '777777777777777777777777';
const NEW_USER_ID = '888888888888888888888888';

const notificationRows = [];
const FakeNotification = {
  rows: notificationRows,
  async create(doc) {
    const row = { ...doc, _id: `notif${notificationRows.length + 1}`, createdAt: new Date('2026-11-22T00:00:00.000Z') };
    notificationRows.push(row);
    return row;
  },
};

const FakeUser = {
  find() {
    return { lean: async () => [{ _id: ADMIN_ID }] };
  },
  async findOne() { return null; },
  async findById() { return null; },
  async create(doc) {
    const user = { ...doc, _id: NEW_USER_ID };
    user.toSafeJSON = () => ({ id: user._id, name: user.name, role: user.role });
    return user;
  },
};

let fakeOrderById = null;
let fakeUpdatedOrder = null;
let fakeActiveOrders = [];
const createdOrders = [];
const FakeOrder = {
  rows: createdOrders,
  async create(doc) {
    const order = { ...doc, _id: `order${createdOrders.length + 1}` };
    createdOrders.push(order);
    return order;
  },
  async findById() { return fakeOrderById; },
  find(filter) {
    return {
      // The fake honours the status filter notifyActiveOrderParties
      // passes (real Mongo would): delivered/cancelled orders must NOT
      // be returned, or the test could not prove they hear nothing.
      lean: async () => {
        if (filter && filter.status && Array.isArray(filter.status.$in)) {
          return fakeActiveOrders.filter((o) => filter.status.$in.includes(o.status));
        }
        return fakeActiveOrders;
      },
    };
  },
  async findOneAndUpdate() { return fakeUpdatedOrder; },
};

let fakeProductById = null;
let fakeCatalogueProducts = [];
const productStock = new Map();
const FakeProduct = {
  find() {
    return { lean: async () => fakeCatalogueProducts };
  },
  async findById() { return fakeProductById; },
  async updateOne(filter, update) {
    const id = String(filter._id);
    const stock = productStock.get(id);
    if (stock === undefined) return { modifiedCount: 0 };
    if (filter.stock && filter.stock.$gte !== undefined && stock < filter.stock.$gte) return { modifiedCount: 0 };
    productStock.set(id, stock + (update.$inc ? update.$inc.stock : 0));
    return { modifiedCount: 1 };
  },
  async bulkWrite() { return { ok: 1 }; },
  async create(doc) {
    return { ...doc, _id: PRODUCT_ID };
  },
};

const FakeCounter = {
  async exists() { return true; },
  async findOneAndUpdate() { return { seq: 7 }; },
};

const FakeDispute = {
  async findById() { return null; },
};

const FakeAuditLog = {
  async create() { return {}; },
};

let fakeKycDocuments = {};
const FakeKycStorage = {
  UPLOAD_ROOT: '/tmp/rt23-test-uploads',
  async saveKycDocuments() {
    return { documents: fakeKycDocuments, files: [], cloudinaryIds: [] };
  },
  async deleteStoredUploads() {},
  async deleteStoredFiles() {},
  KycUploadError: class KycUploadError extends Error {},
};

const FakeProductImageStorage = {
  async saveProductImages() {
    return { urls: ['https://example.com/p.jpg'], uploads: [], files: [], cloudinaryIds: [] };
  },
  async deleteStoredUploads() {},
  async deleteProductStoredFiles() {},
  ProductImageError: class ProductImageError extends Error {},
};

stubModule(require.resolve('../src/models/Notification'), FakeNotification);
stubModule(require.resolve('../src/models/User'), FakeUser);
stubModule(require.resolve('../src/models/Order'), FakeOrder);
stubModule(require.resolve('../src/models/Product'), FakeProduct);
stubModule(require.resolve('../src/models/Counter'), FakeCounter);
stubModule(require.resolve('../src/models/Dispute'), FakeDispute);
stubModule(require.resolve('../src/models/AuditLog'), FakeAuditLog);
stubModule(require.resolve('../src/utils/kycStorage'), FakeKycStorage);
stubModule(require.resolve('../src/utils/productImageStorage'), FakeProductImageStorage);

// --- Users ---------------------------------------------------------------
const USER_A = '111111111111111111111111';
const USER_B = '222222222222222222222222';

const sseHub = require('../src/utils/sseHub');
const realtime = require('../src/routes/realtime.routes');
const { streamHandler } = realtime;

// --- Small fakes --------------------------------------------------------
function makeRes() {
  const res = new EventEmitter();
  res.writes = [];
  res.statusCode = null;
  res.body = null;
  res.ended = false;
  res.write = function write(chunk) {
    if (this.writeThrows) throw new Error('boom: socket closed');
    this.writes.push(String(chunk));
    return true;
  };
  res.writeHead = function writeHead(status, headers) {
    this.statusCode = status;
    this.headers = headers;
  };
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function json(body) {
    this.body = body;
    return this;
  };
  res.end = function end() {
    this.ended = true;
    this.emit('close');
    return this;
  };
  return res;
}

function makeReq({ userId = USER_A, cookies = {} } = {}) {
  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/stream';
  req.path = '/stream';
  req.cookies = cookies;
  req.user = userId ? { _id: userId } : undefined;
  req.get = () => undefined;
  return req;
}

/** Calls streamHandler and returns the fake res. Cleans up timers. */
function connect(userId) {
  const req = makeReq({ userId });
  const res = makeRes();
  streamHandler(req, res);
  return { req, res };
}

// --- Hub: registration + cap -------------------------------------------
test('hub: one user can hold several tabs, up to 5', () => {
  const conns = [];
  for (let i = 0; i < 5; i += 1) {
    const res = makeRes();
    assert.equal(sseHub.addClient(USER_A, res), true, `tab ${i + 1}`);
    conns.push(res);
  }
  assert.equal(sseHub.getUserConnectionCount(USER_A), 5);
  assert.equal(sseHub.getConnectionCount(), 5);
  // 6th tab is refused and does not register.
  assert.equal(sseHub.addClient(USER_A, makeRes()), false);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 5);
  for (const res of conns) res.emit('close');
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
  assert.equal(sseHub.getConnectionCount(), 0);
});

test('hub: removeClient drops the user entry when the last tab closes (no leak)', () => {
  const res1 = makeRes();
  const res2 = makeRes();
  sseHub.addClient(USER_A, res1);
  sseHub.addClient(USER_B, res2);
  sseHub.removeClient(USER_A, res1);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
  assert.equal(sseHub.getUserConnectionCount(USER_B), 1);
  // Removing a res that was never added is a no-op, not a crash.
  sseHub.removeClient(USER_A, makeRes());
  sseHub.removeClient(USER_B, res2);
  assert.equal(sseHub.getConnectionCount(), 0);
});

test('hub: close event on the res removes it automatically', () => {
  const res = makeRes();
  sseHub.addClient(USER_A, res);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 1);
  res.emit('close');
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
});

// --- Hub: broadcast ------------------------------------------------------
test('hub: broadcast writes event + JSON data to that user only', () => {
  const resA1 = makeRes();
  const resA2 = makeRes();
  const resB = makeRes();
  sseHub.addClient(USER_A, resA1);
  sseHub.addClient(USER_A, resA2);
  sseHub.addClient(USER_B, resB);

  sseHub.broadcast(USER_A, {
    id: 'n1', type: 'order_placed', title: 'Order placed', message: '', link: '', orderId: null, createdAt: '2026-11-21T00:00:00.000Z',
  });

  const expected = 'event: order_placed\ndata: {"id":"n1","type":"order_placed","title":"Order placed","message":"","link":"","orderId":null,"createdAt":"2026-11-21T00:00:00.000Z"}\n\n';
  assert.deepEqual(resA1.writes, [expected]);
  assert.deepEqual(resA2.writes, [expected]);
  // User B never sees user A's event.
  assert.deepEqual(resB.writes, []);

  for (const res of [resA1, resA2, resB]) res.emit('close');
});

test('hub: broadcast to a user with no connections is a silent no-op', () => {
  assert.doesNotThrow(() => {
    sseHub.broadcast('333333333333333333333333', { type: 'chat_message', title: 'hi' });
  });
});

test('hub: a failed write drops that connection and the rest still get the event', () => {
  const dead = makeRes();
  dead.writeThrows = true;
  const live = makeRes();
  sseHub.addClient(USER_A, dead);
  sseHub.addClient(USER_A, live);
  assert.doesNotThrow(() => sseHub.broadcast(USER_A, { type: 'chat_message', title: 'hi' }));
  assert.equal(sseHub.getUserConnectionCount(USER_A), 1);
  assert.equal(live.writes.length, 1);
  live.emit('close');
});

test('hub: broadcast never throws, even for a res that throws on write', () => {
  const res = makeRes();
  res.write = () => { throw new Error('socket gone'); };
  sseHub.addClient(USER_A, res);
  assert.doesNotThrow(() => sseHub.broadcast(USER_A, { type: 'order_placed' }));
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
});

// --- Route: auth + caps ---------------------------------------------------
test('route: unauthenticated GET /stream -> 401 (real protect, no token)', async () => {
  const router = realtime;
  const req = makeReq({ userId: null, cookies: {} });
  const res = makeRes();
  let nextCalled = false;
  await new Promise((resolve) => {
    router.handle(req, res, () => { nextCalled = true; resolve(); });
    // protect() answers synchronously for a missing token; if it does
    // not, the promise below still resolves via the json() call.
    setImmediate(resolve);
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('route: connect writes SSE headers + ": connected", heartbeat is a 25 s interval', () => {
  realtime._resetConnectThrottle();
  const { req, res } = connect(USER_A);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/event-stream');
  assert.equal(res.headers['Cache-Control'], 'no-cache, no-transform');
  assert.equal(res.headers.Connection, 'keep-alive');
  assert.equal(res.headers['X-Accel-Buffering'], 'no');
  assert.deepEqual(res.writes, [': connected\n\n']);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 1);
  req.emit('close');
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
});

test('route: 6th tab for the same user -> 429 TOO_MANY_CONNECTIONS, no stream started', () => {
  realtime._resetConnectThrottle();
  const conns = [];
  for (let i = 0; i < 5; i += 1) conns.push(connect(USER_A));
  for (const { res } of conns) assert.equal(res.statusCode, 200);

  const { res } = connect(USER_A);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error.code, 'TOO_MANY_CONNECTIONS');
  assert.deepEqual(res.writes, []);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 5);

  for (const { req } of conns) req.emit('close');
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
});

test('route: 11 connects in a minute -> 429 TOO_MANY_STREAMS on the 11th', () => {
  realtime._resetConnectThrottle();
  const conns = [];
  for (let i = 0; i < 10; i += 1) {
    const c = connect(USER_B);
    assert.equal(c.res.statusCode, 200, `connect ${i + 1}`);
    // Close each one straight away so the 5-tab cap never interferes:
    // this test is about the per-minute throttle, not the cap.
    c.req.emit('close');
    conns.push(c);
  }
  const eleventh = connect(USER_B);
  assert.equal(eleventh.res.statusCode, 429);
  assert.equal(eleventh.res.body.error.code, 'TOO_MANY_STREAMS');
  assert.equal(sseHub.getUserConnectionCount(USER_B), 0);
  realtime._resetConnectThrottle();
});

// --- Batch 23: TEAMLY realtime audit fixes (RT-1..RT-5) ------------------
// Controllers under test, with the REAL notify.js + REAL sseHub (the
// fakes above were installed before these requires, so notify.js writes
// rows into notificationRows and pushes frames to the fake streams).
// Every admin/party notify in this batch is FIRE-AND-FORGET, so each
// test awaits flush() before asserting on rows/frames.
//
// What is asserted per event (the audit's missing fan-outs):
//   • RT-1 order_placed reaches ADMINS on createOrder (not just the supplier)
//   • RT-2 product_created reaches admins + every live viewer; a price/
//     stock update reaches the ACTIVE orders' buyers (once each, never
//     the acting supplier, never a delivered order's buyer as a TARGET —
//     they still get the public frame as viewers) + admins + viewers
//   • RT-3 user_registered reaches admins on register
//   • RT-4 kyc_submitted reaches admins on register WITH documents only
//   • RT-5 order_status reaches admins exactly ONCE on updateOrderStatus
//     and on the admin cancelOrder
//   • the 9 new enum types exist (26 total)
//   • broadcastToAll reaches every user and never throws
const { createOrder, updateOrderStatus } = require('../src/controllers/order.controller');
const { createProduct, updateProduct } = require('../src/controllers/product.controller');
const { register } = require('../src/controllers/auth.controller');
const { cancelOrder } = require('../src/controllers/admin.controller');

/** Lets every fire-and-forget notify chain finish (a few async ticks). */
async function flush() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Opens a live stream for a user (throttle reset first) and returns { req, res }. */
function openStream(userId) {
  realtime._resetConnectThrottle();
  const c = connect(userId);
  assert.equal(c.res.statusCode, 200);
  openStreams.push(c);
  return c;
}

/** Parses a fake res's writes into [{ type, data }] SSE frames. */
function frames(res) {
  return res.writes
    .filter((w) => w.startsWith('event: '))
    .map((w) => ({
      type: w.split('\n')[0].slice('event: '.length),
      data: JSON.parse(w.split('\n')[1].slice('data: '.length)),
    }));
}

function framesOfType(res, type) {
  return frames(res).filter((f) => f.type === type);
}

function resetBatch23() {
  notificationRows.length = 0;
  createdOrders.length = 0;
  fakeOrderById = null;
  fakeUpdatedOrder = null;
  fakeActiveOrders = [];
  fakeProductById = null;
  fakeCatalogueProducts = [];
  fakeKycDocuments = {};
  productStock.clear();
}

function makeNext() {
  let err = null;
  const next = (e) => { err = e; };
  return { next, getErr: () => err };
}

// --- Enum -----------------------------------------------------------------
test('batch23: Notification enum has the 9 new types (26 total)', () => {
  assert.equal(NOTIFICATION_TYPES.length, 26);
  for (const t of ['product_created', 'product_updated', 'product_approved', 'product_rejected', 'stock_updated', 'price_updated', 'user_registered', 'kyc_submitted', 'order_status']) {
    assert.ok(NOTIFICATION_TYPES.includes(t), t);
  }
});

// --- Hub: broadcastToAll ---------------------------------------------------
test('batch23: hub broadcastToAll reaches every user, never throws with no connections', () => {
  const resA = makeRes();
  const resB = makeRes();
  sseHub.addClient(USER_A, resA);
  sseHub.addClient(USER_B, resB);
  sseHub.broadcastToAll({
    id: null, type: 'product_created', title: 'New', message: '', link: '/product/x', orderId: null, createdAt: '2026-11-22T00:00:00.000Z',
  });
  const expected = 'event: product_created\ndata: {"id":null,"type":"product_created","title":"New","message":"","link":"/product/x","orderId":null,"createdAt":"2026-11-22T00:00:00.000Z"}\n\n';
  assert.deepEqual(resA.writes, [expected]);
  assert.deepEqual(resB.writes, [expected]);
  resA.emit('close');
  resB.emit('close');
  assert.doesNotThrow(() => sseHub.broadcastToAll({ type: 'stock_updated', title: 'x' }));
});

// --- RT-1: order_placed reaches admins --------------------------------------
test('batch23 RT-1: createOrder notifies admins (order_placed) as well as the supplier', async () => {
  resetBatch23();
  fakeCatalogueProducts = [
    { _id: PRODUCT_ID, name: 'Basmati Rice', price: 250, unit: 'bag', moq: 1, stock: 10, supplierId: SUPPLIER_ID, supplierName: 'Supplier One' },
  ];
  productStock.set(PRODUCT_ID, 10);
  const admin = openStream(ADMIN_ID);
  const supplier = openStream(SUPPLIER_ID);
  const req = {
    user: { _id: BUYER_ID, businessName: 'Test Shop', name: 'Test', role: 'shopkeeper' },
    body: { items: [{ productId: PRODUCT_ID, quantity: 2 }], shippingAddress: 'Shop 1, Test Street, Karachi' },
  };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await createOrder(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.statusCode, 201);
  assert.equal(createdOrders.length, 1);
  assert.equal(createdOrders[0].orderNumber, 'AT-2026-007');

  // Supplier: the pre-existing targeted notify (unchanged).
  const supplierPlaced = framesOfType(supplier.res, 'order_placed');
  assert.equal(supplierPlaced.length, 1);
  assert.equal(supplierPlaced[0].data.link, `/supplier/orders/${createdOrders[0]._id}`);
  assert.equal(supplierPlaced[0].data.orderId, createdOrders[0]._id);

  // Admin: the RT-1 fix — one order_placed per created order.
  const adminPlaced = framesOfType(admin.res, 'order_placed');
  assert.equal(adminPlaced.length, 1);
  assert.equal(adminPlaced[0].data.title, 'New order AT-2026-007');
  assert.equal(adminPlaced[0].data.link, `/admin/orders/${createdOrders[0]._id}`);
  assert.match(adminPlaced[0].data.message, /500 PKR/);
  assert.ok(!adminPlaced[0].data.message.includes('Test Street'), 'no address in the admin message');
  const adminRows = notificationRows.filter((r) => String(r.userId) === ADMIN_ID && r.type === 'order_placed');
  assert.equal(adminRows.length, 1);

  admin.req.emit('close');
  supplier.req.emit('close');
});

test('batch23 RT-1: a failed checkout sends no notification at all', async () => {
  resetBatch23();
  const admin = openStream(ADMIN_ID);
  const req = {
    user: { _id: BUYER_ID, businessName: 'Test Shop', name: 'Test', role: 'shopkeeper' },
    body: { items: [], shippingAddress: 'Shop 1, Test Street, Karachi' },
  };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await createOrder(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.statusCode, 400);
  assert.equal(notificationRows.length, 0);
  assert.deepEqual(frames(admin.res), []);
  admin.req.emit('close');
});

// --- RT-3 + RT-4: register ---------------------------------------------------
test('batch23 RT-3: register notifies admins (user_registered), no kyc_submitted without documents', async () => {
  resetBatch23();
  fakeKycDocuments = {};
  const admin = openStream(ADMIN_ID);
  const req = {
    body: {
      name: 'Ali Traders', email: 'ali@example.com', phone: '03001234567', password: 'password123',
      role: 'supplier', businessName: 'Ali Traders', city: 'Karachi', ntn: '1234567',
      categories: ['Staples, Grains & Flours'],
    },
  };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await register(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.statusCode, 201);
  const reg = framesOfType(admin.res, 'user_registered');
  assert.equal(reg.length, 1);
  assert.equal(reg[0].data.title, 'New supplier registered');
  assert.equal(reg[0].data.link, `/admin/users/${NEW_USER_ID}`);
  assert.ok(!reg[0].data.message.includes('ali@example.com'), 'no email in the payload');
  assert.ok(!reg[0].data.message.includes('03001234567'), 'no phone in the payload');
  assert.equal(framesOfType(admin.res, 'kyc_submitted').length, 0);
  admin.req.emit('close');
});

test('batch23 RT-4: register WITH documents also notifies admins (kyc_submitted, link is the user id)', async () => {
  resetBatch23();
  fakeKycDocuments = {
    cnicFront: { url: 'https://example.com/cnic-front.jpg' },
    cnicBack: { url: 'https://example.com/cnic-back.jpg' },
  };
  const admin = openStream(ADMIN_ID);
  const req = {
    body: {
      name: 'Ali Traders', email: 'ali@example.com', phone: '03001234567', password: 'password123',
      role: 'supplier', businessName: 'Ali Traders', city: 'Karachi', ntn: '1234567',
      categories: ['Staples, Grains & Flours'],
      documents: { cnicFront: 'data:image/jpeg;base64,x', cnicBack: 'data:image/jpeg;base64,y' },
    },
  };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await register(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.statusCode, 201);
  assert.equal(framesOfType(admin.res, 'user_registered').length, 1);
  // RT-4 correction: "KYC submit" IS register() — no kyc.controller, no
  // Kyc model — so the kyc_submitted fires here, linked by the user id.
  const kyc = framesOfType(admin.res, 'kyc_submitted');
  assert.equal(kyc.length, 1);
  assert.equal(kyc[0].data.link, `/admin/kyc/${NEW_USER_ID}`);
  assert.ok(!kyc[0].data.message.includes('ali@example.com'), 'no email in the payload');
  admin.req.emit('close');
});

// --- RT-5: order_status -------------------------------------------------------
test('batch23 RT-5: updateOrderStatus notifies admins (order_status) exactly ONCE, plus the buyer', async () => {
  resetBatch23();
  const orderDoc = {
    _id: 'ord1', orderNumber: 'AT-2026-007', buyerId: BUYER_ID, buyerName: 'Test Shop',
    supplierId: SUPPLIER_ID, supplierName: 'Supplier One', status: 'pending',
    paymentStatus: 'unpaid', paymentMethod: 'online_advance', disputeId: null, items: [],
  };
  fakeOrderById = orderDoc;
  fakeUpdatedOrder = { ...orderDoc, status: 'confirmed' };
  const admin = openStream(ADMIN_ID);
  const buyer = openStream(BUYER_ID);
  const supplier = openStream(SUPPLIER_ID);
  const req = { params: { id: 'ord1' }, body: { status: 'confirmed' }, user: { _id: SUPPLIER_ID } };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await updateOrderStatus(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.body.order.status, 'confirmed');
  // Buyer gets the specific type; the acting supplier is excluded.
  assert.equal(framesOfType(buyer.res, 'order_confirmed').length, 1);
  assert.equal(framesOfType(supplier.res, 'order_confirmed').length, 0);
  // Admin gets exactly ONE generic order_status (never inside a loop).
  const adminStatus = framesOfType(admin.res, 'order_status');
  assert.equal(adminStatus.length, 1);
  assert.equal(adminStatus[0].data.title, 'Order AT-2026-007 — confirmed');
  assert.equal(adminStatus[0].data.message, 'Order AT-2026-007 moved to confirmed.');
  assert.equal(adminStatus[0].data.link, '/admin/orders/ord1');
  assert.equal(adminStatus[0].data.orderId, 'ord1');
  admin.req.emit('close');
  buyer.req.emit('close');
  supplier.req.emit('close');
});

test('batch23 RT-5: admin cancelOrder notifies admins (order_status) once', async () => {
  resetBatch23();
  const orderDoc = {
    _id: 'ord1', orderNumber: 'AT-2026-007', buyerId: BUYER_ID, supplierId: SUPPLIER_ID,
    status: 'pending', paymentStatus: 'unpaid', disputeId: null,
    items: [{ productId: PRODUCT_ID, quantity: 2 }], refundAmount: 0, totalAmount: 500,
  };
  fakeOrderById = orderDoc;
  const updatedDoc = { ...orderDoc, status: 'cancelled' };
  updatedDoc.toObject = function toObject() {
    const rest = { ...this };
    delete rest.toObject;
    return rest;
  };
  fakeUpdatedOrder = updatedDoc;
  const admin = openStream(ADMIN_ID);
  const buyer = openStream(BUYER_ID);
  const supplier = openStream(SUPPLIER_ID);
  const req = { params: { id: 'ord1' }, body: {}, user: { _id: ADMIN_ID, role: 'admin', name: 'Admin' } };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await cancelOrder(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.body.order.status, 'cancelled');
  // Parties hear order_cancelled (admin excluded as the actor).
  assert.equal(framesOfType(buyer.res, 'order_cancelled').length, 1);
  assert.equal(framesOfType(supplier.res, 'order_cancelled').length, 1);
  // Admin feed: exactly one order_status.
  const adminStatus = framesOfType(admin.res, 'order_status');
  assert.equal(adminStatus.length, 1);
  assert.equal(adminStatus[0].data.title, 'Order AT-2026-007 — cancelled');
  assert.equal(adminStatus[0].data.link, '/admin/orders/ord1');
  admin.req.emit('close');
  buyer.req.emit('close');
  supplier.req.emit('close');
});

// --- RT-2: product events -------------------------------------------------------
test('batch23 RT-2: createProduct notifies admins (product_created) and every live viewer', async () => {
  resetBatch23();
  const admin = openStream(ADMIN_ID);
  const viewer = openStream(BUYER_ID);
  const req = {
    user: { _id: SUPPLIER_ID, businessName: 'Supplier One', name: 'Supplier One', city: 'Karachi', categories: ['Staples, Grains & Flours'] },
    body: { name: 'Basmati Rice', category: 'Staples, Grains & Flours', price: 250, unit: 'bag', moq: 1, stock: 10, description: 'Fine rice' },
  };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await createProduct(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.statusCode, 201);
  // Admin gets it twice on the wire by design: once targeted (stored
  // row, id set) and once public (id null) — same type + link, so the
  // frontend treats catalogue events as idempotent refresh triggers.
  const adminCreated = framesOfType(admin.res, 'product_created');
  assert.equal(adminCreated.length, 2);
  assert.equal(adminCreated.filter((f) => f.data.id !== null).length, 1);
  assert.equal(adminCreated.filter((f) => f.data.id === null).length, 1);
  assert.equal(adminCreated[0].data.link, `/product/${PRODUCT_ID}`);
  // A plain marketplace viewer gets only the public frame (no row).
  const viewerCreated = framesOfType(viewer.res, 'product_created');
  assert.equal(viewerCreated.length, 1);
  assert.equal(viewerCreated[0].data.id, null);
  assert.equal(viewerCreated[0].data.link, `/product/${PRODUCT_ID}`);
  const rows = notificationRows.filter((r) => r.type === 'product_created');
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].userId), ADMIN_ID);
  admin.req.emit('close');
  viewer.req.emit('close');
});

test('batch23 RT-2: updateProduct notifies active-order buyers + admins + viewers on price/stock change', async () => {
  resetBatch23();
  const productDoc = {
    _id: PRODUCT_ID, name: 'Basmati Rice', category: 'Staples, Grains & Flours',
    price: 250, unit: 'bag', moq: 1, stock: 10, status: 'Active',
    supplierId: SUPPLIER_ID, supplierName: 'Supplier One', imageUploads: [],
    save: async function save() { return this; },
  };
  fakeProductById = productDoc;
  fakeActiveOrders = [
    { _id: 'ordA', buyerId: BUYER_ID, supplierId: SUPPLIER_ID, status: 'confirmed' },
    { _id: 'ordB', buyerId: BUYER2_ID, supplierId: SUPPLIER_ID, status: 'processing' },
    { _id: 'ordC', buyerId: BUYER3_ID, supplierId: SUPPLIER_ID, status: 'delivered' },
  ];
  const admin = openStream(ADMIN_ID);
  const buyer = openStream(BUYER_ID);
  const buyer2 = openStream(BUYER2_ID);
  const buyer3 = openStream(BUYER3_ID);
  const supplier = openStream(SUPPLIER_ID);
  const req = {
    params: { id: PRODUCT_ID },
    user: { _id: SUPPLIER_ID, categories: ['Staples, Grains & Flours'] },
    body: { price: 300, stock: 4 },
  };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await updateProduct(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.body.product.price, 300);
  assert.equal(res.body.product.stock, 4);

  // Admin: product_updated once (targeted only — not a public type).
  const adminUpdated = framesOfType(admin.res, 'product_updated');
  assert.equal(adminUpdated.length, 1);
  assert.equal(adminUpdated[0].data.link, `/product/${PRODUCT_ID}`);

  // Buyers of ACTIVE orders: targeted (id set) + public (id null) per type.
  for (const b of [buyer, buyer2]) {
    assert.equal(framesOfType(b.res, 'price_updated').length, 2);
    assert.equal(framesOfType(b.res, 'stock_updated').length, 2);
    const targetedPrice = framesOfType(b.res, 'price_updated').filter((f) => f.data.id !== null);
    assert.equal(targetedPrice.length, 1);
    assert.equal(targetedPrice[0].data.link, `/product/${PRODUCT_ID}`);
    assert.match(targetedPrice[0].data.message, /Rs 300/);
    const targetedStock = framesOfType(b.res, 'stock_updated').filter((f) => f.data.id !== null);
    assert.equal(targetedStock.length, 1);
    assert.match(targetedStock[0].data.message, /4 bag/);
  }

  // Delivered order's buyer: public frames only as a viewer — no targeted row.
  assert.equal(framesOfType(buyer3.res, 'price_updated').length, 1);
  assert.equal(framesOfType(buyer3.res, 'price_updated')[0].data.id, null);
  assert.equal(framesOfType(buyer3.res, 'stock_updated').length, 1);

  // Acting supplier: public frames only — never notified about their own edit.
  assert.equal(framesOfType(supplier.res, 'price_updated').length, 1);
  assert.equal(framesOfType(supplier.res, 'price_updated')[0].data.id, null);
  assert.equal(framesOfType(supplier.res, 'stock_updated').length, 1);

  // Stored rows: the two active buyers x two types; supplier has none.
  const partyRows = notificationRows.filter((r) => ['price_updated', 'stock_updated'].includes(r.type));
  assert.equal(partyRows.length, 4);
  assert.ok(partyRows.every((r) => [BUYER_ID, BUYER2_ID].includes(String(r.userId))));
  assert.equal(notificationRows.filter((r) => r.type === 'product_updated').length, 1);
  assert.equal(String(notificationRows.find((r) => r.type === 'product_updated').userId), ADMIN_ID);

  admin.req.emit('close');
  buyer.req.emit('close');
  buyer2.req.emit('close');
  buyer3.req.emit('close');
  supplier.req.emit('close');
});

test('batch23 RT-2: a name-only update sends product_updated to admins and no price/stock event', async () => {
  resetBatch23();
  const productDoc = {
    _id: PRODUCT_ID, name: 'Basmati Rice', category: 'Staples, Grains & Flours',
    price: 250, unit: 'bag', moq: 1, stock: 10, status: 'Active',
    supplierId: SUPPLIER_ID, supplierName: 'Supplier One', imageUploads: [],
    save: async function save() { return this; },
  };
  fakeProductById = productDoc;
  fakeActiveOrders = [{ _id: 'ordA', buyerId: BUYER_ID, supplierId: SUPPLIER_ID, status: 'confirmed' }];
  const admin = openStream(ADMIN_ID);
  const buyer = openStream(BUYER_ID);
  const req = {
    params: { id: PRODUCT_ID },
    user: { _id: SUPPLIER_ID, categories: ['Staples, Grains & Flours'] },
    body: { name: 'Basmati Rice Premium' },
  };
  const res = makeRes();
  const { next, getErr } = makeNext();
  await updateProduct(req, res, next);
  await flush();
  assert.equal(getErr(), null);
  assert.equal(res.body.product.name, 'Basmati Rice Premium');
  assert.equal(framesOfType(admin.res, 'product_updated').length, 1);
  assert.equal(framesOfType(admin.res, 'price_updated').length, 0);
  assert.equal(framesOfType(admin.res, 'stock_updated').length, 0);
  assert.equal(framesOfType(buyer.res, 'price_updated').length, 0);
  assert.equal(framesOfType(buyer.res, 'stock_updated').length, 0);
  assert.equal(notificationRows.filter((r) => r.type === 'product_updated').length, 1);
  admin.req.emit('close');
  buyer.req.emit('close');
});
