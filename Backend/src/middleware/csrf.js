/**
 * CSRF protection — double-submit token (New audit #20).
 *
 * The site authenticates with httpOnly cookies (asan_token) and SameSite=Lax,
 * which already blocks most cross-site request forgery — but SameSite=Lax
 * still sends cookies on top-level GET navigations, and a same-site (but
 * attacker-controlled) subdomain or a Lax bypass would leave state-changing
 * calls exposed. This middleware is defense-in-depth, not a rewrite:
 *
 *   • GET /api/* — the server sets a NON-httpOnly `asan_csrf` cookie when
 *     the browser has none, and exposes the same value as req.csrfToken.
 *     The value is random per browser (crypto.randomBytes), 24 h expiry.
 *   • POST / PUT / PATCH / DELETE /api/* — the request must carry the same
 *     value in the `x-csrf-token` header. Mismatch or missing token → 403
 *     { error: { code: 'CSRF_TOKEN_INVALID' } } in the standard envelope.
 *
 * Why the header can be read by our frontend but not by an attacker:
 *   • Localhost — frontend (:3000) and backend (:5000) share the host
 *     `localhost` (cookies ignore ports), so the frontend reads the token
 *     straight from document.cookie.
 *   • Production — Vercel frontend and Render backend are different hosts,
 *     so JS cannot read the cookie; instead GET /api/auth/csrf-token
 *     returns the same value in its JSON body (see auth.routes.js). The
 *     attacker site can do neither: CORS blocks it from reading the JSON,
 *     and it cannot set a custom header cross-origin (preflight).
 *
 * The token is NOT tied to the session (plain double-submit) — no server
 * state, no DB call. It is issued once per browser and re-issued when
 * missing/expired; since Batch 17 it is ALSO rotated on every login and
 * logout (rotateCsrfToken, called from the auth controller), so a token
 * leaked before a sign-in dies with the old session. The frontend drops
 * its cached copy after login/logout and re-reads the fresh cookie.
 * Non-browser clients (curl/Postman) must GET /api/auth/csrf-token first
 * and send the value back as `x-csrf-token` with the cookie attached.
 */

const crypto = require('crypto');

const CSRF_COOKIE = 'asan_csrf';
const CSRF_HEADER = 'x-csrf-token';
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function issueToken(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // the frontend JS must read it (double-submit)
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
  return token;
}

/**
 * Batch 17 (L7) — rotate the double-submit token: issue a fresh value
 * and set the cookie on this response. Called after a session is
 * created (login / 2FA login) and after it is destroyed (logout), so a
 * leaked token never survives a sign-in boundary. The old value stops
 * matching the cookie immediately — the frontend clears its in-memory
 * cache on login/logout and re-reads the cookie (or the 403 retry path
 * fetches a fresh one).
 */
function rotateCsrfToken(res) {
  return issueToken(res);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function csrfProtection(req, res, next) {
  // Only API calls — static uploads, /api/health and the Next.js pages
  // themselves never need a token (health is a GET anyway).
  if (!req.path.startsWith('/api/')) return next();

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    // Hand the browser a token if it has none yet, and expose the value
    // on the request so GET /api/auth/csrf-token can return it in JSON.
    const existing = req.cookies && req.cookies[CSRF_COOKIE];
    req.csrfToken = existing || issueToken(res);
    return next();
  }

  if (!STATE_CHANGING_METHODS.has(req.method)) return next();

  const cookie = req.cookies && req.cookies[CSRF_COOKIE];
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || !safeEqual(cookie, header)) {
    return res.status(403).json({
      error: {
        code: 'CSRF_TOKEN_INVALID',
        message: 'Invalid or missing CSRF token. Refresh the page and try again.',
      },
    });
  }
  return next();
}

module.exports = { csrfProtection, rotateCsrfToken, CSRF_COOKIE, CSRF_HEADER };
