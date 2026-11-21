const router = require('express').Router();
const { register, login, adminLogin, adminVerifyTwoFactorLogin, me, logout, updateMe, changePassword, checkAvailability, sendOtp, verifyOtp, forgotPassword, resetPassword, setupTwoFactor, verifyTwoFactorSetup, disableTwoFactor, verifyTwoFactorLogin, setupTwoFactorFirst, verifyTwoFactorSetupFirst } = require('../controllers/auth.controller');
const { protect, optionalProtect, requireRole } = require('../middleware/auth');
const { requireTurnstile } = require('../utils/turnstile');
const rateLimit = require('express-rate-limit');

// FIX (New audit #10) — OTP/email endpoints par per-IP cap nahi tha.
// /send-otp aur /forgot-password pe sirf global limiter (300/15 min) aur
// auth limiter (50/15 min) lagte thay; send-otp pe per-user 60-sec gap hai
// magar koi per-IP cap nahi — attacker 50 alag emails pe OTP trigger kar
// ke Brevo quota jala sakta tha aur users ko spam kar sakta tha.
// Is liye OTP bhejnewale dono routes pe dedicated limiter: 5 requests
// per 15 min per IP. Limiter Turnstile se PEHLE chalta hai — flood ko
// sab se saste point pe roko, Turnstile verify karne se pehle.
// verify-otp / reset-password / check-availability is limiter se bahar
// hain (report ne sirf send-otp aur forgot-password manga hai).
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many OTP requests. Please try again in a few minutes.' } },
});

router.post('/register', requireTurnstile, register);
router.post('/login', requireTurnstile, login);
router.post('/check-availability', checkAvailability);
router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/forgot-password', otpLimiter, requireTurnstile, forgotPassword);
router.post('/reset-password', resetPassword);
// 2FA (TOTP authenticator app) — setup / verify-setup / disable need a
// signed-in admin, supplier or shopkeeper; the final login step is public
// and gated by the short-lived tempToken that login() issued with
// requires2FA:true. FIX (New audit #15) — suppliers and shopkeepers use
// these same three endpoints (optional 2FA from their portal settings).
// Sub-admins do NOT use them — their mandatory first-time setup is
// /2fa/setup-first + /2fa/verify-setup-first below.
// All four live under /api/auth, so the authLimiter in server.js covers them.
router.post('/2fa/setup', protect, requireRole('admin', 'shopkeeper', 'supplier'), setupTwoFactor);
router.post('/2fa/verify-setup', protect, requireRole('admin', 'shopkeeper', 'supplier'), verifyTwoFactorSetup);
router.post('/2fa/disable', protect, requireRole('admin', 'shopkeeper', 'supplier'), disableTwoFactor);
router.post('/2fa/login', verifyTwoFactorLogin);
// Dedicated ADMIN login (admin subdomain) — issues the host-only
// asan_admin_token cookie. Turnstile-protected like the regular login.
// The regular /login above now rejects admin/subadmin roles.
router.post('/admin/login', requireTurnstile, adminLogin);
router.post('/admin/2fa/login', adminVerifyTwoFactorLogin);
// ADMIN + SUB-ADMIN FIRST-TIME 2FA setup — public, gated by the short-lived
// setup tempToken adminLogin() issued with requires2FASetup:true (the account
// has no session yet, so protect() cannot be used here). FIX (New audit #5)
// — the main admin uses this same flow: 2FA is mandatory for the main admin
// too, so a first sign-in without it routes here exactly like a sub-admin's.
router.post('/2fa/setup-first', setupTwoFactorFirst);
router.post('/2fa/verify-setup-first', verifyTwoFactorSetupFirst);
router.post('/logout', protect, logout);
// Session check — optionalProtect, NOT protect: guests (no/invalid/
// expired token) get 200 { user: null } instead of a 401, so public
// pages don't log a red console error on every load (M7, Round-4 audit).
// PATCH /me and /me/password below still use protect() and still 401.
router.get('/me', optionalProtect, me);
// Self-service profile + password management (settings pages).
router.patch('/me', protect, updateMe);
router.patch('/me/password', protect, changePassword);

module.exports = router;
