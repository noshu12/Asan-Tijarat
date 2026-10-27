const router = require('express').Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/product.controller');
const { protect, requireRole } = require('../middleware/auth');

// Public catalogue
router.get('/', getProducts);
router.get('/:id', getProduct);

// Supplier-managed listings (owner-guarded in the controller)
router.post('/', protect, requireRole('supplier'), createProduct);
router.patch('/:id', protect, requireRole('supplier'), updateProduct);
router.delete('/:id', protect, requireRole('supplier'), deleteProduct);

module.exports = router;