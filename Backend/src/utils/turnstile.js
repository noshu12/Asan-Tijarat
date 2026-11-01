// turnstile.js — Cloudflare Turnstile bot protection (#6 pre-deploy).
//
// Drop `requireTurnstile` in front of the public form endpoints
// (register, login, forgot-password, contact). The frontend renders the
// Turnstile widget (site key = NEXT_PUBLIC_TURNSTILE_SITE_KEY) and sends
// the token as `turnstileToken` in the request body.
//
// Behavior:
// - TURNSTILE_SECRET_KEY not set → verification SKIPPED (local dev keeps
//   working; removing the secret is also the documented kill-switch).
// - Secret set + token missing/invalid → 403 (fail-closed: a security
//   feature must not silently disable itself).

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function isTurnstileEnabled() {
  return Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim());
}

async function verifyTurnstileToken(token, remoteIp) {
  const secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: remoteIp || '',
    }),
  });
  if (!res.ok) {
    throw new Error(`Turnstile siteverify HTTP ${res.status}`);
  }
  return res.json(); // { success: boolean, 'error-codes': [...] }
}

async function requireTurnstile(req, res, next) {
  try {
    if (!isTurnstileEnabled()) return next();
    const token = ((req.body && req.body.turnstileToken) || '').toString().trim();
    if (!token) {
      return res.status(403).json({
        error: { code: 'TURNSTILE_REQUIRED', message: 'Bot verification is required. Please complete the check and try again.' },
      });
    }
    const result = await verifyTurnstileToken(token, req.ip);
    if (result && result.success) return next();
    console.log('[turnstile] verification failed:', result && result['error-codes']);
    return res.status(403).json({
      error: { code: 'TURNSTILE_FAILED', message: 'Bot verification failed. Please try again.' },
    });
  } catch (err) {
    // Fail closed: when the secret is configured, a broken verification
    // path must not silently let bots through.
    console.log('[turnstile] verify error (fail-closed):', err.message);
    return res.status(403).json({
      error: { code: 'TURNSTILE_FAILED', message: 'Bot verification failed. Please try again.' },
    });
  }
}

module.exports = { isTurnstileEnabled, verifyTurnstileToken, requireTurnstile };
