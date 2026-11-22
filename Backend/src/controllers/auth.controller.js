const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { CATEGORIES } = require('../constants/categories');
const { saveKycDocuments, deleteStoredFiles, deleteStoredUploads, KycUploadError } = require('../utils/kycStorage');
const { sanitizeLocation } = require('../utils/location');
const { sendEmail, isEmailConfigured } = require('../utils/sendEmail');
const { otpEmail, pendingVerificationEmail, resetPasswordEmail } = require('../utils/emailTemplates');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { jwtExpiryToMs } = require('../utils/jwt');
const { isTotpLocked, totpLockMinutesLeft, recordTotpFailure, resetTotpAttempts } = require('../utils/totpLock');
const { isSafeAvatar } = require('../utils/avatar');
const { rotateCsrfToken } = require('../middleware/csrf');
const { notifyAdmins } = require('../utils/notify');

/**
 * Shown to a self-registered shopkeeper/supplier while their KYC details are
 * waiting for admin approval. Kept in sync with the /getstarted confirmation
 * screen and the /signin pending-verification notice.
 */
const PENDING_VERIFICATION_MESSAGE =
  'Your account will be verified within 24 hours. Once your account has been verified, you can sign in using your registered credentials.';

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * Sets the asan_token httpOnly cookie — the exact same session login()
 * creates. Shared by login() and verifyTwoFactorLogin() so both sign-in
 * paths end with an identical session.
 */
function issueAuthCookie(res, user) {
  const token = signToken(user);
  // Batch 17 (M4) — maxAge is derived from JWT_EXPIRES_IN (via
  // jwtExpiryToMs), the same value signToken() signs with. The old
  // hardcoded 7 days drifted from the token whenever the env var changed.
  const maxAge = jwtExpiryToMs();
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('asan_token', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProduction,
    maxAge,
  });
}

/**
 * Issues the ADMIN session cookie (asan_admin_token).
 *
 * Host-only by design: NO `Domain` attribute is set, so the browser binds
 * the cookie to the exact host that served the login response. The admin
 * frontend calls the backend through same-origin /backend-api/* (Next.js
 * rewrites), so on production the cookie is host-only for
 * admin.asantijarat.com — it is never sent to the main site, and a regular
 * asan_token can never open /api/admin/* (see protectAdmin).
 */
function issueAdminAuthCookie(res, user) {
  const token = signToken(user);
  // Batch 17 (M4) — same JWT_EXPIRES_IN-derived maxAge as issueAuthCookie.
  const maxAge = jwtExpiryToMs();
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('asan_admin_token', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProduction,
    maxAge,
    // NOTE: no `domain` here — that is what makes it host-only.
  });
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * POST /api/auth/register
 * Body: { name, email, phone, password, role, businessName, city,
 *         category?, categories?, cnic?, avatar?,
 *         houseAddress?, currentHouseLocation?, currentLocation?,
 *         documents?: { cnicFront?, cnicBack?, ntn?, utilityBill? },
 *         // supplier only:
 *         ntn,
 *         // shopkeeper only:
 *         shopType, shopLocation, utilityBillAccountNumber }
 *
 * `documents` carries Step-3 KYC uploads (base64 data URLs):
 * supplier → CNIC front, CNIC back and the NTN certificate;
 * shopkeeper → CNIC front, CNIC back and the shop utility bill.
 * Each one is written to uploads/kyc and stored on the account as
 * `documents:<field> = { url, originalName, mimeType, size, uploadedAt }`, so
 * the Admin Dashboard previews the exact images the trader uploaded.
 *
 * Creates a PENDING account — `verified` is forced to false and NO JWT is
 * issued, so registration never signs the trader in. The submitted details go
 * straight to the Admin Dashboard; an admin must approve the account
 * (PATCH /api/admin/users/:id/verify) before login succeeds.
 * businessName and city are mandatory for both roles; ntn + at least one
 * category are mandatory for suppliers; shopType + utilityBillAccountNumber
 * are mandatory for shopkeepers (who have NO ntn and NO categories).
 */
async function register(req, res, next) {
  try {
    const { name, email, phone, password, role, businessName, city, ntn, cnic, category, categories, avatar, documents, houseAddress, currentHouseLocation, currentLocation, shopType, shopLocation, utilityBillAccountNumber } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'name, email, phone, password and role are required.' },
      });
    }
    // FIX (Batch 02) — register pe password/email validation (pehle nahi thi:
    // 1-character password se bhi register ho jata tha, aur galat email bhi).
    // Yehi rule reset/change pe pehle se tha (>= 8 chars) — ab register pe bhi.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({
        error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address.' },
      });
    }
    if (String(password).length < 8) {
      return res.status(400).json({
        error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' },
      });
    }
    // Batch 17 (L1) — JSON body values can be objects when a caller sends
    // operator shapes (`phone: { $ne: '' }`); String-coerce email/phone
    // before anything uses them, so an object can never reach a Mongoose
    // filter or crash .toLowerCase().
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanPhone = String(phone).trim();
    // Batch 17 (L2) — avatar allow-list: http(s), relative path, or a real
    // image data URL (the settings photo upload). Anything else —
    // data:text/html, javascript:, blob: — is rejected, never stored.
    if (avatar !== undefined && !isSafeAvatar(avatar)) {
      return res.status(400).json({
        error: { code: 'INVALID_AVATAR', message: 'Avatar must be an http(s) URL, a relative path, or an image file.' },
      });
    }
    // Self-registration is limited to marketplace accounts; admins are
    // provisioned directly in the database by an existing admin.
    if (!['shopkeeper', 'supplier'].includes(role)) {
      return res.status(400).json({
        error: { code: 'INVALID_ROLE', message: 'role must be "shopkeeper" or "supplier".' },
      });
    }
    if (!businessName || !city) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'businessName and city are required.' },
      });
    }
    if (role === 'supplier') {
      // NTN is supplier-only since the 2026-10-29 form redesign.
      if (!ntn) {
        return res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'ntn is required for supplier accounts.' },
        });
      }
    } else {
      // Shopkeeper — no NTN, no categories; shop type + utility bill instead.
      if (!shopType) {
        return res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'shopType is required for shopkeeper accounts.' },
        });
      }
      if (!utilityBillAccountNumber || !String(utilityBillAccountNumber).trim()) {
        return res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'utilityBillAccountNumber is required for shopkeeper accounts.' },
        });
      }
    }
    if (cnic && !/^\d{13}$/.test(String(cnic).trim())) {
      return res.status(400).json({
        error: { code: 'INVALID_CNIC', message: 'CNIC must be exactly 13 digits.' },
      });
    }
    // Categories: multi-select list from the 14 master categories — supplier
    // only. A single legacy `category` string is accepted and converted to a
    // list. Anything a shopkeeper client sends here is dropped: shopkeepers
    // NEVER carry categories.
    let categoriesList = [];
    if (role === 'supplier') {
      if (Array.isArray(categories)) categoriesList = categories;
      else if (category) categoriesList = [category];
      if (categoriesList.length === 0) {
        return res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'Select at least one business category.' },
        });
      }
      if (!categoriesList.every((c) => CATEGORIES.includes(c))) {
        return res.status(400).json({
          error: { code: 'INVALID_CATEGORY', message: 'categories must be from the 14 master categories.' },
        });
      }
    }

    // GPS point the browser captured for this trader (optional) — validate it
    // BEFORE creating the account so bad coordinates never get stored.
    let currentLocationPoint;
    if (currentLocation !== undefined && currentLocation !== null) {
      currentLocationPoint = sanitizeLocation(currentLocation);
      if (!currentLocationPoint) {
        return res.status(400).json({
          error: {
            code: 'INVALID_LOCATION',
            message: 'currentLocation must be { lat: -90..90, lng: -180..180 }.',
          },
        });
      }
    }

    const existing = await User.findOne({ $or: [{ email: cleanEmail }, { phone: cleanPhone }] });
    if (existing) {
      return res.status(409).json({
        error: { code: 'EMAIL_EXISTS', message: 'An account with this email or phone already exists.' },
      });
    }

    // Validate + persist the uploaded KYC files BEFORE creating the
    // account: a rejected document never leaves a half-registered user behind.
    // Supplier → CNIC front/back + NTN; shopkeeper → CNIC front/back + utility bill.
    let stored;
    try {
      stored = await saveKycDocuments(documents);
    } catch (err) {
      if (err instanceof KycUploadError) {
        return res.status(400).json({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }

    let user;
    try {
      user = await User.create({
        name, email: cleanEmail, phone: cleanPhone, password, role,
        businessName, city, cnic,
        avatar,
        houseAddress,
        currentLocation: currentLocationPoint,
        documents: stored.documents,
        verified: false, // never trust a client-supplied `verified`
        status: 'pending',
        emailVerified: false,
        ...(role === 'supplier'
          ? {
              ntn,
              category: categoriesList[0] || undefined,
              categories: categoriesList,
              currentHouseLocation,
            }
          : {
              // Shopkeeper: no ntn, no categories, no currentHouseLocation —
              // anything the client sent for those is intentionally dropped.
              shopType,
              shopLocation,
              utilityBillAccountNumber: String(utilityBillAccountNumber).trim(),
            }),
      });
    } catch (err) {
      // Roll the written files back — nothing should point at a ghost account.
      await deleteStoredUploads(stored);
      throw err;
    }

    // Batch 23 (TEAMLY realtime audit RT-3 + RT-4) — AFTER User.create
    // succeeds, so a failed registration sends nothing. FIRE-AND-FORGET:
    // notifyAdmins never throws. Name + role ONLY — no email, phone,
    // CNIC, NTN, address, or document in the payload. The "KYC submit"
    // IS this register() (CORRECTION to RT-4: there is no kyc.controller
    // and no Kyc model — documents are stored on the User itself, see
    // `documents: stored.documents` in the User.create above), so a
    // registration WITH documents also sends kyc_submitted, linked by
    // the user id (`/admin/kyc/:id`). KYC approve/reject need nothing
    // here: admin verifyUser/rejectUser already send account_verified /
    // account_rejected.
    notifyAdmins({
      type: 'user_registered',
      title: `New ${user.role} registered`,
      message: `${user.name} registered as a ${user.role}.`,
      link: `/admin/users/${user._id}`,
    });
    if (stored.documents && Object.keys(stored.documents).length > 0) {
      notifyAdmins({
        type: 'kyc_submitted',
        title: 'New KYC submission',
        message: `${user.name} submitted KYC documents as a ${user.role}.`,
        link: `/admin/kyc/${user._id}`,
      });
    }

    // No token: the account is registered but NOT active until KYC approval.
    res.status(201).json({
      user: user.toSafeJSON(),
      verified: false,
      message: PENDING_VERIFICATION_MESSAGE,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/send-otp
 * Body: { email }
 * Sends a 6-digit OTP, hashed, 5-min expiry, 60-sec resend limit.
 * FIX (Batch 02): email fail ho to OTP KABHI log nahi hota — pehle
 * plaintext OTP server console (Render logs) me chhapta tha.
 * Returns a generic message whether or not the account exists.
 */
async function sendOtp(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'email is required.' },
      });
    }
    // Batch 12 — fail LOUD when email is not configured. Checked BEFORE
    // the user lookup, so the 503 is identical whether or not the account
    // exists (no account enumeration). Without this, the generic success
    // message below would promise an OTP that can never arrive.
    if (!isEmailConfigured()) {
      console.error('[auth] BREVO_API_KEY is NOT set — cannot send OTP email. Set BREVO_API_KEY in the backend environment.');
      return res.status(503).json({
        error: { code: 'EMAIL_NOT_CONFIGURED', message: 'Email service is not configured, so the OTP cannot be sent. Please try again later.' },
      });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+otpHash');
    if (user) {
      if (user.lastOtpSentAt && Date.now() - user.lastOtpSentAt.getTime() < 60 * 1000) {
        return res.status(429).json({
          error: { code: 'OTP_RESEND_TOO_SOON', message: 'Wait 60 seconds before requesting a new OTP.' },
        });
      }
      const otp = String(crypto.randomInt(100000, 1000000));
      user.otpHash = hashValue(otp);
      user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      user.otpAttempts = 0;
      user.lastOtpSentAt = new Date();
      await user.save();
      const emailContent = otpEmail({ name: user.name, otp });
      const emailSent = await sendEmail({
        to: user.email,
        ...emailContent,
      });
      if (!emailSent) {
        // FIX (Batch 02) — OTP kabhi log nahi karna, na dev me na prod me.
        // Sirf ye batate hain ke email nahi gayi (Brevo key check karo).
        console.warn(`[auth] OTP email NOT sent for ${user.email} — check BREVO_API_KEY. OTP is never logged.`);
      }
    }
    res.json({ message: 'If an account exists for this email, an OTP has been sent.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/verify-otp
 * Body: { email, otp }
 * Verifying OTP sets emailVerified ONLY — it does NOT activate the account.
 * Admin approval (verified) is still required before login succeeds.
 * 5 wrong attempts block further OTP verification until a new OTP is sent.
 * On success, the pending-verification email is sent (NTN/CNIC review
 * process) — email failure never blocks verification, it is only logged.
 */
async function verifyOtp(req, res, next) {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'email and otp are required.' },
      });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+otpHash');
    if (!user || !user.otpHash || !user.otpExpiresAt || user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        error: { code: 'OTP_EXPIRED', message: 'OTP is invalid or expired. Request a new one.' },
      });
    }
    if (user.otpAttempts >= 5) {
      return res.status(403).json({
        error: { code: 'OTP_BLOCKED', message: 'Too many wrong OTP attempts. Request a new OTP.' },
      });
    }
    if (hashValue(otp) !== user.otpHash) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(400).json({
        error: { code: 'INVALID_OTP', message: 'Incorrect OTP.' },
      });
    }
    user.emailVerified = true;
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    await user.save();
    // Pending-verification email — sent right after OTP success, never blocks verification.
    const pendingContent = pendingVerificationEmail({
      name: user.name,
      businessName: user.businessName,
      role: user.role,
    });
    const pendingSent = await sendEmail({ to: user.email, ...pendingContent });
    if (!pendingSent) {
      console.log(`[auth] Pending-verification email not sent (no SMTP configured or email failed) for ${user.email}`);
    }
    res.json({ emailVerified: true, message: 'Email verified. Admin approval is still required before sign-in.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { identifier (email OR phone), password }
 * 5 failed attempts → 15-min lock.
 * Suspended accounts are blocked here, before any token is issued — a
 * suspended-but-verified account must never be able to sign in.
 * Rejected accounts are blocked here too, with their rejection reason —
 * otherwise a rejected account would fall through to the pending message
 * and look like it was still under review.
 */
async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'identifier (email or password) and password are required.' },
      });
    }

    // Batch 17 (L1) — identifier can be an object from a crafted JSON
    // body (`identifier: { $ne: '' }`); coerce it so no operator shape
    // reaches the $or filter or crashes .toLowerCase().
    const cleanIdentifier = String(identifier).trim();

    const user = await User.findOne({
      $or: [{ email: cleanIdentifier.toLowerCase() }, { phone: cleanIdentifier }],
    }).select('+password');

    if (user && user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const mins = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(403).json({
        error: { code: 'ACCOUNT_LOCKED', message: `Too many failed attempts. Try again in ${mins} minute(s).` },
      });
    }

    if (!user || !(await user.matchPassword(password))) {
      if (user) {
        user.loginAttempts += 1;
        if (user.loginAttempts >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();
      }
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid identifier or password.' },
      });
    }

    // Suspended accounts stay locked out even if they were verified before
    // being suspended — this check runs before the pending check and before
    // any token is issued, for every role including admin.
    if (user.status === 'suspended') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: user.suspensionReason
            ? `Your account is suspended. Reason: ${user.suspensionReason}`
            : 'Your account is suspended. Please contact support.',
        },
      });
    }

    // Rejected accounts stay locked out too — a rejected registration must
    // never sign in. The reason is shown here because this is the account
    // owner signing in with the correct password, so it is their own
    // reason, not a leak to someone else.
    if (user.status === 'rejected') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_REJECTED',
          message: user.rejectionReason
            ? `Your registration was not approved. Reason: ${user.rejectionReason}`
            : 'Your registration was not approved. Please contact support.',
        },
      });
    }

    // Admins and sub-admins must use the dedicated admin portal login
    // (POST /api/auth/admin/login on the admin subdomain). The regular
    // login never issues them a session — this keeps the admin cookie
    // strictly separated from regular user sessions.
    if (user.role === 'admin' || user.role === 'subadmin') {
      return res.status(403).json({
        error: {
          code: 'USE_ADMIN_PORTAL',
          message: 'Admin accounts sign in via the admin portal only.',
        },
      });
    }

    // Self-registered accounts stay dormant until an admin approves their KYC
    // details — credentials alone are not enough to sign in.
    if (user.role !== 'admin' && !user.verified) {
      return res.status(403).json({
        error: { code: 'ACCOUNT_PENDING_VERIFICATION', message: PENDING_VERIFICATION_MESSAGE },
      });
    }

    // FIX (Batch 02) — yahan sub-admin 2FA setup ka block DEAD CODE tha:
    // upar USE_ADMIN_PORTAL return ke baad user.role kabhi admin/subadmin
    // nahi hota, is liye ye block kabhi chalta hi nahi tha. Sub-admin 2FA
    // setup sirf adminLogin() se hota hai (POST /api/auth/admin/login).
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // FIX (Batch 02) — yahan admin 2FA ka block bhi DEAD CODE tha (upar
    // USE_ADMIN_PORTAL return ki wajah se). Admin 2FA sirf adminLogin()
    // me hota hai, jo { requires2FA: true, tempToken } deta hai.
    // FIX (New audit #15) — 2FA is OPTIONAL for shopkeeper/supplier
    // accounts. If this account enabled it, the password alone is not
    // enough: return the same { requires2FA: true, tempToken } adminLogin()
    // returns, and POST /api/auth/2fa/login finishes the sign-in. Accounts
    // WITHOUT 2FA sail straight past this block — their login is unchanged.
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { id: user._id, purpose: '2fa' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ requires2FA: true, tempToken });
    }
    // Single-session: a fresh login kills the previous session on any other
    // device/browser. The bump sits here (not above) so a password-only
    // attempt never logs the real user out before the 2FA code is verified.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    issueAuthCookie(res, user);
    // Batch 17 (L7) — a fresh session gets a fresh CSRF token, so a
    // token leaked before this sign-in dies with the old session.
    rotateCsrfToken(res);

    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/admin/login  (public, admin subdomain only)
 * Dedicated sign-in for admin + subadmin accounts. Mirrors login() but:
 *  - rejects every non-admin role (suppliers/shopkeepers use /login),
 *  - issues the host-only `asan_admin_token` cookie instead of asan_token.
 * Turnstile-protected like the regular login (see auth.routes.js).
 * 2FA is mandatory for admin + subadmin: a first sign-in without 2FA
 * returns { requires2FASetup:true, tempToken } (first-time setup page);
 * with 2FA enabled it returns { requires2FA:true, tempToken } →
 * POST /api/auth/admin/2fa/login.
 */
async function adminLogin(req, res, next) {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'identifier (email or phone) and password are required.' },
      });
    }

    // Batch 17 (L1) — identifier can be an object from a crafted JSON
    // body (`identifier: { $ne: '' }`); coerce it so no operator shape
    // reaches the $or filter or crashes .toLowerCase().
    const cleanIdentifier = String(identifier).trim();

    const user = await User.findOne({
      $or: [{ email: cleanIdentifier.toLowerCase() }, { phone: cleanIdentifier }],
    }).select('+password');

    if (user && user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const mins = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(403).json({
        error: { code: 'ACCOUNT_LOCKED', message: `Too many failed attempts. Try again in ${mins} minute(s).` },
      });
    }

    if (!user || !(await user.matchPassword(password))) {
      if (user) {
        user.loginAttempts += 1;
        if (user.loginAttempts >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();
      }
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid identifier or password.' },
      });
    }

    // Only admin + subadmin may use this endpoint.
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return res.status(403).json({
        error: { code: 'NOT_AN_ADMIN_ACCOUNT', message: 'This sign-in is for admin accounts only.' },
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: user.suspensionReason
            ? `Your account is suspended. Reason: ${user.suspensionReason}`
            : 'Your account is suspended. Please contact support.',
        },
      });
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // FIX (New audit #5) — 2FA is MANDATORY for the main admin too, not just
    // the sub-admin. No domain is bought yet, so /admin/* stays on the main
    // host and the login itself must be hardened: a main admin signing in
    // without 2FA gets requires2FASetup (the same first-time setup flow as
    // the sub-admin) instead of a session. Once 2FA is enabled, the
    // requires2FA code step below applies.
    if ((user.role === 'admin' || user.role === 'subadmin') && !user.twoFactorEnabled) {
      const setupToken = jwt.sign(
        { id: user._id, purpose: '2fa-setup' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ requires2FASetup: true, tempToken: setupToken });
    }

    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { id: user._id, purpose: '2fa' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ requires2FA: true, tempToken });
    }

    // Single-session: a fresh login kills the previous session.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    issueAdminAuthCookie(res, user);
    // Batch 17 (L7) — a fresh session gets a fresh CSRF token.
    rotateCsrfToken(res);

    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/admin/2fa/login  (public — carries the tempToken)
 * Body: { tempToken, token } — tempToken is the 5-minute JWT adminLogin()
 * returned with requires2FA:true; token is the 6-digit authenticator code.
 * On success issues the host-only asan_admin_token cookie.
 */
async function adminVerifyTwoFactorLogin(req, res, next) {
  try {
    const { tempToken, token } = req.body || {};
    if (!tempToken || !token) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'tempToken and token are required.' },
      });
    }
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        error: { code: 'TWO_FACTOR_TOKEN_EXPIRED', message: 'The two-factor session expired. Please sign in again.' },
      });
    }
    if (!payload || payload.purpose !== '2fa' || !payload.id) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_TOKEN', message: 'Invalid two-factor session. Please sign in again.' },
      });
    }
    const user = await User.findById(payload.id).select('+twoFactorSecret');
    if (!user || (user.role !== 'admin' && user.role !== 'subadmin') || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_TOKEN', message: 'Invalid two-factor session. Please sign in again.' },
      });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: user.suspensionReason
            ? `Your account is suspended. Reason: ${user.suspensionReason}`
            : 'Your account is suspended. Please contact support.',
        },
      });
    }
    // Batch 17 (M2) — per-account TOTP brute-force limit (5 fails →
    // 15-min lock, the loginAttempts pattern). While locked, even the
    // right code from a fresh tempToken is refused.
    if (isTotpLocked(user)) {
      return res.status(403).json({
        error: { code: 'TWO_FACTOR_LOCKED', message: `Too many wrong codes. Try again in ${totpLockMinutesLeft(user)} minute(s).` },
      });
    }
    const ok = authenticator.check(String(token).trim(), user.twoFactorSecret);
    if (!ok) {
      const { locked } = recordTotpFailure(user);
      await user.save();
      if (locked) {
        return res.status(403).json({
          error: { code: 'TWO_FACTOR_LOCKED', message: 'Too many wrong codes. Sign in again in 15 minutes.' },
        });
      }
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_CODE', message: 'Incorrect code. Enter the current code from your authenticator app.' },
      });
    }
    resetTotpAttempts(user);
    // Single-session: this verified login kills any older session.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    issueAdminAuthCookie(res, user);
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout  (protected)
 * Clears the asan_token httpOnly cookie.
 */
async function logout(req, res, next) {
  try {
    // Batch 17 (M1) — logout used to only clear the cookies, so a stolen
    // token stayed valid until its 7-day expiry. Bumping tokenVersion
    // kills every token issued before this logout, server-side — the
    // same invalidation login / password-change / reset already use.
    // Batch 17 (L7) — the CSRF token rotates too, so a leaked
    // double-submit token dies with the session.
    if (req.user) {
      req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
      await req.user.save();
    }
    res.clearCookie('asan_token', {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    res.clearCookie('asan_admin_token', {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    rotateCsrfToken(res);
    res.json({ ok: true, message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/2fa/setup  (protected, admin + supplier + shopkeeper)
 * Generates a fresh TOTP secret, stores it as the PENDING secret and returns
 * the otpauth URL + a QR data URL for the authenticator app. 2FA is NOT
 * enabled until POST /api/auth/2fa/verify-setup confirms the first code —
 * so a wrongly scanned QR can never lock the account out.
 * FIX (New audit #15) — suppliers and shopkeepers use this same endpoint
 * (optional 2FA, enabled from their portal settings). Sub-admins do NOT
 * use it — their first-time setup is mandatory and goes through
 * POST /api/auth/2fa/setup-first.
 */
async function setupTwoFactor(req, res, next) {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'shopkeeper' && req.user.role !== 'supplier') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Two-factor setup is available for admin, supplier and shopkeeper accounts only.' },
      });
    }
    if (req.user.twoFactorEnabled) {
      return res.status(400).json({
        error: { code: 'TWO_FACTOR_ALREADY_ENABLED', message: 'Two-factor authentication is already enabled.' },
      });
    }
    const secret = authenticator.generateSecret();
    req.user.twoFactorTempSecret = secret;
    await req.user.save();
    const otpauthUrl = authenticator.keyuri(req.user.email, 'Asan Tijarat', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    res.json({ otpauthUrl, qrDataUrl });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/2fa/verify-setup  (protected, admin + supplier + shopkeeper)
 * Body: { token } — the 6-digit code from the authenticator app.
 * Confirms the pending secret and enables 2FA for the account.
 */
async function verifyTwoFactorSetup(req, res, next) {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'shopkeeper' && req.user.role !== 'supplier') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Two-factor setup is available for admin, supplier and shopkeeper accounts only.' },
      });
    }
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'token is required.' },
      });
    }
    const user = await User.findById(req.user._id).select('+twoFactorTempSecret');
    if (!user || !user.twoFactorTempSecret) {
      return res.status(400).json({
        error: { code: 'TWO_FACTOR_SETUP_NOT_STARTED', message: 'Start setup first to get a QR code.' },
      });
    }
    const ok = authenticator.check(String(token).trim(), user.twoFactorTempSecret);
    if (!ok) {
      return res.status(400).json({
        error: { code: 'INVALID_TWO_FACTOR_CODE', message: 'Incorrect code. Enter the current code from your authenticator app.' },
      });
    }
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
    user.twoFactorEnabled = true;
    await user.save();
    res.json({ enabled: true, message: 'Two-factor authentication enabled.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/2fa/disable  (protected, admin + supplier + shopkeeper)
 * Body: { password } — disabling 2FA requires the current password, so a
 * stolen session alone cannot strip the second factor.
 */
async function disableTwoFactor(req, res, next) {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'shopkeeper' && req.user.role !== 'supplier') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Two-factor settings are available for admin, supplier and shopkeeper accounts only.' },
      });
    }
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'password is required.' },
      });
    }
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect password.' },
      });
    }
    user.twoFactorSecret = undefined;
    user.twoFactorTempSecret = undefined;
    user.twoFactorEnabled = false;
    await user.save();
    res.json({ disabled: true, message: 'Two-factor authentication disabled.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/2fa/setup-first  (public — carries the setup tempToken)
 * First-time 2FA setup for ADMIN + SUB-ADMINS. Body: { tempToken } — the
 * 5-minute JWT adminLogin() returned with requires2FASetup:true (purpose
 * '2fa-setup'). FIX (New audit #5) — the main admin uses this same flow:
 * 2FA is mandatory for the main admin too, so a first sign-in without it
 * routes here exactly like a sub-admin's. The account has no session yet,
 * so this is gated by the tempToken, not by protect(). Generates a fresh
 * TOTP secret, stores it as the PENDING secret and returns the otpauth URL
 * + QR data URL. 2FA is NOT enabled until POST /api/auth/2fa/verify-setup-first
 * confirms the first code.
 */
async function setupTwoFactorFirst(req, res, next) {
  try {
    const { tempToken } = req.body || {};
    if (!tempToken) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'tempToken is required.' },
      });
    }
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        error: { code: 'TWO_FACTOR_TOKEN_EXPIRED', message: 'The setup session expired. Please sign in again.' },
      });
    }
    if (!payload || payload.purpose !== '2fa-setup' || !payload.id) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_TOKEN', message: 'Invalid setup session. Please sign in again.' },
      });
    }
    const user = await User.findById(payload.id);
    if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_TOKEN', message: 'Invalid setup session. Please sign in again.' },
      });
    }
    if (user.twoFactorEnabled) {
      return res.status(400).json({
        error: { code: 'TWO_FACTOR_ALREADY_ENABLED', message: 'Two-factor authentication is already enabled. Please sign in.' },
      });
    }
    const secret = authenticator.generateSecret();
    user.twoFactorTempSecret = secret;
    await user.save();
    const otpauthUrl = authenticator.keyuri(user.email, 'Asan Tijarat', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    res.json({ otpauthUrl, qrDataUrl });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/2fa/verify-setup-first  (public — carries the setup tempToken)
 * Body: { tempToken, token } — token is the 6-digit code from the
 * authenticator app. Confirms the pending secret and enables 2FA for the
 * admin / sub-admin. After this, normal sign-in works: password →
 * requires2FA → 6-digit code → session.
 */
async function verifyTwoFactorSetupFirst(req, res, next) {
  try {
    const { tempToken, token } = req.body || {};
    if (!tempToken || !token) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'tempToken and token are required.' },
      });
    }
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        error: { code: 'TWO_FACTOR_TOKEN_EXPIRED', message: 'The setup session expired. Please sign in again.' },
      });
    }
    if (!payload || payload.purpose !== '2fa-setup' || !payload.id) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_TOKEN', message: 'Invalid setup session. Please sign in again.' },
      });
    }
    const user = await User.findById(payload.id).select('+twoFactorTempSecret');
    // Batch 17 (M2) — same per-account TOTP limit as the 2FA logins.
    // The lock is checked BEFORE the setup-started check: the 5th
    // failure discards the pending secret, and a locked account must
    // still hear "locked" (403), not "setup not started" (400).
    if (isTotpLocked(user)) {
      return res.status(403).json({
        error: { code: 'TWO_FACTOR_LOCKED', message: `Too many wrong codes. Sign in again in ${totpLockMinutesLeft(user)} minute(s) to restart setup.` },
      });
    }
    if (!user || (user.role !== 'admin' && user.role !== 'subadmin') || !user.twoFactorTempSecret) {
      return res.status(400).json({
        error: { code: 'TWO_FACTOR_SETUP_NOT_STARTED', message: 'Start setup first to get a QR code.' },
      });
    }
    const ok = authenticator.check(String(token).trim(), user.twoFactorTempSecret);
    if (!ok) {
      const { locked } = recordTotpFailure(user);
      if (locked) {
        // The 5th failure invalidates the pending setup itself: the
        // guessed secret is discarded, so the attacker cannot keep
        // guessing it after the lock expires - setup must start over.
        user.twoFactorTempSecret = undefined;
      }
      await user.save();
      if (locked) {
        return res.status(403).json({
          error: { code: 'TWO_FACTOR_LOCKED', message: 'Too many wrong codes. Sign in again in 15 minutes to restart setup.' },
        });
      }
      return res.status(400).json({
        error: { code: 'INVALID_TWO_FACTOR_CODE', message: 'Incorrect code. Enter the current code from your authenticator app.' },
      });
    }
    resetTotpAttempts(user);
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
    user.twoFactorEnabled = true;
    await user.save();
    res.json({ enabled: true, message: 'Two-factor authentication enabled. Please sign in.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/2fa/login  (public — carries the tempToken from login)
 * Body: { tempToken, token } — tempToken is the 5-minute JWT login() returned
 * with requires2FA:true; token is the 6-digit authenticator code.
 * On success issues the normal asan_token cookie, exactly like login().
 * FIX (New audit #15) — this endpoint now completes the sign-in for
 * shopkeeper/supplier accounts with 2FA enabled. Admin/subadmin accounts
 * must still use POST /api/auth/admin/2fa/login (host-only admin cookie).
 */
async function verifyTwoFactorLogin(req, res, next) {
  try {
    const { tempToken, token } = req.body || {};
    if (!tempToken || !token) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'tempToken and token are required.' },
      });
    }
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        error: { code: 'TWO_FACTOR_TOKEN_EXPIRED', message: 'The two-factor session expired. Please sign in again.' },
      });
    }
    if (!payload || payload.purpose !== '2fa' || !payload.id) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_TOKEN', message: 'Invalid two-factor session. Please sign in again.' },
      });
    }
    const user = await User.findById(payload.id).select('+twoFactorSecret');
    if (!user || (user.role !== 'shopkeeper' && user.role !== 'supplier') || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_TOKEN', message: 'Invalid two-factor session. Please sign in again.' },
      });
    }
    // The account must still be in good standing — a suspension issued
    // between the password step and this code must keep them out.
    if (user.status === 'suspended') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: user.suspensionReason
            ? `Your account is suspended. Reason: ${user.suspensionReason}`
            : 'Your account is suspended. Please contact support.',
        },
      });
    }
    // Batch 17 (M2) — per-account TOTP brute-force limit, same as the
    // admin 2FA login above: 5 fails → 15-min lock.
    if (isTotpLocked(user)) {
      return res.status(403).json({
        error: { code: 'TWO_FACTOR_LOCKED', message: `Too many wrong codes. Try again in ${totpLockMinutesLeft(user)} minute(s).` },
      });
    }
    const ok = authenticator.check(String(token).trim(), user.twoFactorSecret);
    if (!ok) {
      const { locked } = recordTotpFailure(user);
      await user.save();
      if (locked) {
        return res.status(403).json({
          error: { code: 'TWO_FACTOR_LOCKED', message: 'Too many wrong codes. Sign in again in 15 minutes.' },
        });
      }
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_CODE', message: 'Incorrect code. Enter the current code from your authenticator app.' },
      });
    }
    resetTotpAttempts(user);
    // Single-session: this verified login kills any older session.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    issueAuthCookie(res, user);
    // Batch 17 (L7) — a fresh session gets a fresh CSRF token.
    rotateCsrfToken(res);
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me  (optionalProtect — guests get 200 { user: null })
 * Returns the currently authenticated user, or null for a guest.
 */
async function me(req, res) {
  res.json({ user: req.user ? req.user.toSafeJSON() : null });
}

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Hashed single-use token, 15-min expiry. Same generic message whether
 * or not the email exists, so accounts cannot be enumerated.
 * Sends a real reset-link email when Brevo is configured; otherwise
 * nothing secret is logged (FIX Batch 02 — token kabhi log nahi hota).
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'email is required.' },
      });
    }
    // Batch 12 — same loud failure as send-otp above: checked BEFORE the
    // user lookup, so the 503 is identical whether or not the account
    // exists (no account enumeration). Otherwise the generic success
    // message below would promise reset instructions that never arrive.
    if (!isEmailConfigured()) {
      console.error('[auth] BREVO_API_KEY is NOT set — cannot send password-reset email. Set BREVO_API_KEY in the backend environment.');
      return res.status(503).json({
        error: { code: 'EMAIL_NOT_CONFIGURED', message: 'Email service is not configured, so the reset instructions cannot be sent. Please try again later.' },
      });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+otpHash');
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetPasswordTokenHash = hashValue(token);
      user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const resetLink = `${baseUrl}/reset-password?token=${token}`;
      const resetEmail = resetPasswordEmail({ name: user.name, resetLink });
      const emailSent = await sendEmail({
        to: user.email,
        subject: resetEmail.subject,
        html: resetEmail.html,
        text: resetEmail.text,
      });
      if (!emailSent) {
        // FIX (Batch 02) — reset token kabhi log nahi karna. Sirf warning.
        console.warn(`[auth] Password-reset email NOT sent for ${user.email} — check BREVO_API_KEY. Reset token is never logged.`);
      }
    }
    res.json({ message: 'If an account exists for this email, reset instructions have been sent.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 * New password must be different from the old password — purana
 * password dobara set nahi ho sakta. Is rejection par token clear
 * NAHI hota, taake user usi link se alag password try kar sake.
 */
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'token, newPassword are required.' },
      });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({
        error: { code: 'WEAK_PASSWORD', message: 'New password must be at least 8 characters.' },
      });
    }
    const user = await User.findOne({
      resetPasswordTokenHash: hashValue(token),
      resetPasswordExpiresAt: { $gt: new Date() },
    }).select('+password');
    if (!user) {
      return res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'Reset token is invalid or expired.' },
      });
    }
    if (await user.matchPassword(newPassword)) {
      return res.status(400).json({
        error: { code: 'SAME_AS_OLD_PASSWORD', message: 'New password must be different from your old password.' },
      });
    }
    user.password = newPassword; // pre('save') hook re-hashes
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpiresAt = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    // A forgot-password reset may mean the account was compromised —
    // invalidate every existing session; the user signs in fresh.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ reset: true, message: 'Password reset. You can now sign in with the new password.' });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/me  (protected)
 * Body: { name?, businessName?, email?, phone?, city?, ntn?, cnic?,
 *         category?, categories?, avatar?,
 *         houseAddress?, currentHouseLocation?, currentLocation?,
 *         shopType?, shopLocation?, utilityBillAccountNumber? }
 *
 * Self-service profile update — powers the shopkeeper/supplier settings pages.
 * `role` and `verified` are intentionally NOT editable here: only an admin
 * (see PATCH /api/admin/users/:id/{role,verify}) may change those.
 */
async function updateMe(req, res, next) {
  try {
    // C5 fix: fields are role-scoped — a shopkeeper cannot set supplier-only
    // fields (ntn/categories) and a supplier cannot set shopkeeper-only fields.
    const COMMON_EDITABLE = ['name', 'businessName', 'email', 'phone', 'city', 'cnic', 'avatar', 'houseAddress', 'currentHouseLocation', 'currentLocation'];
    const SUPPLIER_EDITABLE = ['ntn', 'category', 'categories'];
    const SHOPKEEPER_EDITABLE = ['shopType', 'shopLocation', 'utilityBillAccountNumber'];
    let EDITABLE = [...COMMON_EDITABLE];
    if (req.user.role === 'supplier') EDITABLE.push(...SUPPLIER_EDITABLE);
    else if (req.user.role === 'shopkeeper') EDITABLE.push(...SHOPKEEPER_EDITABLE);
    // Admin/subadmin use the admin panel, not self-service; keep common fields only.

    const updates = {};
    for (const field of EDITABLE) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: { code: 'NOTHING_TO_UPDATE', message: 'Provide at least one editable field.' },
      });
    }

    if (updates.categories !== undefined) {
      if (!Array.isArray(updates.categories) || !updates.categories.every((c) => CATEGORIES.includes(c))) {
        return res.status(400).json({
          error: { code: 'INVALID_CATEGORY', message: 'categories must be from the 14 master categories.' },
        });
      }
    }
    if (updates.cnic !== undefined && updates.cnic && !/^\d{13}$/.test(String(updates.cnic).trim())) {
      return res.status(400).json({
        error: { code: 'INVALID_CNIC', message: 'CNIC must be exactly 13 digits.' },
      });
    }
    // Batch 17 (L2) — avatar allow-list, same as register.
    if (updates.avatar !== undefined && !isSafeAvatar(updates.avatar)) {
      return res.status(400).json({
        error: { code: 'INVALID_AVATAR', message: 'Avatar must be an http(s) URL, a relative path, or an image file.' },
      });
    }

    // GPS coordinates captured from the device — same validation as register.
    // `null` clears the stored point; anything else must be a valid coordinate.
    if (Object.prototype.hasOwnProperty.call(updates, 'currentLocation')) {
      if (updates.currentLocation !== null) {
        const point = sanitizeLocation(updates.currentLocation);
        if (!point) {
          return res.status(400).json({
            error: {
              code: 'INVALID_LOCATION',
              message: 'currentLocation must be { lat: -90..90, lng: -180..180 } or null.',
            },
          });
        }
        updates.currentLocation = point;
      }
    }

    if (updates.name !== undefined && !String(updates.name).trim()) {
      return res.status(400).json({
        error: { code: 'INVALID_NAME', message: 'Name cannot be empty.' },
      });
    }

    // Email must stay unique (and normalised the same way as register/login).
    if (updates.email !== undefined) {
      const email = String(updates.email).toLowerCase().trim();
      if (!email) {
        return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Email cannot be empty.' } });
      }
      const clash = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (clash) {
        return res.status(409).json({
          error: { code: 'EMAIL_EXISTS', message: 'Another account already uses this email.' },
        });
      }
      updates.email = email;
      // C4 fix: a new email address must re-verify via OTP.
      if (email !== req.user.email) updates.emailVerified = false;
    }

    // Phone is used as a login identifier too, so it must also stay unique.
    if (updates.phone !== undefined) {
      const phone = String(updates.phone).trim();
      if (!phone) {
        return res.status(400).json({ error: { code: 'INVALID_PHONE', message: 'Phone number cannot be empty.' } });
      }
      const clash = await User.findOne({ phone, _id: { $ne: req.user._id } });
      if (clash) {
        return res.status(409).json({ error: { code: 'PHONE_EXISTS', message: 'Another account already uses this phone number.' } });
      }
      updates.phone = phone;
    }

    // Batch 17 (L5) — a stolen session could silently swap the account's
    // email/phone, redirecting future OTPs and password resets to the
    // attacker. Changing either contact now requires the current
    // password, and the session is then killed outright (tokenVersion
    // bump + cookies cleared below = force re-login, the sanctioned
    // alternative to OTP-before-change). A changed email still sets
    // emailVerified = false above, so the new address must be
    // re-verified by OTP (send-otp → verify-otp) before it counts.
    const contactChanged =
      (updates.email !== undefined && updates.email !== req.user.email) ||
      (updates.phone !== undefined && updates.phone !== req.user.phone);
    if (contactChanged) {
      const { currentPassword } = req.body || {};
      if (!currentPassword) {
        return res.status(401).json({
          error: { code: 'PASSWORD_REQUIRED', message: 'Enter your current password to change your email or phone number.' },
        });
      }
      const userWithPassword = await User.findById(req.user._id).select('+password');
      if (!userWithPassword || !(await userWithPassword.matchPassword(currentPassword))) {
        return res.status(401).json({
          error: { code: 'INVALID_PASSWORD', message: 'Your current password is incorrect.' },
        });
      }
    }

    Object.assign(req.user, updates);
    if (contactChanged) {
      req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
    }
    await req.user.save();
    if (contactChanged) {
      // Batch 17 (L5) — force re-login: the session that changed the
      // contact details does NOT keep running on the new, unverified
      // details. The bump kills every session (this one included) and
      // the cookies are cleared, so the browser stops sending the dead
      // token; the CSRF token rotates too. The user signs in again with
      // the new details. (The current password was already proven above,
      // so a stolen session alone cannot reach this point at all.)
      res.clearCookie('asan_token', {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      res.clearCookie('asan_admin_token', {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      rotateCsrfToken(res);
    }

    res.json({ user: req.user.toSafeJSON(), ...(contactChanged ? { contactChanged: true } : {}) });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/me/password  (protected)
 * Body: { currentPassword, newPassword }
 *
 * Verifies the current password before replacing it. `password` is
 * `select: false` on the model, so it has to be re-fetched explicitly.
 * New password must be different from the current password.
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'currentPassword and newPassword are required.' },
      });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({
        error: { code: 'WEAK_PASSWORD', message: 'New password must be at least 8 characters.' },
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.matchPassword(currentPassword))) {
      return res.status(401).json({
        error: { code: 'INVALID_PASSWORD', message: 'Your current password is incorrect.' },
      });
    }
    if (await user.matchPassword(newPassword)) {
      return res.status(400).json({
        error: { code: 'SAME_AS_OLD_PASSWORD', message: 'New password must be different from your old password.' },
      });
    }

    user.password = newPassword;
    // Kill every other session: their tokens carry the old tokenVersion.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save(); // pre('save') hook re-hashes the new password
    // Re-issue this session's cookie with the new version so the user
    // who just changed the password is NOT logged out.
    issueAuthCookie(res, user);

    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, adminLogin, adminVerifyTwoFactorLogin, me, logout, updateMe, changePassword, sendOtp, verifyOtp, forgotPassword, resetPassword, setupTwoFactor, verifyTwoFactorSetup, disableTwoFactor, verifyTwoFactorLogin, setupTwoFactorFirst, verifyTwoFactorSetupFirst };
