const Order = require('../models/Order');
const Message = require('../models/Message');
const { toClient } = require('../utils/serialize');
const { notifyUser } = require('../utils/notify');

/**
 * Per-order chat (Batch 05).
 *
 * Buyer (shopkeeper) and supplier talk here — step 1 of the dispute flow,
 * before any claim reaches the admin. The admin can read the thread too:
 * it is dispute evidence. Text only.
 *
 * Batch 19 (Round-5 audit M2) — the thread used to page OLDEST-first
 * (sort createdAt: 1, limit 100): once a thread passed 100 messages the
 * NEWEST messages were unreachable — only the oldest 100 ever came back.
 * It now pages NEWEST-first (sort createdAt: -1, _id: -1) with an
 * optional `before` cursor (ISO timestamp — older than this message),
 * and the response is reversed back to chat order before it leaves the
 * API client (Frontend/lib/api.ts messages.list), so every caller still
 * receives oldest-first display order. `hasMore` says whether older
 * messages exist beyond this page.
 */

/** Loads an order the caller may read: a party to it, or admin/sub-admin. */
async function loadReadableOrder(req, res, orderId) {
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' } });
    return null;
  }
  const isAdmin = req.user.role === 'admin' || req.user.role === 'subadmin';
  const isBuyer = String(order.buyerId) === String(req.user._id);
  const isSupplier = String(order.supplierId) === String(req.user._id);
  if (!isAdmin && !isBuyer && !isSupplier) {
    res.status(403).json({ error: { code: 'ORDER_NOT_YOURS', message: 'You can only view your own orders.' } });
    return null;
  }
  return { order, isBuyer, isSupplier };
}

/**
 * GET /api/orders/:id/messages?limit=&before=  (party to the order, or admin)
 * Newest page first. Default 100, max 200. `before` is an ISO
 * timestamp: only messages created before it are returned, so the
 * client can page backwards through a long thread. `hasMore` is true
 * when the page is full, i.e. older messages may still exist beyond
 * it. The API client (Frontend/lib/api.ts messages.list) reverses the
 * page back to chat (oldest-first) order, so every caller still
 * receives display order and nobody changes.
 *
 * Same-millisecond edge: two messages stamped in the same millisecond
 * share a createdAt, so a `before` cursor set exactly on that stamp
 * could skip the twin. In practice messages are created sequentially
 * (one POST at a time), so this is negligible — the _id tie-break in
 * the sort keeps the order stable within a page.
 */
async function listMessages(req, res, next) {
  try {
    const found = await loadReadableOrder(req, res, req.params.id);
    if (!found) return;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const query = { orderId: found.order._id };
    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (!Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
    }
    const messages = await Message.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    // Newest-first on the wire — the API client reverses this page
    // back to chat order (see Frontend/lib/api.ts messages.list).
    res.json({
      messages: toClient(messages),
      count: messages.length,
      hasMore: messages.length === limit,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/orders/:id/messages  (buyer or supplier of the order)
 * Body: { text }. The other party is notified.
 */
async function sendMessage(req, res, next) {
  try {
    const found = await loadReadableOrder(req, res, req.params.id);
    if (!found) return;
    const { order, isBuyer, isSupplier } = found;
    if (!isBuyer && !isSupplier) {
      return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'Admins can read the chat but cannot send messages in it.' } });
    }
    const text = req.body.text ? String(req.body.text).trim() : '';
    if (!text || text.length > 2000) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Message text is required (max 2000 characters).' } });
    }

    const message = await Message.create({
      orderId: order._id,
      senderId: req.user._id,
      senderRole: req.user.role,
      senderName: req.user.businessName || req.user.name || '',
      text,
    });

    const otherId = isBuyer ? order.supplierId : order.buyerId;
    const otherLink = isBuyer ? `/supplier/orders/${order._id}` : `/shopkeeper/orders/${order._id}`;
    await notifyUser(otherId, {
      type: 'chat_message',
      title: `New message — ${order.orderNumber}`,
      message: `${message.senderName || 'Your trading partner'}: ${text.slice(0, 120)}`,
      link: otherLink,
      orderId: order._id,
    });

    res.status(201).json({ message: toClient(message.toObject()) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMessages, sendMessage };
