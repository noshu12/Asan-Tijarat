const router = require('express').Router();
const {
  createRating,
  getOrderRating,
  getSupplierRating,
} = require('../controllers/rating.controller');
const { protect, requireRole } = require('../middleware/auth');

// Batch 05 — ratings. One rating per delivered order, by its shopkeeper;
// the supplier can never edit or delete it (no such endpoint exists).
router.post('/', protect, requireRole('shopkeeper'), createRating);
router.get('/order/:orderId', protect, getOrderRating);
router.get('/supplier/:supplierId', protect, getSupplierRating);

module.exports = router;
