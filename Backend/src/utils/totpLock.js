'use strict';

// totpLock.js — per-account brute-force limit for TOTP (6-digit) codes
// (Batch 17, Round-5 audit M2).
//
// The password login already counts failures per account
// (loginAttempts / lockUntil, 5 fails → 15-min lock). The three TOTP
// endpoints — POST /api/auth/admin/2fa/login, POST /api/auth/2fa/login
// and POST /api/auth/2fa/verify-setup-first — had no equivalent: a wrong
// code just returned 401, so one 5-minute tempToken could be guessed
// ~50 times (the shared per-IP authLimiter) with no per-account cost.
//
// These helpers mirror the login pattern exactly, on their own fields
// (totpAttempts / totpLockUntil on the User model) so a TOTP lock never
// interferes with the password lock and vice versa. The tempToken itself
// is a stateless 5-minute JWT and cannot be revoked — the lock is what
// makes it useless: while locked, every TOTP endpoint refuses the
// account, even with a fresh tempToken and the right code.

const TOTP_MAX_ATTEMPTS = 5;
const TOTP_LOCK_MS = 15 * 60 * 1000;

/** True when the account is inside a TOTP lockout window. */
function isTotpLocked(user) {
  return Boolean(user && user.totpLockUntil && user.totpLockUntil.getTime() > Date.now());
}

/** Whole minutes left on the lock, for the error message. */
function totpLockMinutesLeft(user) {
  if (!isTotpLocked(user)) return 0;
  return Math.ceil((user.totpLockUntil.getTime() - Date.now()) / 60000);
}

/**
 * Records one failed TOTP attempt. Returns { locked: true } exactly when
 * this failure hit the limit and the 15-minute lock started — the caller
 * then answers 403 TWO_FACTOR_LOCKED instead of another 401, and (for
 * the setup-first flow) clears the pending secret so the guessed setup
 * cannot continue. Does NOT save: the caller saves the user once.
 */
function recordTotpFailure(user) {
  user.totpAttempts = (user.totpAttempts || 0) + 1;
  if (user.totpAttempts >= TOTP_MAX_ATTEMPTS) {
    user.totpLockUntil = new Date(Date.now() + TOTP_LOCK_MS);
    return { locked: true };
  }
  return { locked: false };
}

/** Clears the counter + lock — called on every successful TOTP check. */
function resetTotpAttempts(user) {
  user.totpAttempts = 0;
  user.totpLockUntil = undefined;
}

module.exports = { TOTP_MAX_ATTEMPTS, TOTP_LOCK_MS, isTotpLocked, totpLockMinutesLeft, recordTotpFailure, resetTotpAttempts };
