const mongoose = require('mongoose');
const Order = require('../models/Order');
const Rating = require('../models/Rating');
const { toClient } = require('../utils/serialize');
const { notifyUser } = require('../utils/notify');

/**
 * Rating / review (Batch 05).
 *
 * After an order is delivered, the shopkeeper rates the supplier 1-5 stars
 * + an optional comment — one rating per order, never editable or deletable
 * by the supplier. The supplier's average + count are computed live from
 * the stored rows (no cached average to drift out of sync).
 */

/**
 * POST /api/ratings  (shopkeeper only)
 * Body: { orderId, stars, comment? }.
 */
async function createRating(req, res, next) {
  try {
    const { orderId, stars, comment } = req.body;
    const starCount = Number(stars);
    if (!orderId || !Number.isInteger(starCount) || starCount < 1 || starCount > 5) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'orderId and stars (1-5) are required.' },
      });
    }
    if (comment !== undefined && String(comment).length > 1000) {
      return res.status(400).json({ error: { code: 'INVALID_COMMENT', message: 'Comment must be 1000 characters or less.' } });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' } });
    }
    if (String(order.buyerId) !== String(req.user._id)) {
      return res.status(403).json({ error: { code: 'ORDER_NOT_YOURS', message: 'Only the shopkeeper who placed this order can rate it.' } });
    }
    if (order.status !== 'delivered') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Only a delivered order can be rated.' } });
    }

    const existing = await Rating.findOne({ orderId: order._id });
    if (existing) {
      return res.status(400).json({ error: { code: 'ALREADY_RATED', message: 'This order has already been rated.' } });
    }

    const rating = await Rating.create({
      orderId: order._id,
      supplierId: order.supplierId,
      shopkeeperId: req.user._id,
      shopkeeperName: req.user.businessName || req.user.name || '',
      stars: starCount,
      comment: comment ? String(comment).trim() : '',
    });

    await notifyUser(order.supplierId, {
      type: 'rating_received',
      title: `New ${starCount}-star rating — ${order.orderNumber}`,
      message: `${rating.shopkeeperName || 'A shopkeeper'} rated your delivery ${starCount}/5.`,
      link: `/supplier/profile`,
      orderId: order._id,
    });

    res.status(201).json({ rating: toClient(rating.toObject()) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ratings/order/:orderId  (party to the order)
 * The rating for one order, or { rating: null } when it has no rating yet.
 */
async function getOrderRating(req, res, next) {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' } });
    }
    const isBuyer = String(order.buyerId) === String(req.user._id);
    const isSupplier = String(order.supplierId) === String(req.user._id);
    if (!isBuyer && !isSupplier) {
      return res.status(403).json({ error: { code: 'ORDER_NOT_YOURS', message: 'You can only view your own orders.' } });
    }
    const rating = await Rating.findOne({ orderId: order._id }).lean();
    res.json({ rating: rating ? toClient(rating) : null });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ratings/supplier/:supplierId  (signed-in user)
 * Live average + count + latest 5 reviews for a supplier's profile.
 */
async function getSupplierRating(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.supplierId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid supplier id.' } });
    }
    const supplierId = new mongoose.Types.ObjectId(req.params.supplierId);
    const [agg] = await Rating.aggregate([
      { $match: { supplierId } },
      { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } },
    ]);
    const reviews = await Rating.find({ supplierId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    res.json({
      supplierId: req.params.supplierId,
      average: agg ? Math.round(agg.average * 10) / 10 : 0,
      count: agg ? agg.count : 0,
      reviews: toClient(reviews),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRating, getOrderRating, getSupplierRating };
