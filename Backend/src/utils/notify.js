const Notification = require('../models/Notification');
const User = require('../models/User');

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
 */
async function notifyUser(userId, { type, title, message = '', link = '', orderId = null }) {
  try {
    if (!userId) return null;
    return await Notification.create({
      userId,
      type,
      title,
      message,
      link,
      orderId: orderId || undefined,
    });
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
      // eslint-disable-next-line no-await-in-loop
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
    // eslint-disable-next-line no-await-in-loop
    await notifyUser(userId, { type, title, message, link, orderId: order._id });
  }
}

module.exports = { notifyUser, notifyAdmins, notifyOrderParties };
