// ────────────────────────────────────────────────────────────
//  Asan Tijarat — Backend entry point
//  Express + MongoDB (Mongoose)
// ────────────────────────────────────────────────────────────
require('dotenv').config();

// JWT secret ke baghair server chalana mana hai — warna har token
// ek known/empty secret se sign hoga. Missing ho to server ruk jaye,
// chup-chap chalna nahi.
if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
  console.error('[server] ❌ JWT_SECRET is missing in .env. Server will not start.');
  console.error('[server]   → set a long random JWT_SECRET in Backend/.env and restart.');
  process.exit(1);
}

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const { checkDb } = require('./src/middleware/auth');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

const app = express();

// Helmet: security headers. cross-origin isliye rakha hai taake
// frontend (localhost:3000) se product images (localhost:5000)
// block na hon — warna helmet ka default same-origin images rok dega.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// --- Global middleware -------------------------------------------------
// Browser origins allowed to call this API.
//
// `CLIENT_ORIGIN` may be a comma-separated list (e.g. a LAN IP for testing on
// a phone), but local development is auto-allowed on ANY port and on both
// `localhost` and `127.0.0.1`. Without that, a dev server that fell back to
// :3001 (because :3000 was already in use) fails every request with an opaque
// "Cannot reach the API server" error in the browser — the request is actually
// blocked by CORS, not by a missing backend.
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Unset or "*" keeps the original permissive default.
const ALLOW_ANY_ORIGIN = CLIENT_ORIGINS.length === 0 || CLIENT_ORIGINS.includes('*');

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

function isAllowedOrigin(origin) {
  // Same-origin requests, curl and server-to-server calls send no Origin.
  if (!origin) return true;
  if (ALLOW_ANY_ORIGIN) return true;
  if (CLIENT_ORIGINS.includes(origin)) return true;

  try {
    const { protocol, hostname } = new URL(origin);
    return (protocol === 'http:' || protocol === 'https:') && LOOPBACK_HOSTS.includes(hostname);
  } catch {
    return false;
  }
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
// 25MB: registration attaches up to three KYC documents (CNIC front/back +
// NTN, 5MB each) as base64 data URLs — see src/utils/kycStorage.js.
app.use(express.json({ limit: '25mb' }));

// asan_token cookie ko sahi tareeqe se parse karne ke liye.
// Is se pehle protect middleware cookie ko haath se parse kar raha tha.
app.use(cookieParser());

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

// Sirf product images public hain. KYC folder yahan se HATA diya gaya hai,
// warna /uploads/kyc/<file> bina login ke khul jata tha.
// Admin ke liye KYC preview baad mein ek authenticated route se wapas
// aayega — tab tak admin mein KYC image ka 404 aana normal hai, bug nahi.
app.use('/uploads/products', express.static(path.join(__dirname, 'uploads', 'products')));

// Fast 503 while the DB is down — no slow mongoose timeouts.
app.use(checkDb);

// --- Routers -----------------------------------------------------------
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/products', require('./src/routes/product.routes'));
app.use('/api/orders', require('./src/routes/order.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/public', require('./src/routes/public.routes'));


// Health check: `GET /api/health` -> { status, db }
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'asan-tijarat-backend',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use(notFound);
app.use(errorHandler);

// --- Boot -----------------------------------------------------------------
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[server] ✅ http://localhost:${PORT}`);
      console.log(`[server] health → http://localhost:${PORT}/api/health`);
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
