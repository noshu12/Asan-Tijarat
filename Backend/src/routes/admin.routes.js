const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');

// Every /api/admin/* route needs a signed-in session; each route then
// declares which roles may use it.
//
// Sub-admins get the FULL user-management + messages surface:
// list users, decrypt identity numbers, view KYC documents,
// verify/unverify/suspend/activate/reject/delete users,
// and list/read/reply/delete contact messages.
// They CANNOT touch products/orders, read the audit log, see dashboard
// stats, or manage sub-admin accounts — those stay main-admin-only.
// They also cannot act on admin/subadmin accounts (user page hides those).
router.use(protect);

router.get('/stats', requireRole('admin'), admin.getStats);

router.get('/users', requireRole('admin', 'subadmin'), admin.listUsers);
router.get('/users/:id/identity', requireRole('admin', 'subadmin'), admin.getDecryptedIdentity);
router.get('/users/:id/kyc/:field', requireRole('admin', 'subadmin'), admin.getKycDocument);
router.patch('/users/:id/verify', requireRole('admin', 'subadmin'), admin.verifyUser);
router.patch('/users/:id/suspend', requireRole('admin', 'subadmin'), admin.suspendUser);
router.patch('/users/:id/activate', requireRole('admin', 'subadmin'), admin.activateUser);
router.patch('/users/:id/reject', requireRole('admin', 'subadmin'), admin.rejectUser);
router.delete('/users/:id', requireRole('admin', 'subadmin'), admin.deleteUser);

// Sub-admin account management — main admin only.
router.get('/subadmins', requireRole('admin'), admin.listSubadmins);
router.post('/subadmins', requireRole('admin'), admin.createSubadmin);
router.delete('/subadmins/:id', requireRole('admin'), admin.deleteSubadmin);

router.get('/products', requireRole('admin'), admin.listProducts);
router.delete('/products/:id', requireRole('admin'), admin.deleteProduct);

router.get('/orders', requireRole('admin'), admin.listOrders);
router.get('/audit-log', requireRole('admin'), admin.listAuditLog);

router.get('/contacts', requireRole('admin', 'subadmin'), admin.listContacts);
router.delete('/contacts/:id', requireRole('admin', 'subadmin'), admin.deleteContact);
router.post('/contacts/:id/reply', requireRole('admin', 'subadmin'), admin.replyContact);

module.exports = router;
