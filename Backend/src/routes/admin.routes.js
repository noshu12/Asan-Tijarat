const router = require('express').Router();
const { protectAdmin, requireRole } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');
// Batch 05 — dispute decisions + payment confirmation (admin side).
const { listDisputesAdmin, decideDispute } = require('../controllers/dispute.controller');
const { confirmPayment } = require('../controllers/payment.controller');

// Every /api/admin/* route needs a signed-in session; each route then
// declares which roles may use it.
//
// REVISED (Batch 17, 2026-11-22 — Round-5 audit H1, Noushad's decision):
// sub-admin scope now MATCHES the AdminGate
// (Frontend/app/admin/AdminClient.tsx) — users, messages, orders and
// disputes (+ refunds, which are dispute decisions) stay open to
// sub-admins. These are MAIN-ADMIN-ONLY: dashboard stats, product
// list/delete, contacts (list/delete/reply-as-platform) and
// DELETE /users/:id. This supersedes the Batch 02 (2026-11-09) "FULL
// access" decision for those routes: the UI gate already blocked them,
// but the backend accepted a sub-admin token on all of them, so a direct
// API call could delete products and reply to
// contacts as the platform. Sub-admin account management stays
// admin-only (as before), and admin accounts stay immutable in the
// controller (ADMIN_IMMUTABLE). If any locked route should open to
// sub-admins later, add 'subadmin' here AND in the AdminGate together —
// never one without the other.
// Admin APIs accept ONLY the host-only asan_admin_token cookie (see
// protectAdmin) — a regular asan_token can never open these routes.
router.use(protectAdmin);

// Batch 17 (H1) — main-admin-only: dashboard stats.
router.get('/stats', requireRole('admin'), admin.getStats);

router.get('/users', requireRole('admin', 'subadmin'), admin.listUsers);
router.get('/users/:id/identity', requireRole('admin', 'subadmin'), admin.getDecryptedIdentity);
router.get('/users/:id/kyc/:field', requireRole('admin', 'subadmin'), admin.getKycDocument);
router.patch('/users/:id/verify', requireRole('admin', 'subadmin'), admin.verifyUser);
router.patch('/users/:id/suspend', requireRole('admin', 'subadmin'), admin.suspendUser);
router.patch('/users/:id/activate', requireRole('admin', 'subadmin'), admin.activateUser);
router.patch('/users/:id/reject', requireRole('admin', 'subadmin'), admin.rejectUser);
// Batch 17 (H1) — deleting a user (listings + KYC files included) is
// main-admin-only; suspend/reject above stay open to sub-admins.
router.delete('/users/:id', requireRole('admin'), admin.deleteUser);

// Sub-admin account management — main admin only.
router.get('/subadmins', requireRole('admin'), admin.listSubadmins);
router.post('/subadmins', requireRole('admin'), admin.createSubadmin);
router.delete('/subadmins/:id', requireRole('admin'), admin.deleteSubadmin);

// Batch 17 (H1) — product list/delete are main-admin-only.
router.get('/products', requireRole('admin'), admin.listProducts);
router.delete('/products/:id', requireRole('admin'), admin.deleteProduct);

router.get('/orders', requireRole('admin', 'subadmin'), admin.listOrders);

// Batch 05 — dispute queue + decisions, and confirming a submitted
// payment (money into escrow, or paid at delivery). Sub-admins have
// access here per Batch 15 (disputes AND refunds are admin-or-sub-admin
// work). NOTE — the Confirm Payment button/logic is PAUSED for removal
// (Noushad, 2026-11-22): leave this route exactly as it is.
router.get('/disputes', requireRole('admin', 'subadmin'), listDisputesAdmin);
router.post('/disputes/:id/decide', requireRole('admin', 'subadmin'), decideDispute);
router.post('/orders/:id/confirm-payment', requireRole('admin', 'subadmin'), confirmPayment);

// Batch 18 (L10) — admin cancel for stuck orders (escrow held, supplier
// unresponsive). Same settlement as the buyer cancel, same roles as the
// dispute decisions above (admin or sub-admin). This is NOT the Confirm
// Payment removal — that stays paused.
router.post('/orders/:id/cancel', requireRole('admin', 'subadmin'), admin.cancelOrder);

// Batch 17 (H1) — contacts (list/delete/reply-as-platform) are
// main-admin-only.
router.get('/contacts', requireRole('admin'), admin.listContacts);
router.delete('/contacts/:id', requireRole('admin'), admin.deleteContact);
router.post('/contacts/:id/reply', requireRole('admin'), admin.replyContact);

module.exports = router;
