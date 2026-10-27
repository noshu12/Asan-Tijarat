// ────────────────────────────────────────────────────────────
//  House Address / Current House Location — end-to-end API check
//  Run AFTER `npm start`:   node tmp-address.check.js
//
//  Verifies the new residential registration fields across the whole flow:
//    POST  /api/auth/register → stored on the account (shopkeeper + supplier)
//    PATCH /api/auth/me       → trader can update them from portal Settings
//    GET   /api/admin/users   → Admin Dashboard payload carries both fields
//  Only throwaway accounts are created; they are deleted at the end.
// ────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./src/models/User');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
let passed = 0;
let failed = 0;

function check(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}

async function req(method, route, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

(async () => {
  console.log('\n[tmp:address] running...');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  const stamp = Date.now();
  const SHOP_EMAIL = `addr-shop-${stamp}@test.local`;
  const SHOP_PHONE = `0300-addr-shop-${stamp}`;
  const SUP_EMAIL = `addr-sup-${stamp}@test.local`;
  const SUP_PHONE = `0300-addr-sup-${stamp}`;
  const ADMIN_EMAIL = `addr-admin-${stamp}@test.local`;
  const ADMIN_PHONE = `0300-addr-admin-${stamp}`;

  const HOUSE_1 = 'House 42, Street 9, Gulberg III, Lahore';
  const LOC_1 = 'Gulberg III, Lahore, Punjab';
  const HOUSE_2 = 'Plot 7, Askari IV, Rashid Minhas Road, Karachi';
  const LOC_2 = 'Clifton, Karachi, Sindh';

  // 1) Registration — the exact payload the /getstarted wizard sends.
  const shopReg = await req('POST', '/api/auth/register', {
    body: {
      name: 'Address Check Shopkeeper', email: SHOP_EMAIL, phone: SHOP_PHONE,
      password: 'password123', role: 'shopkeeper', businessName: 'Addr Check Mart',
      city: 'Lahore', houseAddress: HOUSE_1, currentHouseLocation: LOC_1,
    },
  });
  check('register shopkeeper -> 201', shopReg.status === 201, `(HTTP ${shopReg.status})`);
  check('registration response carries houseAddress', shopReg.json?.user?.houseAddress === HOUSE_1, JSON.stringify(shopReg.json?.user?.houseAddress));
  check('registration response carries currentHouseLocation', shopReg.json?.user?.currentHouseLocation === LOC_1, JSON.stringify(shopReg.json?.user?.currentHouseLocation));

  const supReg = await req('POST', '/api/auth/register', {
    body: {
      name: 'Address Check Supplier', email: SUP_EMAIL, phone: SUP_PHONE,
      password: 'password123', role: 'supplier', businessName: 'Addr Check Traders',
      city: 'Karachi', houseAddress: HOUSE_2, currentHouseLocation: LOC_2,
    },
  });
  check('register supplier -> 201', supReg.status === 201, `(HTTP ${supReg.status})`);
  check('supplier registration stores both fields', supReg.json?.user?.houseAddress === HOUSE_2 && supReg.json?.user?.currentHouseLocation === LOC_2);

  // 2) Persisted in MongoDB — not just echoed back in the response.
  const stored = await User.findOne({ email: SHOP_EMAIL.toLowerCase() }).lean();
  check('houseAddress persisted in DB', stored?.houseAddress === HOUSE_1, JSON.stringify(stored?.houseAddress));
  check('currentHouseLocation persisted in DB', stored?.currentHouseLocation === LOC_1, JSON.stringify(stored?.currentHouseLocation));

  // 3) Settings update — approve the throwaway shopkeeper, sign in, PATCH.
  await User.updateOne({ email: SHOP_EMAIL.toLowerCase() }, { $set: { verified: true } });
  const login = await req('POST', '/api/auth/login', { body: { identifier: SHOP_EMAIL, password: 'password123' } });
  check('shopkeeper login -> 200 + token', login.status === 200 && !!login.json?.token, `(HTTP ${login.status})`);
  const token = login.json?.token;

  const NEW_HOUSE = 'House 1, Model Town Link Road, Lahore';
  const NEW_LOC = 'Johar Town, Lahore, Punjab';
  const upd = await req('PATCH', '/api/auth/me', { token, body: { houseAddress: NEW_HOUSE, currentHouseLocation: NEW_LOC } });
  check('PATCH /api/auth/me -> 200', upd.status === 200, `(HTTP ${upd.status})`);
  check('update response returns new values', upd.json?.user?.houseAddress === NEW_HOUSE && upd.json?.user?.currentHouseLocation === NEW_LOC);

  const me = await req('GET', '/api/auth/me', { token });
  check('GET /api/auth/me returns updated values', me.json?.user?.houseAddress === NEW_HOUSE && me.json?.user?.currentHouseLocation === NEW_LOC);

  // 4) Admin Dashboard payload — the exact list the dashboard renders.
  await User.create({ name: 'Address Check Admin', email: ADMIN_EMAIL, phone: ADMIN_PHONE, password: 'password123', role: 'admin', verified: true });
  const adminLogin = await req('POST', '/api/auth/login', { body: { identifier: ADMIN_EMAIL, password: 'password123' } });
  check('admin login -> 200 + token', adminLogin.status === 200 && !!adminLogin.json?.token, `(HTTP ${adminLogin.status})`);
  const adminToken = adminLogin.json?.token;

  const listShop = await req('GET', `/api/admin/users?search=${encodeURIComponent(SHOP_EMAIL)}`, { token: adminToken });
  const listedShop = (listShop.json?.users || []).find((u) => u.email === SHOP_EMAIL);
  check('admin users list includes the registration', !!listedShop, `(HTTP ${listShop.status})`);
  check('admin payload has the updated houseAddress', listedShop?.houseAddress === NEW_HOUSE, JSON.stringify(listedShop?.houseAddress));
  check('admin payload has the updated currentHouseLocation', listedShop?.currentHouseLocation === NEW_LOC, JSON.stringify(listedShop?.currentHouseLocation));

  const listSup = await req('GET', `/api/admin/users?search=${encodeURIComponent(SUP_EMAIL)}`, { token: adminToken });
  const listedSup = (listSup.json?.users || []).find((u) => u.email === SUP_EMAIL);
  check('admin payload carries the supplier registration address', listedSup?.houseAddress === HOUSE_2 && listedSup?.currentHouseLocation === LOC_2);

  // 5) Cleanup — remove every throwaway account this script created.
  const cleanup = await User.deleteMany({
    email: { $in: [SHOP_EMAIL, SUP_EMAIL, ADMIN_EMAIL].map((e) => e.toLowerCase()) },
  });
  check('cleanup removed the throwaway accounts', cleanup.deletedCount === 3, `deleted=${cleanup.deletedCount}`);

  await mongoose.disconnect();
  console.log(`\n[tmp:address] ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  console.error('\n[tmp:address] ❌ failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});

