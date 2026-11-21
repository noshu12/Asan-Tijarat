const Notification = require('../models/Notification');
const User = require('../models/User');
const sseHub = require('./sseHub');

/**
 * Notification writer (Batch 05).
 *
 * Every helper here NEVER throws: a failed notification must never break
 * the order/payment/dispute action that triggered it. Failures are logged
 * and swallowed, exactly like the audit-log helper in admin.controller.js.
 */

/**
 * Writes one notification row for one user.
 * @returns the created notification, or null when it could not be written.
 *
 * Batch 13 — after the row is stored, the same notification is pushed to
 * the user's live SSE stream (if they have one open). The push lives
 * inside this SAME try/catch, and broadcast() itself never throws, so a
 * push failure can never fail the order/payment/dispute action that
 * triggered the notification. Nobody connected = silent no-op; the row
 * is still written and the bell still shows it on next load.
 *
 * The SSE event name IS the notification type (order_placed,
 * payment_submitted, chat_message, ... — the enum in
 * models/Notification.js), so the frontend needs no event-name mapping.
 */
async function notifyUser(userId, { type, title, message = '', link = '', orderId = null }) {
  try {
    if (!userId) return null;
    const created = await Notification.create({
      userId,
      type,
      title,
      message,
      link,
      orderId: orderId || undefined,
    });
    sseHub.broadcast(String(userId), {
      id: String(created._id),
      type: created.type,
      title: created.title,
      message: created.message,
      link: created.link,
      orderId: created.orderId ? String(created.orderId) : null,
      // timestamps: true on the model, so createdAt always exists; the
      // fallback only covers a hand-built doc without timestamps.
      createdAt: created.createdAt ? created.createdAt.toISOString() : new Date().toISOString(),
    });
    return created;
  } catch (err) {
    console.log('[notify] failed:', err.message);
    return null;
  }
}

/** Writes the same notification to every admin + sub-admin account. */
async function notifyAdmins({ type, title, message = '', link = '', orderId = null }) {
  try {
    const admins = await User.find(
      { role: { $in: ['admin', 'subadmin'] } },
      { _id: 1 }
    ).lean();
    for (const admin of admins) {
      await notifyUser(admin._id, { type, title, message, link, orderId });
    }
  } catch (err) {
    console.log('[notify] failed:', err.message);
  }
}

/**
 * Notifies the buyer and the supplier of one order (skips `excludeUserId`,
 * usually the actor, so people are not notified about their own action).
 * Each party gets the link to THEIR OWN portal's order page — the
 * shopkeeper opens /shopkeeper/orders/:id, the supplier /supplier/orders/:id.
 */
async function notifyOrderParties(order, { type, title, message = '', excludeUserId = null }) {
  if (!order) return;
  const targets = [
    { userId: order.buyerId, link: `/shopkeeper/orders/${order._id}` },
    { userId: order.supplierId, link: `/supplier/orders/${order._id}` },
  ];
  for (const { userId, link } of targets) {
    if (!userId) continue;
    if (excludeUserId && String(userId) === String(excludeUserId)) continue;
    await notifyUser(userId, { type, title, message, link, orderId: order._id });
  }
}

module.exports = { notifyUser, notifyAdmins, notifyOrderParties };
