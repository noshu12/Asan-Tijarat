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

module.exports = { signToken, verifyToken };
