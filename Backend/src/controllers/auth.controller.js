const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { CATEGORIES } = require('../constants/categories');
const { saveKycDocuments, deleteStoredFiles, KycUploadError } = require('../utils/kycStorage');
const { sanitizeLocation } = require('../utils/location');

/**
 * Shown to a self-registered shopkeeper/supplier while their KYC details are
 * waiting for admin approval. Kept in sync with the /getstarted confirmation
 * screen and the /signin pending-verification notice.
 */
const PENDING_VERIFICATION_MESSAGE =
  'Your account will be verified within 24 hours. Once your account has been verified, you can sign in using your registered credentials.';

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
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
        error: { code: 'MISSING_FIELDS', message: 'email or phone is required.' },
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
 * Body: { name, email, phone, password, role, businessName, city, ntn,
 *         category?, categories?, cnic?, avatar?,
 *         houseAddress?, currentHouseLocation?, currentLocation?, documents?: { cnicFront?, cnicBack?, ntn? } }
 *
 * `documents` carries Step-3 KYC uploads (base64 data URLs) for both
 * shopkeepers and suppliers: CNIC front, CNIC back and the NTN certificate.
 * Each one is written to uploads/kyc and stored on the account as
 * `documents:<field> = { url, originalName, mimeType, size, uploadedAt }`, so
 * the Admin Dashboard previews the exact images the trader uploaded.
 *
 * Creates a PENDING account — `verified` is forced to false and NO JWT is
 * issued, so registration never signs the trader in. The submitted details go
 * straight to the Admin Dashboard; an admin must approve the account
 * (PATCH /api/admin/users/:id/verify) before login succeeds.
 * businessName, city and ntn are mandatory for shopkeepers and suppliers.
 */
async function register(req, res, next) {
  try {
    const { name, email, phone, password, role, businessName, city, ntn, cnic, category, categories, avatar, documents, houseAddress, currentHouseLocation, currentLocation } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'name, email, phone, password and role are required.' },
      });
    }
    // Self-registration is limited to marketplace accounts; admins are
    // provisioned by the seed script or an existing admin.
    if (!['shopkeeper', 'supplier'].includes(role)) {
      return res.status(400).json({
        error: { code: 'INVALID_ROLE', message: 'role must be "shopkeeper" or "supplier".' },
      });
    }
    if (!businessName || !city || !ntn) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'businessName, city and ntn are required.' },
      });
    }
    if (cnic && !/^\d{13}$/.test(String(cnic).trim())) {
      return res.status(400).json({
        error: { code: 'INVALID_CNIC', message: 'CNIC must be exactly 13 digits.' },
      });
    }
    // Categories: multi-select list from the 14 master categories.
    // A single legacy `category` string is accepted and converted to a list.
    let categoriesList = [];
    if (Array.isArray(categories)) categoriesList = categories;
    else if (category) categoriesList = [category];
    if (categoriesList.length > 0 && !categoriesList.every((c) => CATEGORIES.includes(c))) {
      return res.status(400).json({
        error: { code: 'INVALID_CATEGORY', message: 'categories must be from the 14 master categories.' },
      });
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

    // Validate + persist the uploaded CNIC/NTN files BEFORE creating the
    // account: a rejected document never leaves a half-registered user behind.
    let stored;
    try {
      stored = saveKycDocuments(documents);
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
        businessName, city, ntn, cnic,
        category: categoriesList[0] || undefined,
        categories: categoriesList,
        avatar,
        houseAddress, currentHouseLocation,
        currentLocation: currentLocationPoint,
        documents: stored.documents,
        verified: false, // never trust a client-supplied `verified`
        status: 'pending',
        emailVerified: false,
      });
    } catch (err) {
      // Roll the written files back — nothing should point at a ghost account.
      deleteStoredFiles(stored.files);
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
 * Without SMTP, the OTP is logged server-side (dev only) — same as before.
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
      console.log(`[auth] OTP (dev only, no SMTP configured) for ${user.email}: ${otp}`);
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
    res.json({ emailVerified: true, message: 'Email verified. Admin approval is still required before sign-in.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { identifier (email OR phone), password }
 * 5 failed attempts → 15-min lock.
 */
async function login(req, res, next) {
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

    // Self-registered accounts stay dormant until an admin approves their KYC
    // details — credentials alone are not enough to sign in.
    if (user.role !== 'admin' && !user.verified) {
      return res.status(403).json({
        error: { code: 'ACCOUNT_PENDING_VERIFICATION', message: PENDING_VERIFICATION_MESSAGE },
      });
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

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
    res.json({ ok: true, message: 'Logged out.' });
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
 * Without SMTP, the token is logged server-side (dev only).
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
      console.log(`[auth] Password reset token (dev only, no SMTP configured) for ${user.email}: ${token}`);
    }
    res.json({ message: 'If an account exists for this email, reset instructions have been sent.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 */
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'token and newPassword are required.' },
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
    user.password = newPassword; // pre('save') hook re-hashes
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpiresAt = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
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
 *         houseAddress?, currentHouseLocation?, currentLocation? }
 *
 * Self-service profile update — powers the shopkeeper/supplier settings pages.
 * `role` and `verified` are intentionally NOT editable here: only an admin
 * (see PATCH /api/admin/users/:id/{role,verify}) may change those.
 */
async function updateMe(req, res, next) {
  try {
    const EDITABLE = ['name', 'businessName', 'email', 'phone', 'city', 'ntn', 'cnic', 'category', 'categories', 'avatar', 'houseAddress', 'currentHouseLocation', 'currentLocation'];

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
    }

    // Phone is used as a login identifier too, so it must also stay unique.
    if (updates.phone !== undefined) {
      const phone = String(updates.phone).trim();
      if (!phone) {
        return res.status(400).json({
          error: { code: 'INVALID_PHONE', message: 'Phone number cannot be empty.' },
        });
      }
      const clash = await User.findOne({ phone, _id: { $ne: req.user._id } });
      if (clash) {
        return res.status(409).json({
          error: { code: 'PHONE_EXISTS', message: 'Another account already uses this phone number.' },
        });
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

    user.password = newPassword;
    await user.save(); // pre('save') hook re-hashes the new password

    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, logout, updateMe, changePassword, checkAvailability, sendOtp, verifyOtp, forgotPassword, resetPassword };
