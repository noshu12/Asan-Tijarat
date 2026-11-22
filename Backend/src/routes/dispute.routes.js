const router = require('express').Router();
const {
  openDispute,
  getDispute,
  getDisputeByOrder,
} = require('../controllers/dispute.controller');
const { protect } = require('../middleware/auth');

// Batch 05 — dispute claims. The admin side (list + decide) lives in
// admin.routes.js under protectAdmin.
// Batch 22 (Round-5 audit h-M5) — GET /api/disputes (the per-user
// "my disputes" list) is gone: no page ever called it; dispute
// visibility is the per-order endpoint below + the admin queue.
router.post('/', protect, openDispute);
// Batch 06 — keep the specific /order/:orderId route before /:id so the
// two-segment path is never mistaken for a dispute id.
router.get('/order/:orderId', protect, getDisputeByOrder);
router.get('/:id', protect, getDispute);

module.exports = router;
