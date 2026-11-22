// ────────────────────────────────────────────────────────────
//  Analytics — real numbers from real orders (no mock data).
//
//  GET /api/analytics/supplier    (supplier only)
//  GET /api/analytics/shopkeeper  (shopkeeper only)
//
//  Both endpoints scope to the signed-in user server-side, so a user can
//  never see another account's numbers. Cancelled orders are excluded from
//  every money/quantity total — a cancelled order is not a sale.
//
//  Batch 19 (Round-5 audit H1) — these endpoints used to load the WHOLE
//  order history into Node (Order.find({ party }).lean(), no limit, no
//  date filter, no projection) and filter/group/sum in JS. Memory, CPU
//  and response size grew with every order, while the 14-day daily
//  buckets only ever needed 14 days of data. Everything is now
//  aggregated in Mongo — three small pipelines per endpoint, each
//  returning a handful of rows; no order document is ever loaded:
//    1. totals:    all-time counts + sums, grouped by status
//                  (totalOrders / ordersByStatus / revenueTotal /
//                  revenueDelivered keep their old all-time meaning)
//    2. top list:  top 5 products (supplier) / suppliers (shopkeeper),
//                  live orders only, grouped + sorted in Mongo
//    3. daily:     live orders from the last 14 days only, grouped by
//                  UTC calendar day — the daily buckets still need
//                  zero-filling in JS (a day with no orders has no row),
//                  so the dayBuckets() loop below is KEPT as-is; only
//                  its input changed (aggregated rows, not orders).
//  Batch 22 (Round-5 audit h-L4) finished the dedupe: both handlers
//  now call the shared bucketDaily() helper (dayBuckets + row-map +
//  fillDaily) instead of repeating that call.
// ────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const Order = require('../models/Order');

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

/** Midnight-aligned (UTC) day buckets for the last WINDOW_DAYS days, oldest first.
 * UTC, not local midnight: Mongo's $dateToString groups by UTC day, and the
 * bucket dates are formatted with toISOString() (UTC). Using local midnight
 * here shifted every bucket a day back in any non-UTC timezone (e.g. PKT),
 * so today's UTC bucket was missing and today's sales were dropped. */
function dayBuckets() {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const buckets = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(utcMidnight - i * DAY_MS);
    buckets.push({ date: d.toISOString().slice(0, 10), revenue: 0, orders: 0 });
  }
  return buckets;
}

/** Start of the 14-day window (UTC midnight, 13 days ago) — the daily $match. */
function windowStart() {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(utcMidnight - (WINDOW_DAYS - 1) * DAY_MS);
}

/** Fills the zero-filled day buckets from one aggregated row per day. */
function fillDaily(daily, rows) {
  const index = new Map(daily.map((b, i) => [b.date, i]));
  for (const row of rows || []) {
    const i = index.get(row.date);
    if (i === undefined) continue;
    daily[i].revenue += row.revenue || 0;
    daily[i].orders += row.orders || 0;
  }
  return daily;
}

/**
 * Builds the 14-day daily-bucket series from the daily pipeline's rows.
 * Batch 22 (Round-5 audit h-L4) — both handlers used to repeat the same
 * dayBuckets() + row-map + fillDaily() call; the loop now lives here.
 * (Batch 19 had already shared the fill loop itself as fillDaily —
 * this finishes the dedupe it left for Batch 22.)
 */
function bucketDaily(rows) {
  return fillDaily(
    dayBuckets(),
    (rows || []).map((r) => ({ date: r._id, revenue: r.revenue, orders: r.orders }))
  );
}

/**
 * GET /api/analytics/supplier
 * The signed-in supplier's sales summary: revenue, order breakdown,
 * top products by revenue, and daily revenue for the last 14 days.
 */
async function getSupplierAnalytics(req, res, next) {
  try {
    if (req.user.role !== 'supplier') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Supplier analytics are only available to suppliers.' },
      });
    }

    const supplierId = new mongoose.Types.ObjectId(req.user._id);
    const start = windowStart();

    const [totals, topProducts, dailyRows] = await Promise.all([
      // All-time totals, grouped by status in Mongo.
      Order.aggregate([
        { $match: { supplierId } },
        {
          $group: {
            _id: '$status',
            orders: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
      ]),
      // Top 5 products by revenue, live orders only, grouped in Mongo.
      Order.aggregate([
        { $match: { supplierId, status: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            productName: { $first: '$items.productName' },
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
      // Daily revenue for the last 14 days only — older orders never load.
      Order.aggregate([
        { $match: { supplierId, status: { $ne: 'cancelled' }, createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
          },
        },
      ]),
    ]);

    const ordersByStatus = {};
    let totalOrders = 0;
    let revenueTotal = 0;
    let revenueDelivered = 0;
    for (const row of totals) {
      ordersByStatus[row._id] = row.orders;
      totalOrders += row.orders;
      if (row._id !== 'cancelled') revenueTotal += row.revenue || 0;
      if (row._id === 'delivered') revenueDelivered += row.revenue || 0;
    }

    res.json({
      totalOrders,
      ordersByStatus,
      revenueTotal,
      revenueDelivered,
      topProducts: (topProducts || []).map((p) => ({
        productId: String(p._id),
        productName: p.productName || 'Product',
        quantity: p.quantity || 0,
        revenue: p.revenue || 0,
      })),
      dailyRevenue: bucketDaily(dailyRows),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/shopkeeper
 * The signed-in shopkeeper's spending summary: total spent, order
 * breakdown, top suppliers by spend, and daily spend for the last 14 days.
 */
async function getShopkeeperAnalytics(req, res, next) {
  try {
    if (req.user.role !== 'shopkeeper') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Shopkeeper analytics are only available to shopkeepers.' },
      });
    }

    const buyerId = new mongoose.Types.ObjectId(req.user._id);
    const start = windowStart();

    const [totals, topSuppliers, dailyRows] = await Promise.all([
      // All-time totals, grouped by status in Mongo.
      Order.aggregate([
        { $match: { buyerId } },
        {
          $group: {
            _id: '$status',
            orders: { $sum: 1 },
            spent: { $sum: '$totalAmount' },
          },
        },
      ]),
      // Top 5 suppliers by spend, live orders only, grouped in Mongo.
      Order.aggregate([
        { $match: { buyerId, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: '$supplierId',
            supplierName: { $first: '$supplierName' },
            orders: { $sum: 1 },
            spent: { $sum: '$totalAmount' },
          },
        },
        { $sort: { spent: -1 } },
        { $limit: 5 },
      ]),
      // Daily spend for the last 14 days only — older orders never load.
      Order.aggregate([
        { $match: { buyerId, status: { $ne: 'cancelled' }, createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
          },
        },
      ]),
    ]);

    const ordersByStatus = {};
    let totalOrders = 0;
    let spentTotal = 0;
    let spentDelivered = 0;
    for (const row of totals) {
      ordersByStatus[row._id] = row.orders;
      totalOrders += row.orders;
      if (row._id !== 'cancelled') spentTotal += row.spent || 0;
      if (row._id === 'delivered') spentDelivered += row.spent || 0;
    }

    res.json({
      totalOrders,
      ordersByStatus,
      spentTotal,
      spentDelivered,
      topSuppliers: (topSuppliers || []).map((s) => ({
        supplierId: String(s._id),
        supplierName: s.supplierName || 'Supplier',
        orders: s.orders || 0,
        spent: s.spent || 0,
      })),
      dailySpent: bucketDaily(dailyRows),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSupplierAnalytics, getShopkeeperAnalytics };
