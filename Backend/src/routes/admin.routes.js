const router = require('express').Router();
const { protectAdmin, requireRole } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');

// Every /api/admin/* route needs a signed-in session; each route then
// declares which roles may use it.
//
// REVISED (Batch 02, 2026-11-09) — Noushad ka faisla: sub-admin ko FULL
// access hai, jo kuch main admin kar sakta hai wohi sub-admin bhi kar
// sakta hai, kyunke wo akele sab kuch handle nahi kar sakta — isi liye
// sub-admin banaya hai. Is liye suspend/activate/reject/delete, products,
// orders, stats aur audit log — sab sub-admin ke liye bhi khule hain.
// SIRF 2 cheezein main-admin-only rehti hain: (1) sub-admin accounts
// banana/hatana, (2) admin accounts ko chherna (wo controller me
// ADMIN_IMMUTABLE se pehle se blocked hai). Agar sub-admin account
// management bhi sub-admin ko dena ho to neeche subadmins wali 3 routes
// me 'subadmin' add karna hoga — pehle Noushad se poochna.
// They CANNOT touch products/orders, read the audit log, see dashboard
// stats, or manage sub-admin accounts — those stay main-admin-only.
// They also cannot act on admin/subadmin accounts (user page hides those).
// Admin APIs accept ONLY the host-only asan_admin_token cookie (see
// protectAdmin) — a regular asan_token can never open these routes.
router.use(protectAdmin);

router.get('/stats', requireRole('admin', 'subadmin'), admin.getStats);

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

router.get('/products', requireRole('admin', 'subadmin'), admin.listProducts);
router.delete('/products/:id', requireRole('admin', 'subadmin'), admin.deleteProduct);

router.get('/orders', requireRole('admin', 'subadmin'), admin.listOrders);
router.get('/audit-log', requireRole('admin', 'subadmin'), admin.listAuditLog);

router.get('/contacts', requireRole('admin', 'subadmin'), admin.listContacts);
router.delete('/contacts/:id', requireRole('admin', 'subadmin'), admin.deleteContact);
router.post('/contacts/:id/reply', requireRole('admin', 'subadmin'), admin.replyContact);

module.exports = router;
