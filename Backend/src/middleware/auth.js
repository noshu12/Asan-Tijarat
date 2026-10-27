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
    const token = req.cookies ? req.cookies.asan_token : null;

    if (!token) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'No token provided. Login required.' },
      });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        error: { code: 'TOKEN_INVALID', message: 'Session expired or token invalid. Sign in again.' },
      });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'The account for this session no longer exists.' },
      });
    }

    // A pending (unverified) shopkeeper/supplier is not an active account: even
    // a previously-valid token is refused until an admin verifies the KYC.
    if (user.role !== 'admin' && !user.verified) {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_PENDING_VERIFICATION',
          message: 'Your account is awaiting admin verification. Once verified, you can sign in and continue.',
        },
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

module.exports = { checkDb, protect, requireAuth: protect, requireRole };
