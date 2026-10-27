// Smoke test — npm start pehle chalao, phir: node smoke.test.js
const BASE = process.env.API_URL || 'http://localhost:5000';
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  OK   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
}
async function req(method, path, o) {
  o = o || {};
  const r = await fetch(BASE + path, {
    method: method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, o.token ? { Authorization: 'Bearer ' + o.token } : {}),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
(async () => {
  const h = await req('GET', '/api/health');
  check('health 200 + db connected', h.status === 200 && h.json.db === 'connected');

  const bad = await req('POST', '/api/auth/login', { body: { identifier: 'hassan.traders@gmail.com', password: 'wrong' } });
  check('bad login -> 401 INVALID_CREDENTIALS', bad.status === 401 && bad.json.error.code === 'INVALID_CREDENTIALS');

  const shop = await req('POST', '/api/auth/login', { body: { identifier: 'hassan.traders@gmail.com', password: 'password123' } });
  check('shopkeeper login -> 200', shop.status === 200 && !!shop.json.token);
  const st = shop.json.token;
  const supp = await req('POST', '/api/auth/login', { body: { identifier: '+92 300 1234567', password: 'password123' } });
  check('supplier login by PHONE -> 200', supp.status === 200 && !!supp.json.token);
  const su = supp.json.token;
  const me = await req('GET', '/api/auth/me', { token: st });
  check('me -> role=shopkeeper, no password', me.status === 200 && me.json.user.role === 'shopkeeper' && !me.json.user.password);

  const all = await req('GET', '/api/products');
  check('products count = 9', all.status === 200 && all.json.count === 9, all.json.count);
  const sorted = await req('GET', '/api/products?sort=price_asc');
  const prices = sorted.json.products.map((p) => p.price);
  check('sort=price_asc ascending', prices.every((p, i) => i === 0 || prices[i - 1] <= p), prices);
  const fp = all.json.products[0];
  check('GET product/:id -> 200', (await req('GET', '/api/products/' + fp.id)).status === 200);

  const order = await req('POST', '/api/orders', {
    token: st,
    body: { items: [{ productId: fp.id, quantity: fp.moq }], shippingAddress: 'Jodia Bazaar Karachi', paymentMethod: 'JazzCash' },
  });
  check('create order -> 201', order.status === 201 && order.json.count === 1, order.json);
  const no = order.json.orders[0];
  check('escrow fee = 1.5%', no.platformFee === Math.round(no.subtotal * 0.015), { s: no.subtotal, f: no.platformFee });

  const below = await req('POST', '/api/orders', { token: st, body: { items: [{ productId: fp.id, quantity: 1 }], shippingAddress: 'x' } });
  check('below MOQ -> 400 BELOW_MOQ', below.status === 400 && below.json.error.code === 'BELOW_MOQ', below.json);

  check('buyer orders = 4', (await req('GET', '/api/orders', { token: st })).json.count === 4);
  check('supplier orders = 4', (await req('GET', '/api/orders', { token: su })).json.count === 4);

  const c1 = await req('PATCH', '/api/orders/' + no.id + '/status', { token: su, body: { status: 'Confirmed' } });
  check('P->Confirmed (supplier)', c1.status === 200 && c1.json.order.status === 'Confirmed', c1.json);
  const c2 = await req('PATCH', '/api/orders/' + no.id + '/status', { token: su, body: { status: 'Shipped' } });
  check('Confirmed->Shipped', c2.status === 200 && c2.json.order.status === 'Shipped', c2.json);
  const c3 = await req('PATCH', '/api/orders/' + no.id + '/status', { token: su, body: { status: 'Delivered' } });
  check('Shipped->Delivered', c3.status === 200 && c3.json.order.status === 'Delivered', c3.json);

  const bf = await req('PATCH', '/api/orders/' + no.id + '/status', { token: st, body: { status: 'Confirmed' } });
  check('buyer forced -> 403 INVALID_TRANSITION', bf.status === 403 && bf.json.error.code === 'INVALID_TRANSITION', bf.json);

  const aft = await req('GET', '/api/products/' + fp.id);
  check('stock decremented', aft.json.product.stock === fp.stock - fp.moq, { before: fp.stock, after: aft.json.product.stock });

  const sc = await req('POST', '/api/orders', { token: su, body: { items: [{ productId: fp.id, quantity: 1 }], shippingAddress: 'x' } });
  check('supplier place order -> 403 ROLE_FORBIDDEN', sc.status === 403 && sc.json.error.code === 'ROLE_FORBIDDEN', sc.json);
  check('shopkeeper PATCH product -> 403', (await req('PATCH', '/api/products/' + fp.id, { token: st, body: { stock: 999 } })).status === 403);
  check('shopkeeper DELETE product -> 403', (await req('DELETE', '/api/products/' + fp.id, { token: st })).status === 403);

  const cr = await req('POST', '/api/products', { token: su, body: { name: 'Test Atta', category: 'Rice & Grains', price: 500, unit: '10kg bag', moq: 5, stock: 10 } });
  check('supplier create -> 201 Active', cr.status === 201 && cr.json.product.status === 'Active', cr.json);
  const pid = cr.json.product.id;
  const zd = await req('PATCH', '/api/products/' + pid, { token: su, body: { stock: 0 } });
  check('stock 0 -> Out of Stock', zd.status === 200 && zd.json.product.status === 'Out of Stock', zd.json.product.status);
  check('supplier delete own -> 200', (await req('DELETE', '/api/products/' + pid, { token: su })).status === 200);

  check('404 unknown product id', (await req('GET', '/api/products/60c72b2f9b1d4a3f8e9c1a2b')).status === 404);
  check('401 missing token', (await req('GET', '/api/orders')).status === 401);
  check('404 unknown route', (await req('GET', '/api/nope')).status === 404);

  console.log('\n  TOTAL: ' + passed + ' passed | ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();