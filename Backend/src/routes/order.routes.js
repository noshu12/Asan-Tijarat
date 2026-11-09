const router = require('express').Router();
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
} = require('../controllers/order.controller');
const {
  submitPaymentReference,
  confirmDeliveryReceipt,
  uploadDeliveryProof,
} = require('../controllers/payment.controller');
const { listMessages, sendMessage } = require('../controllers/message.controller');
const { protect, requireRole } = require('../middleware/auth');

router.post('/', protect, requireRole('shopkeeper'), createOrder);
router.get('/', protect, getOrders);
router.get('/:id', protect, getOrder);
router.patch('/:id/status', protect, updateOrderStatus);

// Batch 05 — payment (records + status only, no gateway integration).
router.post('/:id/payment-reference', protect, requireRole('shopkeeper'), submitPaymentReference);
router.post('/:id/confirm-delivery', protect, requireRole('shopkeeper'), confirmDeliveryReceipt);
router.post('/:id/delivery-proof', protect, requireRole('supplier'), uploadDeliveryProof);

// Batch 05 — per-order chat (buyer + supplier; admin reads it as evidence).
router.get('/:id/messages', protect, listMessages);
router.post('/:id/messages', protect, sendMessage);

module.exports = router;
