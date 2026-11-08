const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { CATEGORIES } = require('../constants/categories');
const { saveKycDocuments, deleteStoredFiles, deleteStoredUploads, KycUploadError } = require('../utils/kycStorage');
const { sanitizeLocation } = require('../utils/location');
const { sendEmail } = require('../utils/sendEmail');
const { otpEmail, pendingVerificationEmail } = require('../utils/emailTemplates');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

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
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days, matching JWT_EXPIRES_IN
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
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days, matching JWT_EXPIRES_IN
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
 * POST /api/auth/check-availability
 * Body: { email?, phone? } — at least one required.
 * Returns which identifiers are still free. Safe to call before register.
 */
async function checkAvailability(req, res, next) {
  try {
    const { email, phone } = req.body || {};
    if (!email && !phone) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'email is required.' },
      });
    }
    const result = {};
    if (email) {
      const found = await User.findOne({ email: String(email).toLowerCase().trim() }).lean();
      result.emailAvailable = !found;
    }
    if (phone) {
      const found = await User.findOne({ phone: String(phone).trim() }).lean();
      result.phoneAvailable = !found;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
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

    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] });
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
        name, email, phone, password, role,
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

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
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
    // Single-session: a fresh login kills the previous session on any other
    // device/browser. The bump sits here (not above) so a password-only
    // attempt never logs the real user out before the 2FA code is verified.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    issueAuthCookie(res, user);

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
 * 2FA flow is identical: { requires2FA:true, tempToken } →
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

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
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

    // Sub-admin 2FA is MANDATORY — first-time setup via the tempToken.
    if (user.role === 'subadmin' && !user.twoFactorEnabled) {
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
    const ok = authenticator.check(String(token).trim(), user.twoFactorSecret);
    if (!ok) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_CODE', message: 'Incorrect code. Enter the current code from your authenticator app.' },
      });
    }
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
    res.json({ ok: true, message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/2fa/setup  (protected, admin only)
 * Generates a fresh TOTP secret, stores it as the PENDING secret and returns
 * the otpauth URL + a QR data URL for the authenticator app. 2FA is NOT
 * enabled until POST /api/auth/2fa/verify-setup confirms the first code —
 * so a wrongly scanned QR can never lock the admin out.
 */
async function setupTwoFactor(req, res, next) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Two-factor setup is available for admin accounts only.' },
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
 * POST /api/auth/2fa/verify-setup  (protected, admin only)
 * Body: { token } — the 6-digit code from the authenticator app.
 * Confirms the pending secret and enables 2FA for the admin.
 */
async function verifyTwoFactorSetup(req, res, next) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Two-factor setup is available for admin accounts only.' },
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
 * POST /api/auth/2fa/disable  (protected, admin only)
 * Body: { password } — disabling 2FA requires the current password, so a
 * stolen session alone cannot strip the second factor.
 */
async function disableTwoFactor(req, res, next) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Two-factor settings are available for admin accounts only.' },
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
 * First-time 2FA setup for SUB-ADMINS. Body: { tempToken } — the 5-minute
 * JWT login() returned with requires2FASetup:true (purpose '2fa-setup').
 * The sub-admin has no session yet, so this is gated by the tempToken, not
 * by protect(). Generates a fresh TOTP secret, stores it as the PENDING
 * secret and returns the otpauth URL + QR data URL. 2FA is NOT enabled until
 * POST /api/auth/2fa/verify-setup-first confirms the first code.
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
    if (!user || user.role !== 'subadmin') {
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
 * sub-admin. After this, normal sign-in works: password → requires2FA →
 * 6-digit code → session.
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
    if (!user || user.role !== 'subadmin' || !user.twoFactorTempSecret) {
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
    if (!user || (user.role !== 'admin' && user.role !== 'subadmin') || !user.twoFactorEnabled || !user.twoFactorSecret) {
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
    const ok = authenticator.check(String(token).trim(), user.twoFactorSecret);
    if (!ok) {
      return res.status(401).json({
        error: { code: 'INVALID_TWO_FACTOR_CODE', message: 'Incorrect code. Enter the current code from your authenticator app.' },
      });
    }
    // Single-session: this verified login kills any older session.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    issueAuthCookie(res, user);
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me  (protected)
 * Returns the currently authenticated user.
 */
async function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
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
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+otpHash');
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetPasswordTokenHash = hashValue(token);
      user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const resetLink = `${baseUrl}/reset-password?token=${token}`;
      const emailSent = await sendEmail({
        to: user.email,
        subject: 'Asan Tijarat - Reset your password',
        text: `You requested a password reset for Asan Tijarat.\n\nClick this link to reset your password (valid for 15 minutes):\n${resetLink}\n\nIf you did not request this, ignore this email.`,
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

    Object.assign(req.user, updates);
    await req.user.save();

    res.json({ user: req.user.toSafeJSON() });
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

module.exports = { register, login, adminLogin, adminVerifyTwoFactorLogin, me, logout, updateMe, changePassword, checkAvailability, sendOtp, verifyOtp, forgotPassword, resetPassword, setupTwoFactor, verifyTwoFactorSetup, disableTwoFactor, verifyTwoFactorLogin, setupTwoFactorFirst, verifyTwoFactorSetupFirst };
