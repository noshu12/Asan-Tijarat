const mongoose = require('mongoose');
const User = require('../models/User');
const { verifyToken } = require('../utils/jwt');

/**
 * Rejects requests while MongoDB is not connected so callers
 * get a fast, readable 503 instead of a slow mongoose timeout.
 */
function checkDb(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: {
        code: 'DB_UNREACHABLE',
        message: 'Database is not connected. Start MongoDB and try again.',
      },
    });
  }
  next();
}

/**
 * Verifies `asan_token` httpOnly cookie and loads the user onto req.user.
 * Cookie-parser (server.js mein laga hua) se seedha req.cookies se
 * milta hai — haath se regex parse karne ki zaroorat nahi.
 */
async function protect(req, res, next) {
  try {
    // Admin cookie first: an admin browsing the main site keeps working,
    // and /api/auth/me resolves for both session types.
    const token = req.cookies ? req.cookies.asan_admin_token || req.cookies.asan_token : null;
    const { user, error } = await verifySession(token);
    if (error) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verifies one session token and returns { user } or { error }.
 * Shared by protect() and protectAdmin() — the only difference is which
 * cookie the token comes from.
 */
async function verifySession(token) {
  if (!token) {
    return { error: { status: 401, code: 'UNAUTHORIZED', message: 'No token provided. Login required.' } };
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return { error: { status: 401, code: 'TOKEN_INVALID', message: 'Session expired or token invalid. Sign in again.' } };
  }

  const user = await User.findById(payload.id);
  if (!user) {
    return { error: { status: 401, code: 'USER_NOT_FOUND', message: 'The account for this session no longer exists.' } };
  }

  // Session invalidation: the login JWT carries the tokenVersion that was
  // current when it was issued. A password change bumps the version, so any
  // older token is dead — the holder must sign in again. `?? 0` keeps
  // pre-change tokens (which carry no version) working until the first
  // password change, so nobody is logged out by the deploy itself.
  const tokenVersion = payload.tokenVersion ?? 0;
  if (tokenVersion !== (user.tokenVersion || 0)) {
    return {
      error: {
        status: 401,
        code: 'SESSION_INVALIDATED',
        message: 'Your password was changed. Please sign in again.',
      },
    };
  }

  // A pending (unverified) shopkeeper/supplier is not an active account: even
  // a previously-valid token is refused until an admin verifies the KYC.
  // (Admins and sub-admins bypass the verified check — same as before.)
  if (user.role !== 'admin' && user.role !== 'subadmin' && !user.verified) {
    return {
      error: {
        status: 403,
        code: 'ACCOUNT_PENDING_VERIFICATION',
        message: 'Your account is awaiting admin verification. Once verified, you can sign in and continue.',
      },
    };
  }

  return { user };
}

/**
 * Admin-only guard for /api/admin/* routes.
 * Accepts ONLY the host-only asan_admin_token cookie — a regular asan_token
 * (even one belonging to an admin, e.g. from before this change) can never
 * open admin APIs. Pair with requireRole('admin', ...) as before.
 */
async function protectAdmin(req, res, next) {
  try {
    const token = req.cookies ? req.cookies.asan_admin_token : null;
    const { user, error } = await verifySession(token);
    if (error) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Admin access required.' },
      });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
/**
 * Route guard: only roles passed in are allowed past this point.
 * Usage: router.patch('/:id', protect, requireRole('supplier'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'ROLE_FORBIDDEN',
          message: `This action is only available to ${roles.join(' or ')} accounts.`,
        },
      });
    }
    next();
  };
}

module.exports = { checkDb, protect, protectAdmin, requireAuth: protect, requireRole };
