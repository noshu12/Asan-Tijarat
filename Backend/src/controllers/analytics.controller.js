// ────────────────────────────────────────────────────────────
//  Analytics — real numbers from real orders (no mock data).
//
//  GET /api/analytics/supplier    (supplier only)
//  GET /api/analytics/shopkeeper  (shopkeeper only)
//
//  Both endpoints scope to the signed-in user server-side, so a user can
//  never see another account's numbers. Cancelled orders are excluded from
//  every money/quantity total — a cancelled order is not a sale.
// ────────────────────────────────────────────────────────────
const Order = require('../models/Order');

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

/** Midnight-aligned day buckets for the last WINDOW_DAYS days, oldest first. */
function dayBuckets() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    buckets.push({ date: d.toISOString().slice(0, 10), revenue: 0, orders: 0 });
  }
  return buckets;
}

function countByStatus(orders) {
  const counts = {};
  for (const o of orders) {
    counts[o.status] = (counts[o.status] || 0) + 1;
  }
  return counts;
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

    const orders = await Order.find({ supplierId: req.user._id }).lean();
    const live = orders.filter((o) => o.status !== 'cancelled');
    const delivered = orders.filter((o) => o.status === 'delivered');

    // Top products by revenue across live (non-cancelled) orders.
    const byProduct = new Map();
    for (const o of live) {
      for (const item of o.items || []) {
        const key = String(item.productId);
        const cur = byProduct.get(key) || {
          productId: key,
          productName: item.productName || 'Product',
          quantity: 0,
          revenue: 0,
        };
        cur.quantity += item.quantity || 0;
        cur.revenue += (item.unitPrice || 0) * (item.quantity || 0);
        byProduct.set(key, cur);
      }
    }
    const topProducts = [...byProduct.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Daily revenue buckets for the last 14 days.
    const daily = dayBuckets();
    const index = new Map(daily.map((b, i) => [b.date, i]));
    for (const o of live) {
      if (!o.createdAt) continue;
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (index.has(key)) {
        daily[index.get(key)].revenue += o.totalAmount || 0;
        daily[index.get(key)].orders += 1;
      }
    }

    res.json({
      totalOrders: orders.length,
      ordersByStatus: countByStatus(orders),
      revenueTotal: live.reduce((s, o) => s + (o.totalAmount || 0), 0),
      revenueDelivered: delivered.reduce((s, o) => s + (o.totalAmount || 0), 0),
      topProducts,
      dailyRevenue: daily,
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

    const orders = await Order.find({ buyerId: req.user._id }).lean();
    const live = orders.filter((o) => o.status !== 'cancelled');
    const delivered = orders.filter((o) => o.status === 'delivered');

    // Top suppliers by spend across live (non-cancelled) orders.
    const bySupplier = new Map();
    for (const o of live) {
      const key = String(o.supplierId);
      const cur = bySupplier.get(key) || {
        supplierId: key,
        supplierName: o.supplierName || 'Supplier',
        orders: 0,
        spent: 0,
      };
      cur.orders += 1;
      cur.spent += o.totalAmount || 0;
      bySupplier.set(key, cur);
    }
    const topSuppliers = [...bySupplier.values()]
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5);

    // Daily spend buckets for the last 14 days.
    const daily = dayBuckets();
    const index = new Map(daily.map((b, i) => [b.date, i]));
    for (const o of live) {
      if (!o.createdAt) continue;
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (index.has(key)) {
        daily[index.get(key)].revenue += o.totalAmount || 0;
        daily[index.get(key)].orders += 1;
      }
    }

    res.json({
      totalOrders: orders.length,
      ordersByStatus: countByStatus(orders),
      spentTotal: live.reduce((s, o) => s + (o.totalAmount || 0), 0),
      spentDelivered: delivered.reduce((s, o) => s + (o.totalAmount || 0), 0),
      topSuppliers,
      dailySpent: daily,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSupplierAnalytics, getShopkeeperAnalytics };
