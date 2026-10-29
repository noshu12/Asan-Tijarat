const router = require('express').Router();
const { register, login, me, logout, updateMe, changePassword, checkAvailability, sendOtp, verifyOtp, forgotPassword, resetPassword, setupTwoFactor, verifyTwoFactorSetup, disableTwoFactor, verifyTwoFactorLogin } = require('../controllers/auth.controller');
const { protect, requireRole } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/check-availability', checkAvailability);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
// Admin 2FA (TOTP authenticator app) — setup / verify-setup / disable need a
// signed-in admin; the final login step is public and gated by the
// short-lived tempToken that login() issued with requires2FA:true.
// All four live under /api/auth, so the authLimiter in server.js covers them.
router.post('/2fa/setup', protect, requireRole('admin'), setupTwoFactor);
router.post('/2fa/verify-setup', protect, requireRole('admin'), verifyTwoFactorSetup);
router.post('/2fa/disable', protect, requireRole('admin'), disableTwoFactor);
router.post('/2fa/login', verifyTwoFactorLogin);
router.post('/logout', protect, logout);
router.get('/me', protect, me);
// Self-service profile + password management (settings pages).
router.patch('/me', protect, updateMe);
router.patch('/me/password', protect, changePassword);

module.exports = router;
