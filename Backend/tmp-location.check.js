// ────────────────────────────────────────────────────────────
//  currentLocation (device GPS) — end-to-end API check
//  Run AFTER `npm start`:   node tmp-location.check.js
//
//    POST  /api/auth/register → { lat, lng } stored (shopkeeper + supplier)
//                               invalid coordinates → 400 INVALID_LOCATION
//    PATCH /api/auth/me       → point updatable, `null` clears it
//    GET   /api/admin/users   → Admin Dashboard payload carries the point
//  Throwaway accounts only — deleted at the end.
// ────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./src/models/User');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
let passed = 0;
let failed = 0;

const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
};

async function req(method, route, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

(async () => {
  console.log('\n[tmp:location] running...');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  const stamp = Date.now();
  const SHOP = { email: `loc-shop-${stamp}@test.local`, phone: `0300-loc-shop-${stamp}` };
  const SUP = { email: `loc-sup-${stamp}@test.local`, phone: `0300-loc-sup-${stamp}` };
  const ADMIN = { email: `loc-admin-${stamp}@test.local`, phone: `0300-loc-admin-${stamp}` };

  // 1) Registration stores the GPS point for both roles.
  const reg = await req('POST', '/api/auth/register', {
    body: {
      name: 'Loc Check Shopkeeper', email: SHOP.email, phone: SHOP.phone, password: 'password123',
      role: 'shopkeeper', businessName: 'Loc Check Mart', houseAddress: 'House 1, Gulberg',
      currentHouseLocation: 'Gulberg, Lahore', currentLocation: { lat: 31.5204, lng: 74.3587 },
    },
  });
  check('register shopkeeper -> 201', reg.status === 201, `(HTTP ${reg.status})`);
  check('registration response carries currentLocation', reg.json?.user?.currentLocation?.lat === 31.5204 && reg.json?.user?.currentLocation?.lng === 74.3587);

  const supReg = await req('POST', '/api/auth/register', {
    body: {
      name: 'Loc Check Supplier', email: SUP.email, phone: SUP.phone, password: 'password123',
      role: 'supplier', businessName: 'Loc Check Traders', houseAddress: 'Plot 7, Clifton',
      currentHouseLocation: 'Clifton, Karachi', currentLocation: { lat: 24.8607, lng: 67.0011 },
    },
  });
  check('register supplier -> 201 with GPS point', supReg.status === 201 && supReg.json?.user?.currentLocation?.lat === 24.8607, `(HTTP ${supReg.status})`);

  // 2) Persisted in MongoDB — not just echoed back.
  const stored = await User.findOne({ email: SHOP.email.toLowerCase() }).lean();
  check('GPS point persisted in DB', stored?.currentLocation?.lat === 31.5204 && stored?.currentLocation?.lng === 74.3587, JSON.stringify(stored?.currentLocation));

  // 3) Invalid coordinates rejected at registration.
  const badReg = await req('POST', '/api/auth/register', {
    body: {
      name: 'Bad Loc', email: `loc-bad-${stamp}@test.local`, phone: `0300-loc-bad-${stamp}`,
      password: 'password123', role: 'supplier', currentLocation: { lat: 999, lng: 0 },
    },
  });
  check('register with invalid coordinates -> 400 INVALID_LOCATION', badReg.status === 400 && badReg.json?.error?.code === 'INVALID_LOCATION', `(HTTP ${badReg.status})`);

  // 4) Settings-style update (approve the throwaway shopkeeper first).
  await User.updateOne({ email: SHOP.email.toLowerCase() }, { $set: { verified: true } });
  const login = await req('POST', '/api/auth/login', { body: { identifier: SHOP.email, password: 'password123' } });
  check('shopkeeper login -> 200', login.status === 200 && !!login.json?.token, `(HTTP ${login.status})`);
  const token = login.json?.token;

  const upd = await req('PATCH', '/api/auth/me', { token, body: { currentLocation: { lat: 31.4697, lng: 74.2728 } } });
  check('PATCH updates the GPS point -> 200', upd.status === 200 && upd.json?.user?.currentLocation?.lat === 31.4697, `(HTTP ${upd.status})`);

  const badUpd = await req('PATCH', '/api/auth/me', { token, body: { currentLocation: { lat: 'x', lng: 0 } } });
  check('PATCH with invalid coordinates -> 400 INVALID_LOCATION', badUpd.status === 400 && badUpd.json?.error?.code === 'INVALID_LOCATION', `(HTTP ${badUpd.status})`);

  // 5) Admin Dashboard payload.
  await User.create({ name: 'Loc Check Admin', email: ADMIN.email, phone: ADMIN.phone, password: 'password123', role: 'admin', verified: true });
  const adminLogin = await req('POST', '/api/auth/login', { body: { identifier: ADMIN.email, password: 'password123' } });
  const adminToken = adminLogin.json?.token;

  const listShop = await req('GET', `/api/admin/users?search=${encodeURIComponent(SHOP.email)}`, { token: adminToken });
  const listedShop = (listShop.json?.users || []).find((u) => u.email === SHOP.email);
  check('admin payload has the updated GPS point', listedShop?.currentLocation?.lat === 31.4697 && listedShop?.currentLocation?.lng === 74.2728, JSON.stringify(listedShop?.currentLocation));

  const listSup = await req('GET', `/api/admin/users?search=${encodeURIComponent(SUP.email)}`, { token: adminToken });
  const listedSup = (listSup.json?.users || []).find((u) => u.email === SUP.email);
  check('admin payload has the supplier GPS point', listedSup?.currentLocation?.lat === 24.8607 && listedSup?.currentLocation?.lng === 67.0011);

  // 6) `null` clears the stored point.
  const clr = await req('PATCH', '/api/auth/me', { token, body: { currentLocation: null } });
  const afterClear = await req('GET', '/api/auth/me', { token });
  check('currentLocation: null clears the point', clr.status === 200 && !afterClear.json?.user?.currentLocation, `(HTTP ${clr.status})`);

  // 7) Cleanup — remove every throwaway account this script created.
  const cleanup = await User.deleteMany({
    email: { $in: [SHOP.email, SUP.email, ADMIN.email].map((e) => e.toLowerCase()) },
  });
  check('cleanup removed the throwaway accounts', cleanup.deletedCount === 3, `deleted=${cleanup.deletedCount}`);

  await mongoose.disconnect();
  console.log(`\n[tmp:location] ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  console.error('\n[tmp:location] ❌ failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});

