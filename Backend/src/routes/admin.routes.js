const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');

// Every /api/admin/* route requires a valid admin JWT.
router.use(protect, requireRole('admin'));

router.get('/stats', admin.getStats);

router.get('/users', admin.listUsers);
router.get('/users/:id/kyc/:field', admin.getKycDocument);
router.patch('/users/:id/verify', admin.verifyUser);
router.patch('/users/:id/role', admin.updateUserRole);
router.delete('/users/:id', admin.deleteUser);

router.get('/products', admin.listProducts);
router.patch('/products/:id/status', admin.updateProductStatus);
router.delete('/products/:id', admin.deleteProduct);

router.get('/orders', admin.listOrders);
router.patch('/orders/:id/status', admin.updateOrderStatus);

module.exports = router;