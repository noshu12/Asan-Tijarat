const Order = require('../models/Order');
const Message = require('../models/Message');
const { toClient } = require('../utils/serialize');
const { notifyUser } = require('../utils/notify');

/**
 * Per-order chat (Batch 05).
 *
 * Buyer (shopkeeper) and supplier talk here — step 1 of the dispute flow,
 * before any claim reaches the admin. The admin can read the thread too:
 * it is dispute evidence. Text only, oldest first.
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
 * GET /api/orders/:id/messages?limit=  (party to the order, or admin)
 * Oldest first (chat order). Default 100, max 200.
 */
async function listMessages(req, res, next) {
  try {
    const found = await loadReadableOrder(req, res, req.params.id);
    if (!found) return;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const messages = await Message.find({ orderId: found.order._id })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
    res.json({ messages: toClient(messages), count: messages.length });
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
