const router = require('express').Router();
const {
  openDispute,
  listMyDisputes,
  getDispute,
  getDisputeByOrder,
} = require('../controllers/dispute.controller');
const { protect } = require('../middleware/auth');

// Batch 05 — dispute claims. The admin side (list + decide) lives in
// admin.routes.js under protectAdmin.
router.post('/', protect, openDispute);
router.get('/', protect, listMyDisputes);
// Batch 06 — keep the specific /order/:orderId route before /:id so the
// two-segment path is never mistaken for a dispute id.
router.get('/order/:orderId', protect, getDisputeByOrder);
router.get('/:id', protect, getDispute);

module.exports = router;
