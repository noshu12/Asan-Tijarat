const router = require('express').Router();
const {
  getProducts,
  getProductCities,
  getProduct,
  getProductMarketSale,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/product.controller');
const { protect, requireRole } = require('../middleware/auth');

// Public catalogue
router.get('/', getProducts);
// /cities must sit before /:id — otherwise Express would read "cities" as an id.
router.get('/cities', getProductCities);
router.get('/:id/market-sale', getProductMarketSale);
router.get('/:id', getProduct);

// Supplier-managed listings (owner-guarded in the controller)
router.post('/', protect, requireRole('supplier'), createProduct);
router.patch('/:id', protect, requireRole('supplier'), updateProduct);
router.delete('/:id', protect, requireRole('supplier'), deleteProduct);

module.exports = router;
