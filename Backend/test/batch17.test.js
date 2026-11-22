'use strict';

// Tests for Batch 17 (Round-5 audit, batch A — Security).
//
// Node's built-in runner only — no new dependencies, no MongoDB, no
// network (the Turnstile fetch is stubbed). Run: `npm test` from the
// Backend folder.
//
// Behaviour under test (read from the code, not assumed):
//   • totpLock helpers — 5 failed TOTP attempts → 15-min lock, lock
//     expiry, reset on success (M2, the loginAttempts pattern).
//   • adminVerifyTwoFactorLogin / verifyTwoFactorLogin /
//     verifyTwoFactorSetupFirst — 4 wrong codes → 401/400, 5th → 403
//     TWO_FACTOR_LOCKED, and a correct code while locked still 403s;
//     setup-first also discards the pending secret on the 5th failure,
//     and a success resets the counter (M2).
//   • logout — bumps tokenVersion, so the pre-logout token is rejected
//     by verifySession with SESSION_INVALIDATED (M1); both auth cookies
//     are cleared and the CSRF token is rotated (L7).
//   • jwtExpiryToMs — cookie maxAge derives from JWT_EXPIRES_IN (M4).
//   • safeQuery / avatar — operator objects never reach a filter, and
//     only http(s)/relative/image-data avatars are storable (L1, L2).
//   • rotateCsrfToken — a fresh 64-hex token is issued (L7).
//   • requireTurnstile — skipped without a secret (dev), 403 without a
//     token, 403 on failed verification, 403 when siteverify itself
//     errors (fail-closed); passes on success (M3).
//
// The User model is stubbed per test (User.findById is replaced and
// restored) — the controllers call it at request time, so no database
// is needed.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-123456';
process.env.JWT_EXPIRES_IN = '7d';

const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const { signToken, jwtExpiryToMs } = require('../src/utils/jwt');
const {
  isTotpLocked,
  totpLockMinutesLeft,
  recordTotpFailure,
  resetTotpAttempts,
} = require('../src/utils/totpLock');
const { queryString, queryEnum } = require('../src/utils/safeQuery');
const { isSafeAvatar } = require('../src/utils/avatar');
const { csrfProtection, rotateCsrfToken, CSRF_COOKIE, CSRF_HEADER } = require('../src/middleware/csrf');
const { requireTurnstile } = require('../src/utils/turnstile');
const authController = require('../src/controllers/auth.controller');
const User = require('../src/models/User');
const { verifySession } = require('../src/middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;

// --- Mocks ---------------------------------------------------------------

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    cookies: {},
    cleared: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, opts) {
      this.cookies[name] = { value, opts };
      return this;
    },
    clearCookie(name) {
      this.cleared.push(name);
      return this;
    },
  };
}

function makeNext() {
  const calls = [];
  const next = (err) => calls.push(err);
  next.calls = calls;
  return next;
}

function makeFakeUser(overrides = {}) {
  const user = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Test User',
    email: 'test@example.com',
    phone: '03001234567',
    role: 'shopkeeper',
    status: 'active',
    verified: true,
    tokenVersion: 0,
    totpAttempts: 0,
    totpLockUntil: undefined,
    twoFactorEnabled: false,
    twoFactorSecret: undefined,
    twoFactorTempSecret: undefined,
    savedCount: 0,
    async save() {
      this.savedCount += 1;
    },
    toSafeJSON() {
      return { id: this._id, email: this.email, role: this.role };
    },
    ...overrides,
  };
  return user;
}

/** Replaces User.findById for one test; returns a restore function. */
function stubFindById(user) {
  const original = User.findById;
  // verifySession awaits findById() directly; the TOTP controllers await
  // findById().select('+...'). One stub serves both shapes: the returned
  // object is thenable (so await resolves to the user) and has .select().
  User.findById = () => ({
    select: async () => user,
    then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
  });
  return () => {
    User.findById = original;
  };
}

function totpSetup() {
  const secret = authenticator.generateSecret();
  const validCode = authenticator.generate(secret);
  const wrongCode = String((parseInt(validCode, 10) + 1) % 1000000).padStart(6, '0');
  assert.notEqual(wrongCode, validCode);
  return { secret, validCode, wrongCode };
}

function tempToken(id, purpose) {
  return jwt.sign({ id, purpose }, JWT_SECRET, { expiresIn: '5m' });
}

// --- totpLock helpers (M2) ------------------------------------------------

test('M2: 4 TOTP failures do not lock, the 5th locks for 15 minutes', () => {
  const user = {};
  for (let i = 1; i <= 4; i += 1) {
    assert.equal(recordTotpFailure(user).locked, false, `failure ${i} must not lock`);
    assert.equal(user.totpAttempts, i);
    assert.equal(isTotpLocked(user), false);
  }
  assert.equal(recordTotpFailure(user).locked, true);
  assert.equal(user.totpAttempts, 5);
  assert.equal(isTotpLocked(user), true);
  const mins = totpLockMinutesLeft(user);
  assert.ok(mins >= 14 && mins <= 15, `lock should be ~15 min, got ${mins}`);
});

test('M2: TOTP lock expires once lockUntil passes, and reset clears it', () => {
  const user = { totpAttempts: 5, totpLockUntil: new Date(Date.now() - 1000) };
  assert.equal(isTotpLocked(user), false);
  assert.equal(totpLockMinutesLeft(user), 0);
  const locked = { totpAttempts: 5, totpLockUntil: new Date(Date.now() + 15 * 60 * 1000) };
  assert.equal(isTotpLocked(locked), true);
  resetTotpAttempts(locked);
  assert.equal(locked.totpAttempts, 0);
  assert.equal(locked.totpLockUntil, undefined);
  assert.equal(isTotpLocked(locked), false);
});

// --- TOTP endpoints (M2) ---------------------------------------------------

test('M2: admin 2FA login locks after 5 wrong codes, even a right code then 403s', async () => {
  const { secret, validCode, wrongCode } = totpSetup();
  const user = makeFakeUser({ role: 'admin', twoFactorEnabled: true, twoFactorSecret: secret });
  const restore = stubFindById(user);
  try {
    const token = tempToken(user._id, '2fa');
    for (let i = 1; i <= 4; i += 1) {
      const res = makeRes();
      await authController.adminVerifyTwoFactorLogin(
        { body: { tempToken: token, token: wrongCode } }, res, makeNext()
      );
      assert.equal(res.statusCode, 401, `attempt ${i} should be 401`);
      assert.equal(res.body.error.code, 'INVALID_TWO_FACTOR_CODE');
    }
    const res5 = makeRes();
    await authController.adminVerifyTwoFactorLogin(
      { body: { tempToken: token, token: wrongCode } }, res5, makeNext()
    );
    assert.equal(res5.statusCode, 403);
    assert.equal(res5.body.error.code, 'TWO_FACTOR_LOCKED');
    assert.equal(user.totpAttempts, 5);
    assert.equal(isTotpLocked(user), true);

    // The correct code is refused while locked — the lock, not the code,
    // decides now.
    const res6 = makeRes();
    await authController.adminVerifyTwoFactorLogin(
      { body: { tempToken: token, token: validCode } }, res6, makeNext()
    );
    assert.equal(res6.statusCode, 403);
    assert.equal(res6.body.error.code, 'TWO_FACTOR_LOCKED');
  } finally {
    restore();
  }
});

test('M2: shopkeeper 2FA login succeeds after 2 wrong codes and resets the counter', async () => {
  const { secret, validCode, wrongCode } = totpSetup();
  const user = makeFakeUser({ role: 'shopkeeper', twoFactorEnabled: true, twoFactorSecret: secret });
  const restore = stubFindById(user);
  try {
    const token = tempToken(user._id, '2fa');
    for (let i = 1; i <= 2; i += 1) {
      const res = makeRes();
      await authController.verifyTwoFactorLogin(
        { body: { tempToken: token, token: wrongCode } }, res, makeNext()
      );
      assert.equal(res.statusCode, 401);
    }
    assert.equal(user.totpAttempts, 2);
    const res = makeRes();
    await authController.verifyTwoFactorLogin(
      { body: { tempToken: token, token: validCode } }, res, makeNext()
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.email, 'test@example.com');
    assert.equal(user.totpAttempts, 0, 'success resets the counter');
    assert.equal(user.tokenVersion, 1, 'success bumps the session version');
    assert.ok(res.cookies.asan_token, 'session cookie is issued');
  } finally {
    restore();
  }
});

test('M2: 2FA setup-first locks after 5 wrong codes and discards the pending secret', async () => {
  const { secret, validCode, wrongCode } = totpSetup();
  const user = makeFakeUser({ role: 'subadmin', twoFactorEnabled: false, twoFactorTempSecret: secret });
  const restore = stubFindById(user);
  try {
    const token = tempToken(user._id, '2fa-setup');
    for (let i = 1; i <= 4; i += 1) {
      const res = makeRes();
      await authController.verifyTwoFactorSetupFirst(
        { body: { tempToken: token, token: wrongCode } }, res, makeNext()
      );
      assert.equal(res.statusCode, 400, `attempt ${i} should be 400`);
      assert.equal(res.body.error.code, 'INVALID_TWO_FACTOR_CODE');
    }
    const res5 = makeRes();
    await authController.verifyTwoFactorSetupFirst(
      { body: { tempToken: token, token: wrongCode } }, res5, makeNext()
    );
    assert.equal(res5.statusCode, 403);
    assert.equal(res5.body.error.code, 'TWO_FACTOR_LOCKED');
    assert.equal(user.twoFactorTempSecret, undefined, 'pending secret is discarded on lock');
    assert.equal(isTotpLocked(user), true);
    // Even the right code cannot finish a discarded setup while locked.
    const res6 = makeRes();
    await authController.verifyTwoFactorSetupFirst(
      { body: { tempToken: token, token: validCode } }, res6, makeNext()
    );
    assert.equal(res6.statusCode, 403);
    assert.equal(res6.body.error.code, 'TWO_FACTOR_LOCKED');
  } finally {
    restore();
  }
});

test('M2: 2FA setup-first success enables 2FA and resets the counter', async () => {
  const { secret, validCode } = totpSetup();
  const user = makeFakeUser({ role: 'subadmin', twoFactorEnabled: false, twoFactorTempSecret: secret });
  const restore = stubFindById(user);
  try {
    const res = makeRes();
    await authController.verifyTwoFactorSetupFirst(
      { body: { tempToken: tempToken(user._id, '2fa-setup'), token: validCode } }, res, makeNext()
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.enabled, true);
    assert.equal(user.twoFactorEnabled, true);
    assert.equal(user.twoFactorSecret, secret);
    assert.equal(user.twoFactorTempSecret, undefined);
    assert.equal(user.totpAttempts, 0);
  } finally {
    restore();
  }
});

// --- Logout revocation (M1) + CSRF rotation (L7) ---------------------------

test('M1+L7: logout bumps tokenVersion so the old token dies, clears cookies, rotates CSRF', async () => {
  const user = makeFakeUser({ tokenVersion: 3 });
  const restore = stubFindById(user);
  try {
    const oldToken = signToken(user);
    // Sanity: the token is a live session before logout.
    const before = await verifySession(oldToken);
    assert.equal(before.error, undefined, 'token must verify before logout');
    assert.equal(before.user, user);

    const res = makeRes();
    const next = makeNext();
    await authController.logout({ user, cookies: {} }, res, next);
    assert.deepEqual(next.calls, [], 'logout must not call next(err)');
    assert.equal(user.tokenVersion, 4, 'logout bumps tokenVersion');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, message: 'Logged out.' });
    assert.ok(res.cleared.includes('asan_token'), 'asan_token cleared');
    assert.ok(res.cleared.includes('asan_admin_token'), 'asan_admin_token cleared');
    assert.ok(res.cookies[CSRF_COOKIE], 'CSRF token re-issued on logout');
    assert.match(res.cookies[CSRF_COOKIE].value, /^[0-9a-f]{64}$/);

    // The same token is now dead server-side.
    const after = await verifySession(oldToken);
    assert.ok(after.error, 'old token must be rejected after logout');
    assert.equal(after.error.code, 'SESSION_INVALIDATED');
    assert.equal(after.error.status, 401);
  } finally {
    restore();
  }
});

// --- JWT expiry → cookie maxAge (M4) ----------------------------------------

test('M4: jwtExpiryToMs derives milliseconds from JWT_EXPIRES_IN', () => {
  const prev = process.env.JWT_EXPIRES_IN;
  try {
    process.env.JWT_EXPIRES_IN = '7d';
    assert.equal(jwtExpiryToMs(), 7 * 24 * 60 * 60 * 1000);
    process.env.JWT_EXPIRES_IN = '24h';
    assert.equal(jwtExpiryToMs(), 24 * 60 * 60 * 1000);
    process.env.JWT_EXPIRES_IN = '30m';
    assert.equal(jwtExpiryToMs(), 30 * 60 * 1000);
    process.env.JWT_EXPIRES_IN = '90s';
    assert.equal(jwtExpiryToMs(), 90 * 1000);
    process.env.JWT_EXPIRES_IN = '3600';
    assert.equal(jwtExpiryToMs(), 3600 * 1000);
    process.env.JWT_EXPIRES_IN = 'garbage';
    assert.equal(jwtExpiryToMs(), 7 * 24 * 60 * 60 * 1000, 'unparseable falls back to 7d');
    delete process.env.JWT_EXPIRES_IN;
    assert.equal(jwtExpiryToMs(), 7 * 24 * 60 * 60 * 1000, 'unset falls back to 7d');
  } finally {
    if (prev === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = prev;
  }
});

// --- safeQuery (L1) ----------------------------------------------------------

test('L1: queryString never turns an object/array into a filter value', () => {
  assert.equal(queryString('basmati'), 'basmati');
  assert.equal(queryString(42), '42');
  assert.equal(queryString(undefined), undefined);
  assert.equal(queryString(''), undefined);
  assert.equal(queryString({ $ne: 'admin' }), null);
  assert.equal(queryString(['admin']), null);
});

test('L1: queryEnum enforces the allow-list', () => {
  const roles = ['shopkeeper', 'supplier', 'admin', 'subadmin'];
  assert.equal(queryEnum('admin', roles), 'admin');
  assert.equal(queryEnum('all', roles), null, "'all' is not a role — caller handles it first");
  assert.equal(queryEnum('nobody', roles), null);
  assert.equal(queryEnum({ $ne: 'admin' }, roles), null);
  assert.equal(queryEnum(undefined, roles), undefined);
});

// --- Avatar allow-list (L2) ---------------------------------------------------

test('L2: only http(s), relative paths and image data URLs are safe avatars', () => {
  assert.equal(isSafeAvatar(''), true);
  assert.equal(isSafeAvatar(undefined), true);
  assert.equal(isSafeAvatar('/uploads/avatars/a.png'), true);
  assert.equal(isSafeAvatar('https://cdn.example.com/a.png'), true);
  assert.equal(isSafeAvatar('http://localhost:5000/uploads/a.png'), true);
  assert.equal(isSafeAvatar('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeAvatar('data:image/jpeg;base64,/9j/4AAQ='), true);
  assert.equal(isSafeAvatar('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isSafeAvatar('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeAvatar('javascript:alert(1)'), false);
  assert.equal(isSafeAvatar('blob:https://example.com/uuid'), false);
  assert.equal(isSafeAvatar('data:image/png;notbase64,xxxx'), false);
  assert.equal(isSafeAvatar(42), false);
});

// --- CSRF rotation (L7) ---------------------------------------------------------

test('L7: rotateCsrfToken issues a fresh 64-hex token each time', () => {
  const res1 = makeRes();
  const first = rotateCsrfToken(res1);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(res1.cookies[CSRF_COOKIE].value, first);
  const res2 = makeRes();
  const second = rotateCsrfToken(res2);
  assert.notEqual(second, first, 'rotation must change the value');

  // The new token is accepted by the middleware (cookie + header match).
  const req = {
    method: 'POST',
    path: '/api/auth/logout',
    cookies: { [CSRF_COOKIE]: second },
    get: (name) => (String(name).toLowerCase() === CSRF_HEADER ? second : undefined),
  };
  let nextCalled = false;
  csrfProtection(req, makeRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

// --- Turnstile (M3) --------------------------------------------------------------

test('M3: Turnstile is skipped without a secret, and fail-closed with one', async () => {
  const prevSecret = process.env.TURNSTILE_SECRET_KEY;
  const prevFetch = global.fetch;
  try {
    delete process.env.TURNSTILE_SECRET_KEY;
    let nextCalled = false;
    await requireTurnstile({ body: {} }, makeRes(), () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, 'no secret → skipped (dev behaviour)');

    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    // Missing token → 403.
    const resMissing = makeRes();
    await requireTurnstile({ body: {}, ip: '127.0.0.1' }, resMissing, () => {});
    assert.equal(resMissing.statusCode, 403);
    assert.equal(resMissing.body.error.code, 'TURNSTILE_REQUIRED');

    // Failed verification → 403.
    global.fetch = async () => ({ ok: true, json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) });
    const resFail = makeRes();
    await requireTurnstile({ body: { turnstileToken: 'bad-token' }, ip: '127.0.0.1' }, resFail, () => {});
    assert.equal(resFail.statusCode, 403);
    assert.equal(resFail.body.error.code, 'TURNSTILE_FAILED');

    // siteverify itself errors → still 403 (fail-closed, never next()).
    global.fetch = async () => {
      throw new Error('network down');
    };
    const resErr = makeRes();
    let errNext = false;
    await requireTurnstile({ body: { turnstileToken: 'tok' }, ip: '127.0.0.1' }, resErr, () => {
      errNext = true;
    });
    assert.equal(resErr.statusCode, 403);
    assert.equal(errNext, false);

    // Successful verification → next().
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
    const resOk = makeRes();
    let okNext = false;
    await requireTurnstile({ body: { turnstileToken: 'good-token' }, ip: '127.0.0.1' }, resOk, () => {
      okNext = true;
    });
    assert.equal(okNext, true);
  } finally {
    if (prevSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = prevSecret;
    global.fetch = prevFetch;
  }
});
