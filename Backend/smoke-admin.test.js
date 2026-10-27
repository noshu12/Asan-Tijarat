// ────────────────────────────────────────────────────────────
//  Admin API smoke test — run AFTER `npm start` + `npm run seed`
//      node smoke-admin.test.js
//  Verifies: admin login, /api/admin/* endpoints, role guard,
//  KYC toggle, order/product visibility, and cleans up test data.
// ────────────────────────────────────────────────────────────
const BASE = process.env.API_URL || 'http://localhost:5000';
let passed = 0;
let failed = 0;

async function req(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

function check(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}

(async () => {
  console.log('\n[smoke:admin] running...');

  const adm = await req('POST', '/api/auth/login', { body: { identifier: 'admin@asantijarat.pk', password: 'password123' } });
  check('admin login -> 200 + token', adm.status === 200 && !!adm.json.token, `(HTTP ${adm.status})`);
  const adminToken = adm.json.token;

  const sh = await req('POST', '/api/auth/login', { body: { identifier: 'hassan.traders@gmail.com', password: 'password123' } });
  const shopToken = sh.json.token;

  const guard = await req('GET', '/api/admin/stats', { token: shopToken });
  check('shopkeeper blocked on /api/admin -> 403', guard.status === 403, `(HTTP ${guard.status})`);

  const stats = await req('GET', '/api/admin/stats', { token: adminToken });
  check('admin stats -> 200 with counts', stats.status === 200 && stats.json.stats && stats.json.stats.users >= 2, `(HTTP ${stats.status})`);

  const users = await req('GET', '/api/admin/users', { token: adminToken });
  check('admin users list -> 200', users.status === 200 && users.json.count >= 3, `(HTTP ${users.status})`);

  const orders = await req('GET', '/api/admin/orders', { token: adminToken });
  check('admin orders list -> 200', orders.status === 200 && orders.json.count >= 1, `(HTTP ${orders.status})`);

  const products = await req('GET', '/api/admin/products', { token: adminToken });
  check('admin products list -> 200', products.status === 200 && products.json.count >= 1, `(HTTP ${products.status})`);

  // KYC toggle: revoke then re-approve the demo shopkeeper
  const shopUser = users.json.users.find((u) => u.email === 'hassan.traders@gmail.com');
  const revoke = await req('PATCH', `/api/admin/users/${shopUser.id}/verify`, { token: adminToken, body: { verified: false } });
  check('KYC revoke -> verified=false', revoke.status === 200 && revoke.json.user.verified === false, `(HTTP ${revoke.status})`);
  const approve = await req('PATCH', `/api/admin/users/${shopUser.id}/verify`, { token: adminToken, body: { verified: true } });
  check('KYC approve -> verified=true', approve.status === 200 && approve.json.user.verified === true, `(HTTP ${approve.status})`);

  // Clean up any product created by earlier manual smoke tests
  const testProducts = products.json.products.filter((p) => p.name.includes('Verification Item') || p.name.includes('Smoke Test'));
  for (const p of testProducts) {
    const del = await req('DELETE', `/api/admin/products/${p.id}`, { token: adminToken });
    check(`cleanup deleted "${p.name}"`, del.status === 200 && del.json.deleted === true, `(HTTP ${del.status})`);
  }

  console.log(`\n[smoke:admin] ${passed} passed | ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();