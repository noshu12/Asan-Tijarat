// ────────────────────────────────────────────────────────────
//  Asan Tijarat — Backend entry point
//  Express + MongoDB (Mongoose)
// ────────────────────────────────────────────────────────────
require('dotenv').config();

// JWT secret ke baghair server chalana mana hai — warna har token
// ek known/empty secret se sign hoga. Missing ho to server ruk jaye,
// chup-chap chalna nahi.
// Batch 17 (M4) — sirf non-empty hona kaafi nahi: 4-character secret se
// bhi token sign ho jate thay aur forgeable ho jate thay. Ab 32 chars se
// chhota secret bhi boot refuse karta hai (dev me bhi — warna local
// secret production me copy ho jata). Generate:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim() || process.env.JWT_SECRET.trim().length < 32) {
  console.error('[server] ❌ JWT_SECRET is missing or shorter than 32 characters in .env. Server will not start.');
  console.error('[server]   → set a long random JWT_SECRET (at least 32 characters) in Backend/.env and restart.');
  process.exit(1);
}

// FIX (Batch 01) — Production me chup-chap fail hona band karo.
// Pehle Cloudinary / Brevo / NODE_ENV missing hone pe server chalta rehta
// tha, lekin uploads wipe ho jate thay aur OTP emails kabhi nahi jati thi.
// Ab production me zaroori vars missing hon to server start hi nahi hoga,
// aur saaf batayega ke kya missing hai. Local dev me sirf warning milegi.
if (process.env.NODE_ENV === 'production') {
  const missingProdVars = [];
  if (!process.env.BREVO_API_KEY) missingProdVars.push('BREVO_API_KEY (warna OTP/reset/approval emails kabhi nahi jayengi)');
  if (!process.env.ENCRYPTION_KEY) missingProdVars.push('ENCRYPTION_KEY (warna CNIC/NTN encrypt nahi hoga, register fail hoga)');
  if (process.env.USE_CLOUDINARY !== 'true') missingProdVars.push('USE_CLOUDINARY=true (warna uploads Render ki ephemeral disk pe jayenge aur wipe ho jayenge)');
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    missingProdVars.push('CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET (Cloudinary on karne ke liye)');
  }
  if (!process.env.MONGO_URI) missingProdVars.push('MONGO_URI (Atlas connection string)');
  // Batch 17 (M3) — Turnstile fail-open band karo: TURNSTILE_SECRET_KEY
  // unset ho to requireTurnstile chup-chap `next()` kar deta hai, is liye
  // production bina bot protection ke chal sakta tha, bina warning ke.
  // Ab production boot iske baghair ruk jata hai.
  if (!process.env.TURNSTILE_SECRET_KEY) missingProdVars.push('TURNSTILE_SECRET_KEY (warna Turnstile checks silently off rehte hain — bot protection nahi)');
  if (missingProdVars.length > 0) {
    console.error('[server] ❌ Production config incomplete — server will not start:');
    missingProdVars.forEach((v) => console.error(`[server]   - ${v}`));
    console.error('[server]   → Render dashboard > Environment me ye vars set karo, phir redeploy karo.');
    process.exit(1);
  }
} else {
  // Dev me sirf warn karo, rokna nahi — local kaam chalta rehna chahiye.
  if (!process.env.BREVO_API_KEY) console.warn('[server] ⚠️  BREVO_API_KEY missing — emails nahi jayengi (dev only).');
  if (process.env.USE_CLOUDINARY !== 'true') console.warn('[server] ⚠️  USE_CLOUDINARY != true — uploads local disk pe jayenge (dev only).');
  if (!process.env.NODE_ENV) console.warn('[server] ⚠️  NODE_ENV unset — Render pe isko "production" set karna lazmi hai.');
}

// Batch 18 (audit M6) — the platform fee silently becomes 0% when
// PLATFORM_FEE_PERCENT is unset or garbage, so a lost Render env var
// used to give away 2% on every order with no trace. Check LOUDLY at
// every boot (missing/invalid = big red error in the logs, set = one
// confirming line). Never stops the boot — 0% is the safe fallback.
require('./src/utils/payment').checkFeeConfig();

const path = require('path');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const { checkDb } = require('./src/middleware/auth');
const { csrfProtection } = require('./src/middleware/csrf');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

const app = express();
// FIX (Batch 01) — Render ke proxy ke peeche 'loopback' se real client IP
// nahi milta tha, is liye rate-limit aur Turnstile galat IP pe lagte thay.
// Render 1 proxy hop peeche hai, is liye trust proxy = 1.
app.set('trust proxy', 1);

// Helmet: security headers. cross-origin isliye rakha hai taake
// frontend (localhost:3000) se product images (localhost:5000)
// block na hon — warna helmet ka default same-origin images rok dega.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// --- Global middleware -------------------------------------------------
// CORS: sirf allow-list, koi wildcard / khali fallback nahi.
//
// `CLIENT_ORIGIN` comma-separated list hai, jaise:
//   CLIENT_ORIGIN=http://localhost:3000
// Production me yahan deployed frontend ka URL likhna lazmi hai.
// `*` likhne par bhi allow nahi hoga — wildcard ko ignore kar ke warning
// di jayegi, kyunki credentials:true ke saath wildcard sab se khatarnak hai.
//
// Development me (NODE_ENV=production NA ho) localhost/127.0.0.1 kisi bhi
// port par allow hai, taake :3000 busy ho to :3001 bhi chal jaye.
// Production me loopback bhi allow NAHI hai — sirf CLIENT_ORIGIN list chalegi.
// Origin na bhejne wali calls (curl, Postman, server-to-server) pehle ki
// tarah allow hain, wo browser CORS ka hissa nahi hain.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .filter((origin) => {
    if (origin === '*') {
      console.warn('[server] ⚠️  CLIENT_ORIGIN contains "*", ignoring it. Set explicit origins instead.');
      return false;
    }
    return true;
  });

// FIX (Audit fix #7) — production me CLIENT_ORIGIN khali ho to CORS
// chup-chap har browser origin ko mana kar dega (secure default, lekin
// site ka har API call fail hoga). Is liye boot pe zor se bata do.
// Render pe lazmi set karo: CLIENT_ORIGIN=https://asan-tijarat.vercel.app
// (wildcard `*` yahan kabhi allow nahi hota — upar filter kar diya gaya
// hai — is liye live site pe `access-control-allow-origin: *` nahi aana
// chahiye; agar audit me dikha to Render ka deploy purana tha).
if (IS_PRODUCTION && CLIENT_ORIGINS.length === 0) {
  console.warn('[server] ⚠️  CLIENT_ORIGIN is empty in production — every browser origin will be refused by CORS.');
  console.warn('[server]   → set CLIENT_ORIGIN=https://asan-tijarat.vercel.app on Render and redeploy.');
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

function isAllowedOrigin(origin) {
  // Same-origin requests, curl aur server-to-server calls Origin nahi bhejte.
  if (!origin) return true;
  if (CLIENT_ORIGINS.includes(origin)) return true;

  // Loopback sirf development me, production me kabhi nahi.
  if (!IS_PRODUCTION) {
    try {
      const { protocol, hostname } = new URL(origin);
      if ((protocol === 'http:' || protocol === 'https:') && LOOPBACK_HOSTS.includes(hostname)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      // Rejecting with `false` simply omits the ACAO header, so the browser
      // blocks the response — no need for a 500 from the error handler.
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  })
);
// FIX (New audit #9) — the 25 MB JSON limit was global, so EVERY route
// (/api/products, /api/public/contact, ...) accepted a 25 MB body. Only
// the routes that carry base64 file uploads need it:
//   • POST /api/auth/register — KYC docs (3 × 5 MB, see kycStorage.js)
//   • POST /api/products + PATCH /api/products/:id — photos (5 × 5 MB)
//   • POST /api/orders/:id/delivery-proof — one 5 MB photo
//   • POST /api/public/contact — pictures (3 × 5 MB, see public.controller.js)
// The upload parser runs FIRST for those routes: body-parser marks the
// request parsed (req._body), so the global 1 MB parser below skips it.
// A body over the route limit is rejected with 413 before any controller,
// Turnstile check or DB call runs. (The report suggested 25 MB only on
// register, but product photos and the delivery proof are base64 too —
// a 1 MB global limit alone would have broken both flows.)
//
// Batch 19 (Round-5 audit M4) — product routes are now 35 MB, not 25:
// 5 × 5 MB of binary is 25 MB, but base64 inflates it by 4/3, so five
// near-max photos are ~33 MB on the wire + JSON overhead — the old
// 25 MB limit 413'd a legal upload before validation ever ran, even
// though server.js's own comment claimed "photos (5 × 5 MB)" were
// covered. 35 MB covers the worst legal case; register (3 × 5 MB →
// ~20 MB base64) and delivery proof (1 × 5 MB → ~6.7 MB) still fit
// comfortably in 25 MB, so their limits stay as-is.
//
// Batch 19 (audit M3) — PATCH /api/auth/me gets its own 5 MB parser:
// the Settings avatar is a base64 data URL of a file up to 2 MB
// (~2.7 MB on the wire), which the global 1 MB limit 413'd even though
// the UI explicitly allows 2 MB. 5 MB leaves headroom for the avatar +
// the other profile fields; everything else stays at the 1 MB global.
const JSON_UPLOAD_LIMIT = '25mb';
const PRODUCT_JSON_LIMIT = '35mb';
app.post('/api/auth/register', express.json({ limit: JSON_UPLOAD_LIMIT }));
app.post('/api/products', express.json({ limit: PRODUCT_JSON_LIMIT }));
app.patch('/api/products/:id', express.json({ limit: PRODUCT_JSON_LIMIT }));
app.post('/api/orders/:id/delivery-proof', express.json({ limit: JSON_UPLOAD_LIMIT }));
app.post('/api/public/contact', express.json({ limit: JSON_UPLOAD_LIMIT }));
app.patch('/api/auth/me', express.json({ limit: '5mb' }));
// Everything else: 1 MB is plenty — all other bodies are plain fields.
app.use(express.json({ limit: '1mb' }));

// asan_token cookie ko sahi tareeqe se parse karne ke liye.
// Is se pehle protect middleware cookie ko haath se parse kar raha tha.
app.use(cookieParser());

// Batch 14 (item 7) — gzip compress API responses. Render adds no
// compression in front of the service, so the app must do it itself.
// Defaults (gzip, threshold 1kb) — nothing to tune. Body parsing is
// already done above; routers mount below.
app.use(compression());

// Rate limits: brute-force aur flood se bachao. Ye frontend ke
// { error: { code, message } } format mein jawab deta hai.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please try again in a few minutes.' } },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Please try again in a few minutes.' } },
});
app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

// FIX (New audit #20) — CSRF double-submit token. Mounted after the rate
// limiters (so a flood is still rate-limited) and after cookieParser (the
// token is read from req.cookies). Verifies x-csrf-token == asan_csrf
// cookie on every state-changing /api call; GETs just get a token issued.
// Runs before checkDb so the token is available even while the DB is down.
app.use(csrfProtection);

// Sirf product images public hain. KYC folder yahan se HATA diya gaya hai,
// warna /uploads/kyc/<file> bina login ke khul jata tha.
// Admin ke liye KYC preview baad mein ek authenticated route se wapas
// aayega — tab tak admin mein KYC image ka 404 aana normal hai, bug nahi.
app.use('/uploads/products', express.static(path.join(__dirname, 'uploads', 'products')));
// Batch 05 — delivery-proof photos (supplier uploads at delivery). Public
// like product photos: both trading parties + admin must open them.
app.use('/uploads/delivery', express.static(path.join(__dirname, 'uploads', 'delivery')));

// FIX (Batch 01) — Health check ko checkDb se PEHLE rakho.
// Pehle checkDb /api/health se pehle chalta tha, to DB down ho to health
// endpoint khud 503 deta tha — Render ke health check ke liye bekaar tha.
// Ab /api/health hamesha jawab dega (db: connected/disconnected batayega),
// aur baaki /api/* routes pehle ki tarah DB down hone pe 503 denge.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'asan-tijarat-backend',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// FIX (New audit #20) — CSRF token endpoint, defined here (next to
// /api/health) instead of auth.routes.js on purpose: it must work even
// while the DB is down, and checkDb below 503s every router-mounted
// route when Mongo is unreachable. The csrfProtection middleware above
// already set the asan_csrf cookie on this GET and exposed the value as
// req.csrfToken; this returns the same value in JSON for the cross-origin
// case (the Vercel frontend cannot read the Render cookie from
// document.cookie). Public — the token is useless without the matching
// cookie, which only this browser holds.
app.get('/api/auth/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken || '' });
});

// Fast 503 while the DB is down — no slow mongoose timeouts.
app.use(checkDb);

// --- Routers -----------------------------------------------------------
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/products', require('./src/routes/product.routes'));
app.use('/api/orders', require('./src/routes/order.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/public', require('./src/routes/public.routes'));
app.use('/api/analytics', require('./src/routes/analytics.routes'));
// Batch 05 — real notifications, disputes, ratings.
app.use('/api/notifications', require('./src/routes/notification.routes'));
app.use('/api/disputes', require('./src/routes/dispute.routes'));
app.use('/api/ratings', require('./src/routes/rating.routes'));
// Batch 13 — realtime SSE stream (GET /api/realtime/stream).
app.use('/api/realtime', require('./src/routes/realtime.routes'));


// (Health check upar move kar diya hai — checkDb se pehle — taake Render
// ka health check DB down hone pe bhi kaam kare.)
app.use(notFound);
app.use(errorHandler);

// --- Boot -----------------------------------------------------------------
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[server] ✅ listening on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
      console.log(`[server] health → /api/health`);
    });
  } catch (err) {
    console.error(`[server] ❌ Could not connect to MongoDB: ${err.message}`);
    console.error('[server]   → start MongoDB locally  (mongod)');
    console.error('[server]   → or set MONGO_URI in .env  (e.g. MongoDB Atlas)');
    console.error('[server]   Server will still boot but /api/* returns 503 DB_UNREACHABLE.');

    app.listen(PORT, () => {
      console.log(`[server] ⚠️ http://localhost:${PORT}  (DB disconnected)`);
    });
  }
}

start();
