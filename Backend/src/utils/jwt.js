const jwt = require('jsonwebtoken');

/**
 * Signs a login token. Payload aur expiry wahi hai jo
 * auth.controller.js ka signToken use karta tha, taake purane
 * login behaviour mein koi farq na aaye.
 */
function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * Verifies a token. Invalid/expired ho to throw karta hai,
 * caller (protect) usay 401 mein badalta hai.
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * Parses the JWT expiry into milliseconds, from the SAME value the token
 * itself is signed with (JWT_EXPIRES_IN || '7d'). Batch 17 (Round-5
 * audit M4): the session cookie used to hardcode 7 days while the token
 * used JWT_EXPIRES_IN, so the two drifted apart whenever the env var
 * changed. Both issueAuthCookie() and issueAdminAuthCookie() now use
 * this, so cookie and token always die together.
 *
 * Accepted: '90s' / '30m' / '24h' / '7d' (jsonwebtoken strings), or a
 * plain number = seconds (jsonwebtoken's numeric form). Anything
 * unparseable falls back to 7 days — the same default as signToken.
 */
function jwtExpiryToMs() {
  const raw = String(process.env.JWT_EXPIRES_IN || '7d').trim();
  const match = /^(\d+)\s*([smhd])$/.exec(raw);
  if (match) {
    const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    return Number(match[1]) * multipliers[match[2]];
  }
  if (/^\d+$/.test(raw)) return Number(raw) * 1000; // plain seconds
  return 7 * 24 * 60 * 60 * 1000;
}

module.exports = { signToken, verifyToken, jwtExpiryToMs };
