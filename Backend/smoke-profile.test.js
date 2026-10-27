// ────────────────────────────────────────────────────────────
//  Profile / settings API smoke test — run AFTER `npm start` + `npm run seed`
//      node smoke-profile.test.js
//
//  Covers the endpoints behind the shopkeeper/supplier profile + settings
//  pages, which used to be static UI with no server contract at all:
//
//    PATCH /api/auth/me            → update name/business/contact details
//    PATCH /api/auth/me/password   → verify current password, then replace it
//
//  The test always restores the seeded `password123` so the demo accounts
//  stay usable afterwards.
//
//  Point it at another instance with:  BASE_URL=http://localhost:5001
// ────────────────────────────────────────────────────────────
const BASE = process.env.BASE_URL || 'http://localhost:5000';
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

const SHOP = { identifier: 'hassan.traders@gmail.com', password: 'password123' };
const SUPPLIER_EMAIL = 'ahmed@akenterprises.pk';

(async () => {
  console.log('\n[smoke:profile] running...');

  const login = await req('POST', '/api/auth/login', { body: SHOP });
  check('shopkeeper login -> 200 + token', login.status === 200 && !!login.json.token, `(HTTP ${login.status})`);
  if (!login.json?.token) { console.log('\n[smoke:profile] cannot continue without a token\n'); process.exit(1); }

  const token = login.json.token;
  const seededName = login.json.user.name;
  const seededBusiness = login.json.user.businessName;

  // ---- guards ---------------------------------------------------------
  const anon = await req('PATCH', '/api/auth/me', { body: { name: 'Nope' } });
  check('unauthenticated PATCH /api/auth/me -> 401', anon.status === 401, `(HTTP ${anon.status})`);

  const anonPw = await req('PATCH', '/api/auth/me/password', { body: { currentPassword: 'x', newPassword: 'yyyyyyyy' } });
  check('unauthenticated PATCH /api/auth/me/password -> 401', anonPw.status === 401, `(HTTP ${anonPw.status})`);

  // ---- profile update -------------------------------------------------
  const empty = await req('PATCH', '/api/auth/me', { token, body: { name: '   ' } });
  check('empty name -> 400', empty.status === 400, `(HTTP ${empty.status})`);

  const nothing = await req('PATCH', '/api/auth/me', { token, body: {} });
  check('no editable field -> 400', nothing.status === 400, `(HTTP ${nothing.status})`);

  const dupeEmail = await req('PATCH', '/api/auth/me', { token, body: { email: SUPPLIER_EMAIL } });
  check('duplicate email -> 409', dupeEmail.status === 409, `(HTTP ${dupeEmail.status})`);

  const ok = await req('PATCH', '/api/auth/me', {
    token,
    body: {
      name: seededName,
      businessName: seededBusiness,
      city: 'Karachi',
      email: SHOP.identifier,
      phone: '03214567890',
    },
  });
  check(
    'PATCH /api/auth/me -> 200 (own values echoed, no password)',
    ok.status === 200 && ok.json.user.name === seededName && ok.json.user.password === undefined,
    `(HTTP ${ok.status})`
  );

  const me = await req('GET', '/api/auth/me', { token });
  check('GET /api/auth/me -> 200 after update', me.status === 200 && me.json.user.businessName === seededBusiness, `(HTTP ${me.status})`);

  // ---- password change ------------------------------------------------
  const wrong = await req('PATCH', '/api/auth/me/password', { token, body: { currentPassword: 'definitely-wrong', newPassword: 'BrandNewPass1' } });
  check('wrong current password -> 401', wrong.status === 401, `(HTTP ${wrong.status})`);

  const weak = await req('PATCH', '/api/auth/me/password', { token, body: { currentPassword: SHOP.password, newPassword: 'short' } });
  check('new password < 8 chars -> 400', weak.status === 400, `(HTTP ${weak.status})`);

  const missing = await req('PATCH', '/api/auth/me/password', { token, body: { currentPassword: SHOP.password } });
  check('missing newPassword -> 400', missing.status === 400, `(HTTP ${missing.status})`);

  const TEMP_PASSWORD = 'password1234';
  const changed = await req('PATCH', '/api/auth/me/password', { token, body: { currentPassword: SHOP.password, newPassword: TEMP_PASSWORD } });
  check('valid change -> { updated: true }', changed.status === 200 && changed.json.updated === true, `(HTTP ${changed.status})`);

  const relogin = await req('POST', '/api/auth/login', { body: { identifier: SHOP.identifier, password: TEMP_PASSWORD } });
  check('login with the NEW password -> 200', relogin.status === 200 && !!relogin.json.token, `(HTTP ${relogin.status})`);

  const oldLogin = await req('POST', '/api/auth/login', { body: SHOP });
  check('login with the OLD password -> 401', oldLogin.status === 401, `(HTTP ${oldLogin.status})`);

  // Restore the seeded password so the demo credentials keep working.
  if (relogin.json?.token) {
    const restore = await req('PATCH', '/api/auth/me/password', {
      token: relogin.json.token,
      body: { currentPassword: TEMP_PASSWORD, newPassword: SHOP.password },
    });
    check('restore seeded password -> 200', restore.status === 200 && restore.json.updated === true, `(HTTP ${restore.status})`);

    const finalLogin = await req('POST', '/api/auth/login', { body: SHOP });
    check('seeded credentials work again', finalLogin.status === 200, `(HTTP ${finalLogin.status})`);
  } else {
    failed++;
    console.log('  ✘ could not restore the seeded password — re-run `npm run seed`');
  }

  console.log(`\n[smoke:profile] ${passed} passed | ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
