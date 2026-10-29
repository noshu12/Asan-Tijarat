const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { CATEGORIES } = require('../constants/categories');

/**
 * Shop types for the shopkeeper form — a shopkeeper NEVER picks a product
 * category. Must match Frontend/app/getstarted/page.tsx SHOP_TYPES exactly.
 */
const SHOP_TYPES = [
  'Kiryana Store',
  'General Store',
  'Provision Store',
  'Super Store',
  'Mart',
  'Departmental Store',
  'Shopping Centre',
  'Cash & Carry',
  'Traders',
  'Simple Store',
];

/**
 * One uploaded compliance document — `url` is the private path served only
 * via an authenticated admin route (see server.js uploads guard), the rest
 * is audit metadata shown next to the preview in the Admin Dashboard.
 */
const kycDocumentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * Step 3 documents collected at registration.
 * Supplier → CNIC front/back + NTN. Shopkeeper → CNIC front/back + Utility Bill.
 * Written by `src/utils/kycStorage.js`; every field is optional so
 * older accounts stay valid.
 */
const kycDocumentsSchema = new mongoose.Schema(
  {
    cnicFront: { type: kycDocumentSchema, default: undefined },
    cnicBack: { type: kycDocumentSchema, default: undefined },
    ntn: { type: kycDocumentSchema, default: undefined },
    utilityBill: { type: kycDocumentSchema, default: undefined },
  },
  { _id: false }
);

/**
 * GPS point captured by the browser's Geolocation API — rendered as a
 * clickable Google Maps link in the Admin Dashboard. (Shared schema lives in
 * utils/location.js so the Order model reuses the exact same shape.)
 */
const { deviceLocationSchema } = require('../utils/location');

/**
 * User — mirrors Frontend/lib/types.ts `User` interface.
 * role: 'shopkeeper' (buyer) | 'supplier' (seller) | 'admin' (platform operator)
 *
 * categories: MULTI-SELECT list from the 14 master categories — this is what
 * the supplier dropdown at account creation stores. `category` is kept only
 * for backward compatibility with the old frontend. Shopkeepers NEVER have
 * categories — they have a shopType instead.
 *
 * verified: kept for now — login/protect still use it, so PASS login is not
 * broken by this file alone. `status` + `emailVerified` are the new, separate
 * fields; the auth controller/protect migration to `status` comes in the
 * Auth APIs step.
 *
 * ntn/businessName/city/shopType/shopLocation/utilityBillAccountNumber are NOT
 * marked required here: making them required in the model would break saves
 * for older accounts that lack them. The mandatory check for NEW registrations
 * (supplier → NTN; shopkeeper → shopType + utilityBillAccountNumber, NO NTN)
 * comes in the register controller.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['shopkeeper', 'supplier', 'admin'], required: true, index: true },
    businessName: { type: String, trim: true },
    city: { type: String, trim: true },
    // Residential details collected at registration (shopkeepers & suppliers)
    // and editable later from the portal settings pages.
    // Supplier → Warehouse Address + Warehouse Location.
    // Shopkeeper → House Address + Shop Location.
    houseAddress: { type: String, trim: true },
    currentHouseLocation: { type: String, trim: true },
    // Shopkeeper only — the shop's address/market, from the Shop Location field.
    shopLocation: { type: String, trim: true },
    // GPS coordinates of the device that registered/updated the account.
    currentLocation: { type: deviceLocationSchema, default: undefined },
    // Supplier only — shopkeepers have NO NTN since the 2026-10-29 redesign.
    ntn: { type: String, trim: true },
    // Shopkeeper only — one of the 10 SHOP_TYPES; never a product category.
    shopType: { type: String, enum: SHOP_TYPES, trim: true },
    // Shopkeeper only — must match the account number on the uploaded utility
    // bill; the admin verifies the match visually during verification (no OCR).
    utilityBillAccountNumber: { type: String, trim: true },
    // CNIC number itself (13 digits, digits only) — validated only when given,
    // so older accounts without it stay valid.
    cnic: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || /^\d{13}$/.test(v),
        message: 'CNIC must be exactly 13 digits.',
      },
    },
    category: { type: String, trim: true },
    categories: {
      type: [{ type: String, enum: CATEGORIES, trim: true }],
      default: [],
    },
    avatar: { type: String, default: '' },
    // KYC uploads: { cnicFront: {...}, cnicBack: {...}, ntn: {...}, utilityBill: {...} }
    documents: { type: kycDocumentsSchema, default: {} },
    verified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'rejected'],
      default: 'pending',
    },
    // Admin-written reason for suspend / reject. Yehi reason branded
    // email me user ko jayega. Account suspend/reject na ho to khali rehta hai.
    suspensionReason: { type: String, trim: true, default: '' },
    rejectionReason: { type: String, trim: true, default: '' },
    emailVerified: { type: Boolean, default: false },
    // OTP (email) — hashed 6-digit code, 5-min expiry, resend/attempt limits.
    otpHash: { type: String, select: false, default: undefined },
    otpExpiresAt: { type: Date, default: undefined },
    otpAttempts: { type: Number, default: 0, min: 0 },
    lastOtpSentAt: { type: Date, default: undefined },
    // Forgot/reset password — hashed single-use token, 15-min expiry.
    resetPasswordTokenHash: { type: String, select: false, default: undefined },
    resetPasswordExpiresAt: { type: Date, default: undefined },
    // Login lockout — 5 failed attempts → 15-min lock (enforced in login).
    loginAttempts: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: undefined },
    // Admin 2FA (TOTP authenticator app) — setup / verify / disable live in
    // auth.controller.js. The secret is NEVER sent to the frontend
    // (select: false) and is only needed server-side to check the 6-digit code.
    twoFactorSecret: { type: String, select: false, default: undefined },
    twoFactorEnabled: { type: Boolean, default: false },
    // Holds the freshly generated secret between "setup" (QR code shown) and
    // "verify-setup" (first code confirmed). Cleared as soon as 2FA is enabled.
    twoFactorTempSecret: { type: String, select: false, default: undefined },
    // Session invalidation: bumped every time the password changes.
    // The login JWT carries this number; protect() rejects tokens whose
    // number no longer matches, so old sessions die on password change.
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(doc, ret) {
        delete ret._id;
        return ret;
      },
    },
  }
);

// Sync single `category` <-> multi `categories`, keeping ONLY valid values.
// This MUST run in pre('validate') — validation runs BEFORE pre('save'),
// so filtering only in pre('save') is too late once an invalid value is
// already stored in the DB. Legacy categories (e.g. admin's
// 'Platform Administration', or the old 7 categories) are NOT in the 14
// master categories, so they are dropped here, never copied into
// `categories`. Admins correctly end up with [].
function syncCategories(doc) {
  if (Array.isArray(doc.categories)) {
    doc.categories = doc.categories.filter((c) => CATEGORIES.includes(c));
  }
  if (Array.isArray(doc.categories) && doc.categories.length > 0 && !doc.category) {
    doc.category = doc.categories[0];
  } else if (doc.category && (!Array.isArray(doc.categories) || doc.categories.length === 0)) {
    doc.categories = CATEGORIES.includes(doc.category) ? [doc.category] : [];
  }
}

userSchema.pre('validate', async function () {
  syncCategories(this);
});

// Hash the password before every save/create.
// (Mongoose 9 dropped the `next` callback — async middleware only.)
userSchema.pre('save', async function () {
  syncCategories(this);
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Returns the user document without password / OTP / reset secrets — safe for API responses. */
userSchema.methods.toSafeJSON = function () {
  const doc = this.toObject({ virtuals: true, versionKey: false });
  doc.id = doc._id.toString();
  delete doc._id;
  delete doc.password;
  delete doc.otpHash;
  delete doc.resetPasswordTokenHash;
  delete doc.twoFactorSecret;
  delete doc.twoFactorTempSecret;
  return doc;
};

module.exports = mongoose.model('User', userSchema);
