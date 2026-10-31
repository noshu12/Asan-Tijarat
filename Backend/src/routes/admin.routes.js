const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');

// Every /api/admin/* route needs a signed-in session; each route then
// declares which roles may use it.
//
// Sub-admins (KYC reviewers) get ONLY the user-verification surface:
// list users, decrypt identity numbers, view KYC documents, verify/unverify.
// They CANNOT suspend/reject/delete users, touch products/orders, read the
// audit log, or manage contacts — those stay main-admin-only.
router.use(protect);

router.get('/stats', requireRole('admin'), admin.getStats);

router.get('/users', requireRole('admin', 'subadmin'), admin.listUsers);
router.get('/users/:id/identity', requireRole('admin', 'subadmin'), admin.getDecryptedIdentity);
router.get('/users/:id/kyc/:field', requireRole('admin', 'subadmin'), admin.getKycDocument);
router.patch('/users/:id/verify', requireRole('admin', 'subadmin'), admin.verifyUser);
router.patch('/users/:id/suspend', requireRole('admin'), admin.suspendUser);
router.patch('/users/:id/activate', requireRole('admin'), admin.activateUser);
router.patch('/users/:id/reject', requireRole('admin'), admin.rejectUser);
router.delete('/users/:id', requireRole('admin'), admin.deleteUser);

// Sub-admin account management — main admin only.
router.get('/subadmins', requireRole('admin'), admin.listSubadmins);
router.post('/subadmins', requireRole('admin'), admin.createSubadmin);
router.delete('/subadmins/:id', requireRole('admin'), admin.deleteSubadmin);

router.get('/products', requireRole('admin'), admin.listProducts);
router.delete('/products/:id', requireRole('admin'), admin.deleteProduct);

router.get('/orders', requireRole('admin'), admin.listOrders);
router.get('/audit-log', requireRole('admin'), admin.listAuditLog);

router.get('/contacts', requireRole('admin'), admin.listContacts);
router.delete('/contacts/:id', requireRole('admin'), admin.deleteContact);
router.post('/contacts/:id/reply', requireRole('admin'), admin.replyContact);

module.exports = router;
