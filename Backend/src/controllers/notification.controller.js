const Notification = require('../models/Notification');
const { toClient } = require('../utils/serialize');

/**
 * GET /api/notifications?limit=&page=  (protected)
 * Newest first + unread count for the bell badge.
 */
async function listNotifications(req, res, next) {
  try {
    const total = await Notification.countDocuments({ userId: req.user._id });
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .lean();
    res.json({
      notifications: toClient(notifications),
      count: notifications.length,
      total,
      unreadCount,
      page: safePage,
      limit,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/:id/read  (protected — own notification only)
 */
async function markRead(req, res, next) {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!notification) {
      return res.status(404).json({
        error: { code: 'NOTIFICATION_NOT_FOUND', message: 'No notification matches that id.' },
      });
    }
    notification.read = true;
    await notification.save();
    res.json({ notification: toClient(notification.toObject()) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/read-all  (protected)
 * Marks every unread notification of the signed-in user as read.
 */
async function markAllRead(req, res, next) {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.json({ updated: result.modifiedCount || 0 });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, markRead, markAllRead };
