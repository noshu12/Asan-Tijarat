'use strict';

// GROUP3-ADMIN-FIX 2026-11-28

// Tests for Group 3 (2026-11-28) — GET /api/admin/trade-volume.
//
// Node's built-in runner only — no new dependencies, no MongoDB, no
// network. Run: `npm test` from the Backend folder.
//
// Behaviour under test (read from the code, not assumed):
//   • GET /api/admin/trade-volume?range=7|30|90 returns
//     { range, prevTotal, prevFeeTotal,
//       points: [{ date: 'YYYY-MM-DD', revenue, fee, orders }] },
//     one point per day in the window, oldest first, zero-filled.
//   • `fee` is the EXACT sum of the stored $platformFee for that day —
//     never 2% of revenue (dispute decisions can reduce the stored
//     fee); `prevFeeTotal` is the same stored-fee sum over the previous
//     equal-length period. Cancelled orders contribute 0 to both
//     revenue and fee (same $ne 'cancelled' $match on both sums).
//   • GET /api/admin/stats returns stats.feeTotal, the all-time sum of
//     $platformFee over non-cancelled orders (same aggregate as
//     revenue, one pipeline).
//   • GET /api/admin/stats also returns real month-over-month counts
//     (UTC calendar months — this month = [1st of current UTC month,
//     1st of next), last month = [1st of previous UTC month, 1st of
//     this month)): admins / subadmins, joinedThisMonth /
//     joinedLastMonth ({ users, suppliers, shopkeepers }), orders /
//     products created this month vs last month (orders: ALL statuses),
//     and pendingNewThisMonth (verified=false, same admin exclusion
//     as pendingVerifications). The backend supplies counts only —
//     the frontend computes % change itself.
//   • range defaults to 7; anything else (non-numeric, other numbers,
//     an operator object) → 400 INVALID_RANGE, and no query runs.
//   • Revenue definition matches getStats: NON-CANCELLED orders only
//     (status $ne 'cancelled'), $totalAmount summed per UTC calendar
//     day ($dateToString '%Y-%m-%d'), window starts at UTC midnight
//     (range - 1) days ago.
//   • prevTotal is the same non-cancelled $totalAmount sum over the
//     PREVIOUS equal-length period: [start - range days, start).
//   • The route is main-admin-only: requireRole('admin') on
//     /trade-volume (sub-admins get 403 from that middleware).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminController = require('../src/controllers/admin.controller');
const { requireRole } = require('../src/middleware/auth');
const Order = require('../src/models/Order');
const User = require('../src/models/User');
const Product = require('../src/models/Product');

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

// --- Stub save / restore ---------------------------------------------------
let originalAggregate;

test.beforeEach(() => {
  originalAggregate = Order.aggregate;
});
test.afterEach(() => {
  Order.aggregate = originalAggregate;
});

// Expected UTC-midnight bucket dates for a `range` window, oldest first.
function expectedDates(range) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dates = [];
  for (let i = range - 1; i >= 0; i--) {
    dates.push(new Date(utcMidnight - i * DAY_MS).toISOString().slice(0, 10));
  }
  return dates;
}

function utcMidnightMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// The daily pipeline groups by $dateToString; the prev-total pipeline
// groups by _id: null. Route stubbed rows to the right call.
function stubAggregates({ dailyRows = [], prevTotal = 0, prevFeeTotal = 0 } = {}) {
  const pipelines = [];
  Order.aggregate = async (pipeline) => {
    pipelines.push(pipeline);
    const isDaily = pipeline.some(
      (s) => s.$group && s.$group._id && typeof s.$group._id === 'object' && s.$group._id.$dateToString
    );
    if (isDaily) return dailyRows;
    return prevTotal === 0 && prevFeeTotal === 0
      ? []
      : [{ _id: null, total: prevTotal, feeTotal: prevFeeTotal }];
  };
  return pipelines;
}

// --- range validation ------------------------------------------------------
test('trade volume: range defaults to 7 and returns 7 zero-filled points', async () => {
  stubAggregates();
  const res = makeRes();
  await adminController.getTradeVolume({ query: {} }, res, makeNext());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.range, 7);
  assert.equal(res.body.prevTotal, 0);
  assert.equal(res.body.prevFeeTotal, 0);
  assert.equal(res.body.points.length, 7);
  assert.deepEqual(
    res.body.points.map((p) => p.date),
    expectedDates(7)
  );
  assert.ok(res.body.points.every((p) => p.revenue === 0 && p.fee === 0 && p.orders === 0));
});

test('trade volume: range=30 and range=90 return 30 / 90 points', async () => {
  stubAggregates();
  for (const range of [30, 90]) {
    const res = makeRes();
    await adminController.getTradeVolume({ query: { range: String(range) } }, res, makeNext());
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.range, range);
    assert.equal(res.body.points.length, range);
    assert.deepEqual(
      res.body.points.map((p) => p.date),
      expectedDates(range)
    );
  }
});

test('trade volume: invalid range → 400 INVALID_RANGE and no query runs', async () => {
  Order.aggregate = async () => {
    throw new Error('Order.aggregate must never run on invalid range');
  };
  const badValues = ['14', '0', 'abc', '7.5', { $ne: '7' }, ['7', '30']];
  for (const range of badValues) {
    const res = makeRes();
    const next = makeNext();
    await adminController.getTradeVolume({ query: { range } }, res, next);
    assert.equal(res.statusCode, 400, `range=${JSON.stringify(range)}`);
    assert.deepEqual(res.body, {
      error: { code: 'INVALID_RANGE', message: 'range must be 7, 30 or 90.' },
    });
    assert.equal(next.calls.length, 0);
  }
});

// --- aggregation + zero-fill -----------------------------------------------
test('trade volume: pipeline excludes cancelled orders and fills only real rows', async () => {
  const today = expectedDates(7)[6];
  const threeDaysAgo = expectedDates(7)[3];
  const pipelines = stubAggregates({
    dailyRows: [
      { _id: threeDaysAgo, revenue: 4500, fee: 137, orders: 2 },
      { _id: today, revenue: 1200, fee: 24, orders: 1 },
    ],
    prevTotal: 9000,
    prevFeeTotal: 250,
  });
  const res = makeRes();
  await adminController.getTradeVolume({ query: { range: '7' } }, res, makeNext());

  // Two pipelines: daily buckets + previous-period total.
  assert.equal(pipelines.length, 2);
  const daily = pipelines.find((p) =>
    p.some((s) => s.$group && s.$group._id && typeof s.$group._id === 'object')
  );
  const prev = pipelines.find((p) => p !== daily);

  // Daily: the getStats revenue definition — non-cancelled only,
  // windowed on createdAt, grouped by UTC calendar day.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const match = daily.find((s) => s.$match);
  assert.deepEqual(match.$match.status, { $ne: 'cancelled' });
  assert.equal(match.$match.createdAt.$gte.getTime(), utcMidnightMs() - 6 * DAY_MS);
  const group = daily.find((s) => s.$group);
  assert.deepEqual(group.$group._id, { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } });
  assert.deepEqual(group.$group.revenue, { $sum: '$totalAmount' });
  // Fee is the stored field summed, NOT a computed 2% of revenue.
  assert.deepEqual(group.$group.fee, { $sum: '$platformFee' });
  assert.deepEqual(group.$group.orders, { $sum: 1 });
  assert.deepEqual(daily.find((s) => s.$sort), { $sort: { _id: 1 } });

  // Previous period: same non-cancelled filter, the 7 days before the
  // current window — [midnight - 13 days, midnight - 6 days).
  const prevMatch = prev.find((s) => s.$match);
  assert.deepEqual(prevMatch.$match.status, { $ne: 'cancelled' });
  assert.equal(prevMatch.$match.createdAt.$gte.getTime(), utcMidnightMs() - 13 * DAY_MS);
  assert.equal(prevMatch.$match.createdAt.$lt.getTime(), utcMidnightMs() - 6 * DAY_MS);
  assert.deepEqual(prev.find((s) => s.$group).$group, {
    _id: null,
    total: { $sum: '$totalAmount' },
    feeTotal: { $sum: '$platformFee' },
  });

  // Response: prevTotal / prevFeeTotal from the second aggregate;
  // filled rows land on their days; every other day stays zero.
  assert.equal(res.body.range, 7);
  assert.equal(res.body.prevTotal, 9000);
  assert.equal(res.body.prevFeeTotal, 250);
  assert.equal(res.body.points.length, 7);
  assert.deepEqual(res.body.points[3], { date: threeDaysAgo, revenue: 4500, fee: 137, orders: 2 });
  assert.deepEqual(res.body.points[6], { date: today, revenue: 1200, fee: 24, orders: 1 });
  assert.deepEqual(res.body.points[0], { date: expectedDates(7)[0], revenue: 0, fee: 0, orders: 0 });
  assert.deepEqual(res.body.points[1], { date: expectedDates(7)[1], revenue: 0, fee: 0, orders: 0 });
});

test('trade volume: prevTotal is 0 when the previous period has no orders', async () => {
  stubAggregates({ dailyRows: [], prevTotal: 0, prevFeeTotal: 0 });
  const res = makeRes();
  await adminController.getTradeVolume({ query: { range: '30' } }, res, makeNext());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.prevTotal, 0);
  assert.equal(res.body.prevFeeTotal, 0);
});

// --- earnings: fee per point, prevFeeTotal, stats feeTotal -----------
test('trade volume: fee per point is the exact stored fee, not 2% of revenue', async () => {
  const today = expectedDates(7)[6];
  const yesterday = expectedDates(7)[5];
  stubAggregates({
    dailyRows: [
      // 2% of 10000 would be 200 — the stored fee is 137 (reduced by a
      // dispute decision). 2% of 5000 would be 100 — the stored fee is 0.
      { _id: yesterday, revenue: 10000, fee: 137, orders: 3 },
      { _id: today, revenue: 5000, fee: 0, orders: 1 },
    ],
    prevTotal: 4000,
    prevFeeTotal: 61,
  });
  const res = makeRes();
  await adminController.getTradeVolume({ query: { range: '7' } }, res, makeNext());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.points[5], { date: yesterday, revenue: 10000, fee: 137, orders: 3 });
  assert.deepEqual(res.body.points[6], { date: today, revenue: 5000, fee: 0, orders: 1 });
  assert.notEqual(res.body.points[5].fee, Math.round(res.body.points[5].revenue * 0.02));
  assert.notEqual(res.body.points[6].fee, Math.round(res.body.points[6].revenue * 0.02));
  // prevFeeTotal is independent too: 2% of 4000 would be 80, not 61.
  assert.equal(res.body.prevFeeTotal, 61);
  assert.notEqual(res.body.prevFeeTotal, Math.round(res.body.prevTotal * 0.02));
});

test('trade volume: prevFeeTotal value comes from the previous-period window only', async () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const pipelines = stubAggregates({ dailyRows: [], prevTotal: 7000, prevFeeTotal: 142 });
  const res = makeRes();
  await adminController.getTradeVolume({ query: { range: '7' } }, res, makeNext());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.prevTotal, 7000);
  assert.equal(res.body.prevFeeTotal, 142);
  assert.ok(Number.isFinite(res.body.prevFeeTotal) && res.body.prevFeeTotal >= 0);
  // Bounds: the fee sum runs over the SAME previous-period window as
  // prevTotal — [midnight - 13 days, midnight - 6 days) for range 7 —
  // in the same pipeline, so no current-period fee can leak into it.
  const prev = pipelines.find((p) => p.some((s) => s.$group && s.$group._id === null));
  const prevMatch = prev.find((s) => s.$match);
  assert.equal(prevMatch.$match.createdAt.$gte.getTime(), utcMidnightMs() - 13 * DAY_MS);
  assert.equal(prevMatch.$match.createdAt.$lt.getTime(), utcMidnightMs() - 6 * DAY_MS);
  assert.deepEqual(prev.find((s) => s.$group).$group.feeTotal, { $sum: '$platformFee' });
});

test('trade volume: a cancelled order with a nonzero platformFee contributes 0 to revenue and fee', async () => {
  // The exclusion lives in the $match shared by the revenue AND fee
  // sums: a cancelled order (totalAmount 8000, platformFee 500) never
  // reaches either $sum, so Mongo returns no row for its day and the
  // zero-fill leaves revenue 0 AND fee 0 — in both periods.
  const pipelines = stubAggregates({ dailyRows: [], prevTotal: 0, prevFeeTotal: 0 });
  const res = makeRes();
  await adminController.getTradeVolume({ query: { range: '7' } }, res, makeNext());
  assert.equal(res.statusCode, 200);
  for (const p of pipelines) {
    assert.deepEqual(p.find((s) => s.$match).$match.status, { $ne: 'cancelled' });
  }
  const daily = pipelines.find((p) => p.some((s) => s.$group && s.$group.fee));
  assert.deepEqual(daily.find((s) => s.$group).$group.fee, { $sum: '$platformFee' });
  assert.deepEqual(daily.find((s) => s.$group).$group.revenue, { $sum: '$totalAmount' });
  assert.ok(res.body.points.every((p) => p.revenue === 0 && p.fee === 0 && p.orders === 0));
  assert.equal(res.body.prevTotal, 0);
  assert.equal(res.body.prevFeeTotal, 0);
});

test('stats: feeTotal is the all-time stored platformFee sum over non-cancelled orders', async () => {
  // getStats also reads counts + recent orders — stub those locally
  // (restored in finally) so only the revenue/fee aggregate is under test.
  const orig = {
    userCount: User.countDocuments,
    productCount: Product.countDocuments,
    orderCount: Order.countDocuments,
    aggregate: Order.aggregate,
    find: Order.find,
  };
  try {
    User.countDocuments = async () => 10;
    Product.countDocuments = async () => 4;
    Order.countDocuments = async () => 6;
    let seenPipeline;
    Order.aggregate = async (pipeline) => {
      seenPipeline = pipeline;
      return [{ _id: null, total: 10000, feeTotal: 333 }];
    };
    Order.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });

    const res = makeRes();
    await adminController.getStats({}, res, makeNext());
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stats.revenue, 10000);
    assert.equal(res.body.stats.feeTotal, 333);
    // One aggregate, same non-cancelled filter, both sums — fee is the
    // stored field, not 2% of revenue (2% of 10000 would be 200).
    assert.notEqual(res.body.stats.feeTotal, Math.round(res.body.stats.revenue * 0.02));
    assert.deepEqual(seenPipeline[0].$match, { status: { $ne: 'cancelled' } });
    assert.deepEqual(seenPipeline[1].$group, {
      _id: null,
      total: { $sum: '$totalAmount' },
      feeTotal: { $sum: '$platformFee' },
    });
    // Nothing else about getStats changed.
    assert.equal(res.body.stats.users, 10);
    assert.equal(res.body.stats.products, 4);
    assert.equal(res.body.stats.orders, 6);
    assert.deepEqual(res.body.recentOrders, []);

    // No orders at all → feeTotal 0 (not undefined), revenue 0.
    Order.aggregate = async () => [];
    const empty = makeRes();
    await adminController.getStats({}, empty, makeNext());
    assert.equal(empty.body.stats.revenue, 0);
    assert.equal(empty.body.stats.feeTotal, 0);
  } finally {
    User.countDocuments = orig.userCount;
    Product.countDocuments = orig.productCount;
    Order.countDocuments = orig.orderCount;
    Order.aggregate = orig.aggregate;
    Order.find = orig.find;
  }
});

// --- getStats month-over-month counts --------------------------------------
// Same stub style as the feeTotal test above: countDocuments is replaced
// per model with a filter-keyed resolver (restored in finally), so each
// new count is verified by the exact filter it ran with — real counts
// from the DB in production, never invented numbers.
function utcMonthStarts() {
  const now = new Date();
  return {
    thisMonthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    nextMonthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    lastMonthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
  };
}

function stubStatsCounts(values) {
  const calls = [];
  const starts = utcMonthStarts();
  const resolve = (model, filter) => {
    calls.push({ model, filter });
    const created = filter.createdAt || null;
    const period = !created
      ? 'all'
      : created.$gte.getTime() === starts.thisMonthStart.getTime()
        ? 'this'
        : created.$gte.getTime() === starts.lastMonthStart.getTime()
          ? 'last'
          : 'other';
    if (model === 'User') {
      if (period === 'all') {
        if (filter.role === 'supplier') return values.suppliers;
        if (filter.role === 'shopkeeper') return values.shopkeepers;
        if (filter.role === 'admin') return values.admins;
        if (filter.role === 'subadmin') return values.subadmins;
        if (filter.verified === false) return values.pendingVerifications;
        return values.users;
      }
      // verified=false + a createdAt window is the pending-new count.
      if (filter.verified === false) return values.pendingNewThisMonth;
      if (filter.role === 'supplier') return values[`suppliersJoined${period === 'this' ? 'This' : 'Last'}Month`];
      if (filter.role === 'shopkeeper') return values[`shopkeepersJoined${period === 'this' ? 'This' : 'Last'}Month`];
      return values[`usersJoined${period === 'this' ? 'This' : 'Last'}Month`];
    }
    if (model === 'Order') {
      return period === 'all' ? values.orders : values[`orders${period === 'this' ? 'This' : 'Last'}Month`];
    }
    if (model === 'Product') {
      return period === 'all' ? values.products : values[`products${period === 'this' ? 'This' : 'Last'}Month`];
    }
    return 0;
  };
  User.countDocuments = async (filter) => resolve('User', filter);
  Product.countDocuments = async (filter) => resolve('Product', filter);
  Order.countDocuments = async (filter) => resolve('Order', filter);
  return { calls, starts };
}

// Runs getStats with stubbed counts + revenue aggregate + empty recent
// orders; returns the response and every countDocuments call made.
async function runGetStats(values, agg = { total: 10000, feeTotal: 333 }) {
  const orig = {
    userCount: User.countDocuments,
    productCount: Product.countDocuments,
    orderCount: Order.countDocuments,
    aggregate: Order.aggregate,
    find: Order.find,
  };
  const stub = stubStatsCounts(values);
  try {
    Order.aggregate = async () => [{ _id: null, total: agg.total, feeTotal: agg.feeTotal }];
    Order.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
    const res = makeRes();
    await adminController.getStats({}, res, makeNext());
    return { res, calls: stub.calls, starts: stub.starts };
  } finally {
    User.countDocuments = orig.userCount;
    Product.countDocuments = orig.productCount;
    Order.countDocuments = orig.orderCount;
    Order.aggregate = orig.aggregate;
    Order.find = orig.find;
  }
}

test('stats: month-over-month counts — admins, joins, orders, products, pending-new', async () => {
  const values = {
    users: 50, suppliers: 20, shopkeepers: 27, admins: 2, subadmins: 1,
    pendingVerifications: 5, products: 40, orders: 60,
    usersJoinedThisMonth: 9, suppliersJoinedThisMonth: 4, shopkeepersJoinedThisMonth: 5,
    usersJoinedLastMonth: 6, suppliersJoinedLastMonth: 2, shopkeepersJoinedLastMonth: 4,
    ordersThisMonth: 12, ordersLastMonth: 8,
    productsThisMonth: 7, productsLastMonth: 3,
    pendingNewThisMonth: 3,
  };
  const { res, calls, starts } = await runGetStats(values);
  assert.equal(res.statusCode, 200);
  const s = res.body.stats;

  // Nothing else about getStats changed.
  assert.equal(s.users, 50);
  assert.equal(s.suppliers, 20);
  assert.equal(s.shopkeepers, 27);
  assert.equal(s.pendingVerifications, 5);
  assert.equal(s.products, 40);
  assert.equal(s.orders, 60);
  assert.equal(s.revenue, 10000);
  assert.equal(s.feeTotal, 333);
  assert.deepEqual(res.body.recentOrders, []);

  // New fields carry the stubbed (real-in-production) counts.
  assert.equal(s.admins, 2);
  assert.equal(s.subadmins, 1);
  assert.deepEqual(s.joinedThisMonth, { users: 9, suppliers: 4, shopkeepers: 5 });
  assert.deepEqual(s.joinedLastMonth, { users: 6, suppliers: 2, shopkeepers: 4 });
  assert.equal(s.ordersThisMonth, 12);
  assert.equal(s.ordersLastMonth, 8);
  assert.equal(s.productsThisMonth, 7);
  assert.equal(s.productsLastMonth, 3);
  assert.equal(s.pendingNewThisMonth, 3);

  // Window bounds: this month = [1st of this UTC month, 1st of next),
  // last month = [1st of previous UTC month, 1st of this month).
  const inWindow = (filter, start, end) =>
    filter.createdAt &&
    filter.createdAt.$gte.getTime() === start.getTime() &&
    filter.createdAt.$lt.getTime() === end.getTime();
  const monthCalls = calls.filter((c) => c.filter.createdAt);
  assert.equal(monthCalls.length, 11);
  const thisCalls = monthCalls.filter((c) => inWindow(c.filter, starts.thisMonthStart, starts.nextMonthStart));
  const lastCalls = monthCalls.filter((c) => inWindow(c.filter, starts.lastMonthStart, starts.thisMonthStart));
  // 6 this-month windows (3 joined + pending-new + orders + products)
  // and 5 last-month windows (3 joined + orders + products).
  assert.equal(thisCalls.length, 6);
  assert.equal(lastCalls.length, 5);
  assert.equal(thisCalls.length + lastCalls.length, monthCalls.length);

  // Orders: ALL statuses — the month counts carry no status filter.
  const orderMonthCalls = calls.filter((c) => c.model === 'Order' && c.filter.createdAt);
  assert.equal(orderMonthCalls.length, 2);
  assert.ok(orderMonthCalls.every((c) => c.filter.status === undefined));

  // Products: same two windows, no extra filter.
  const productMonthCalls = calls.filter((c) => c.model === 'Product' && c.filter.createdAt);
  assert.equal(productMonthCalls.length, 2);

  // pending-new: verified=false in the THIS-month window, with the
  // same admin exclusion as pendingVerifications.
  const pendingNew = calls.find(
    (c) => c.model === 'User' && c.filter.verified === false && c.filter.createdAt
  );
  assert.ok(pendingNew, 'no pending-new countDocuments call found');
  assert.deepEqual(pendingNew.filter.role, { $ne: 'admin' });
  assert.ok(inWindow(pendingNew.filter, starts.thisMonthStart, starts.nextMonthStart));

  // Joined counts split by role, per window: users (all roles) + one
  // call per role per window.
  for (const period of ['this', 'last']) {
    const start = period === 'this' ? starts.thisMonthStart : starts.lastMonthStart;
    const end = period === 'this' ? starts.nextMonthStart : starts.thisMonthStart;
    const joined = calls.filter(
      (c) => c.model === 'User' && c.filter.createdAt && c.filter.verified !== false && inWindow(c.filter, start, end)
    );
    assert.equal(joined.length, 3, `expected 3 joined calls for ${period} month`);
    assert.ok(joined.some((c) => c.filter.role === undefined), `${period}: missing all-roles joined call`);
    assert.ok(joined.some((c) => c.filter.role === 'supplier'), `${period}: missing supplier joined call`);
    assert.ok(joined.some((c) => c.filter.role === 'shopkeeper'), `${period}: missing shopkeeper joined call`);
  }
});

test('stats: month-over-month counts are 0 when last month had no activity', async () => {
  // The frontend shows "+N this month" when the previous count is 0 —
  // the backend just returns the real 0s, it never invents a %.
  const values = {
    users: 12, suppliers: 5, shopkeepers: 6, admins: 1, subadmins: 0,
    pendingVerifications: 2, products: 9, orders: 4,
    usersJoinedThisMonth: 3, suppliersJoinedThisMonth: 1, shopkeepersJoinedThisMonth: 2,
    usersJoinedLastMonth: 0, suppliersJoinedLastMonth: 0, shopkeepersJoinedLastMonth: 0,
    ordersThisMonth: 4, ordersLastMonth: 0,
    productsThisMonth: 2, productsLastMonth: 0,
    pendingNewThisMonth: 0,
  };
  const { res } = await runGetStats(values, { total: 500, feeTotal: 10 });
  const s = res.body.stats;
  assert.equal(s.subadmins, 0);
  assert.deepEqual(s.joinedThisMonth, { users: 3, suppliers: 1, shopkeepers: 2 });
  assert.deepEqual(s.joinedLastMonth, { users: 0, suppliers: 0, shopkeepers: 0 });
  assert.equal(s.ordersThisMonth, 4);
  assert.equal(s.ordersLastMonth, 0);
  assert.equal(s.productsThisMonth, 2);
  assert.equal(s.productsLastMonth, 0);
  assert.equal(s.pendingNewThisMonth, 0);
});

// --- main-admin-only wiring --------------------------------------------------
test('trade volume: requireRole(admin) rejects a sub-admin and lets admin through', () => {
  const denied = makeRes();
  let passed = false;
  requireRole('admin')({ user: { role: 'subadmin' } }, denied, () => {
    passed = true;
  });
  assert.equal(passed, false);
  assert.equal(denied.statusCode, 403);

  const allowed = makeRes();
  passed = false;
  requireRole('admin')({ user: { role: 'admin' } }, allowed, () => {
    passed = true;
  });
  assert.equal(passed, true);
});

test('trade volume: /trade-volume route is wired main-admin-only to getTradeVolume', () => {
  const routesSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'admin.routes.js'),
    'utf8'
  );
  const line = routesSrc
    .split('\n')
    .find((l) => l.includes('/trade-volume'));
  assert.ok(line, 'no /trade-volume route found in admin.routes.js');
  assert.ok(line.includes("requireRole('admin')"), `route is not admin-only: ${line}`);
  assert.ok(!line.includes('subadmin'), `route must not open to sub-admins: ${line}`);
  assert.ok(line.includes('admin.getTradeVolume'), `route does not call getTradeVolume: ${line}`);
  assert.equal(typeof adminController.getTradeVolume, 'function');
  // The superseded stats/daily contract must be gone.
  assert.ok(!routesSrc.includes('/stats/daily'), 'old /stats/daily route still present');
  assert.equal(typeof adminController.getDailyStats, 'undefined');
});
