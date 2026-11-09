const router = require('express').Router();
const {
  openDispute,
  listMyDisputes,
  getDispute,
} = require('../controllers/dispute.controller');
const { protect } = require('../middleware/auth');

// Batch 05 — dispute claims. The admin side (list + decide) lives in
// admin.routes.js under protectAdmin.
router.post('/', protect, openDispute);
router.get('/', protect, listMyDisputes);
router.get('/:id', protect, getDispute);

module.exports = router;
