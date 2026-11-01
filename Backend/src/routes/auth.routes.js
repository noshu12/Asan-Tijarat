const router = require('express').Router();
const { register, login, adminLogin, adminVerifyTwoFactorLogin, me, logout, updateMe, changePassword, checkAvailability, sendOtp, verifyOtp, forgotPassword, resetPassword, setupTwoFactor, verifyTwoFactorSetup, disableTwoFactor, verifyTwoFactorLogin, setupTwoFactorFirst, verifyTwoFactorSetupFirst } = require('../controllers/auth.controller');
const { protect, requireRole } = require('../middleware/auth');
const { requireTurnstile } = require('../utils/turnstile');

router.post('/register', requireTurnstile, register);
router.post('/login', requireTurnstile, login);
router.post('/check-availability', checkAvailability);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/forgot-password', requireTurnstile, forgotPassword);
router.post('/reset-password', resetPassword);
// Admin 2FA (TOTP authenticator app) — setup / verify-setup / disable need a
// signed-in admin; the final login step is public and gated by the
// short-lived tempToken that login() issued with requires2FA:true.
// All four live under /api/auth, so the authLimiter in server.js covers them.
router.post('/2fa/setup', protect, requireRole('admin'), setupTwoFactor);
router.post('/2fa/verify-setup', protect, requireRole('admin'), verifyTwoFactorSetup);
router.post('/2fa/disable', protect, requireRole('admin'), disableTwoFactor);
router.post('/2fa/login', verifyTwoFactorLogin);
// Dedicated ADMIN login (admin subdomain) — issues the host-only
// asan_admin_token cookie. Turnstile-protected like the regular login.
// The regular /login above now rejects admin/subadmin roles.
router.post('/admin/login', requireTurnstile, adminLogin);
router.post('/admin/2fa/login', adminVerifyTwoFactorLogin);
// Sub-admin FIRST-TIME 2FA setup — public, gated by the short-lived setup
// tempToken login() issued with requires2FASetup:true (the sub-admin has no
// session yet, so protect() cannot be used here).
router.post('/2fa/setup-first', setupTwoFactorFirst);
router.post('/2fa/verify-setup-first', verifyTwoFactorSetupFirst);
router.post('/logout', protect, logout);
router.get('/me', protect, me);
// Self-service profile + password management (settings pages).
router.patch('/me', protect, updateMe);
router.patch('/me/password', protect, changePassword);

module.exports = router;
