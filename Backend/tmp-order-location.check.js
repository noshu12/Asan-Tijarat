// tmp-order-location.check.js — validates that a shopkeeper's current
// location is attached to every order and delivered to the supplier as a
// clickable Google Maps link.
//
//      npm start (pehle chalao), phir:  node tmp-order-location.check.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Product = require('./src/models/Product');
const Order = require('./src/models/Order');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
let passed = 0;
let failed = 0;

const stamp = Date.now();
const SHOP = { name: 'OrderLoc Shop', email: `orderloc-shop-${stamp}@test.local`, phone: `0300-oloc-shop-${stamp}` };
const SUP = { name: 'OrderLoc Sup', email: `orderloc-sup-${stamp}@test.local`, phone: `0300-oloc-sup-${stamp}` };

function check(name, cond, extra) {
  if (cond) { passed++; console.log('  OK   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
}

async function req(method, path, o) {
  o = o || {};
  const r = await fetch(BASE + path, {
    method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      o.token ? { Authorization: 'Bearer ' + o.token } : {}
    ),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch { /* no body */ }
  return { status: r.status, json: j };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  // 0) Throwaway verified shopkeeper + supplier + one listing.
  // (The User model's pre('save') hook hashes the plain password.)
  const shopUser = await User.create({ ...SHOP, password: 'password123', role: 'shopkeeper', verified: true });
  const supUser = await User.create({ ...SUP, password: 'password123', role: 'supplier', verified: true });
  const product = await Product.create({
    name: 'OrderLoc Atta', category: 'Rice & Grains', price: 500, unit: '10kg bag',
    moq: 2, stock: 100, supplierId: supUser._id, supplierName: supUser.name,
    supplierCity: 'Lahore', supplierVerified: true,
  });

  // 1) Sign in as the throwaway shopkeeper + supplier.
  const shop = await req('POST', '/api/auth/login', {
    body: { identifier: SHOP.email, password: 'password123' },
  });
  check('shopkeeper login -> 200', shop.status === 200 && !!shop.json.token, shop.json);
  const st = shop.json.token;

  const supp = await req('POST', '/api/auth/login', {
    body: { identifier: SUP.email, password: 'password123' },
  });
  check('supplier login -> 200', supp.status === 200 && !!supp.json.token, supp.json);
  const su = supp.json.token;

  // 2) Order WITH a checkout GPS point → stored + Maps link built.
  const point = { lat: 31.5204, lng: 74.3587 };
  const withLoc = await req('POST', '/api/orders', {
    token: st,
    body: {
      items: [{ productId: String(product._id), quantity: 2 }],
      shippingAddress: 'Shop 12, Azam Cloth Market, Lahore',
      paymentMethod: 'JazzCash',
      currentLocation: point,
    },
  });
  check('order with currentLocation -> 201', withLoc.status === 201, withLoc.json);
  const o1 = withLoc.json.orders[0];
  check(
    'buyerLocation stored on order',
    o1.buyerLocation && o1.buyerLocation.lat === point.lat && o1.buyerLocation.lng === point.lng,
    o1.buyerLocation
  );
  check(
    'buyerLocationLink = exact Google Maps pin URL',
    o1.buyerLocationLink === `https://www.google.com/maps?q=${point.lat},${point.lng}`,
    o1.buyerLocationLink
  );

  // 3) Supplier receives the location inside the complete order details.
  const suppOrders = await req('GET', '/api/orders', { token: su });
  const seen = (suppOrders.json.orders || []).find((o) => o.id === o1.id);
  check(
    'supplier sees buyerLocation + Maps link with the order',
    !!seen && !!seen.buyerLocation && seen.buyerLocationLink === o1.buyerLocationLink,
    seen && { buyerLocation: seen.buyerLocation, buyerLocationLink: seen.buyerLocationLink }
  );

  // 4) Malformed coordinates are rejected — never a broken Maps link.
  const bad = await req('POST', '/api/orders', {
    token: st,
    body: {
      items: [{ productId: String(product._id), quantity: 2 }],
      shippingAddress: 'x',
      currentLocation: { lat: 999, lng: 0 },
    },
  });
  check(
    'invalid currentLocation -> 400 INVALID_LOCATION',
    bad.status === 400 && bad.json.error.code === 'INVALID_LOCATION',
    bad.json
  );

  // 5) No point in the payload → falls back to the profile-saved location.
  await req('PATCH', '/api/auth/me', {
    token: st,
    body: { currentLocation: { lat: 24.8607, lng: 67.0011 } },
  });
  const noLoc = await req('POST', '/api/orders', {
    token: st,
    body: { items: [{ productId: String(product._id), quantity: 2 }], shippingAddress: 'y' },
  });
  check('order without currentLocation -> 201', noLoc.status === 201, noLoc.json);
  const o2 = noLoc.json.orders[0];
  check(
    'profile-saved location used as fallback',
    !!o2.buyerLocation && o2.buyerLocation.lat === 24.8607 && o2.buyerLocation.lng === 67.0011 &&
      o2.buyerLocationLink === 'https://www.google.com/maps?q=24.8607,67.0011',
    { buyerLocation: o2.buyerLocation, buyerLocationLink: o2.buyerLocationLink }
  );

  // 6) Cleanup — remove throwaway orders, listing and accounts.
  const del = await Order.deleteMany({ _id: { $in: [o1.id, o2.id] } });
  check('cleanup removed the throwaway orders', del.deletedCount === 2, `deleted=${del.deletedCount}`);
  await Product.deleteOne({ _id: product._id });
  await User.deleteMany({ _id: { $in: [shopUser._id, supUser._id] } });
  // Also sweep any throwaway accounts left behind by earlier failed runs.
  await User.deleteMany({ email: /orderloc-(shop|sup)-\d+@test\.local$/ });
  await Product.deleteMany({ name: 'OrderLoc Atta' });

  await mongoose.disconnect();
  console.log(`\n[tmp:order-location] ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  console.error('\n[tmp:order-location] ❌ failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
