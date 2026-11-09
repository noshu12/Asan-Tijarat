const router = require('express').Router();
const {
  listNotifications,
  markRead,
  markAllRead,
} = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth');

// Batch 05 — real in-app notifications (the bell in PortalHeader).
router.get('/', protect, listNotifications);
router.post('/read-all', protect, markAllRead);
router.patch('/:id/read', protect, markRead);

module.exports = router;
