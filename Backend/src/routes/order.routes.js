const router = require('express').Router();
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
} = require('../controllers/order.controller');
const { protect, requireRole } = require('../middleware/auth');

router.post('/', protect, requireRole('shopkeeper'), createOrder);
router.get('/', protect, getOrders);
router.get('/:id', protect, getOrder);
router.patch('/:id/status', protect, updateOrderStatus);

module.exports = router;