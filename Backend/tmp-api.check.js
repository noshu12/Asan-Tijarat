/**
 * Temporary integration check (deleted after use): the real Express app wiring
 * for product photos + KYC uploads, with the Mongoose models stubbed so no
 * MongoDB is needed.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

const PRODUCT_DIR = path.join(__dirname, 'uploads', 'products');
const KYC_DIR = path.join(__dirname, 'uploads', 'kyc');
const countFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0);

/* ── stub models ──────────────────────────────────────────────────────── */
const productStore = [];
const doc = (data, id) => ({
  ...data,
  _id: id,
  save: async function save() { return this; },
});

const StubProduct = {
  create: async (data) => {
    const created = doc(data, `prod-${productStore.length + 1}`);
    created.createdAt = new Date().toISOString();
    productStore.push(created);
    return created;
  },
  find: () => ({ sort: () => ({ lean: async () => productStore }) }),
  findById: async (id) => productStore.find((p) => String(p._id) === String(id)) || null,
};
const productModelPath = require.resolve('./src/models/Product');
require.cache[productModelPath] = { id: productModelPath, filename: productModelPath, loaded: true, exports: StubProduct };

const StubUser = {
  findOne: async () => null,
  create: async (data) => ({ ...data, _id: 'user-1', toSafeJSON: () => ({ id: 'user-1', ...data }) }),
};
const userModelPath = require.resolve('./src/models/User');
require.cache[userModelPath] = { id: userModelPath, filename: userModelPath, loaded: true, exports: StubUser };

/* ── app mirroring server.js for the affected routes ──────────────────── */
const { createProduct, updateProduct, getProducts } = require('./src/controllers/product.controller');
const { register } = require('./src/controllers/auth.controller');

const fakeSupplier = { _id: 'supplier-1', businessName: 'Test Supplier Co', city: 'Lahore', verified: true };

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.post('/api/products', (req, res, next) => { req.user = fakeSupplier; next(); }, createProduct);
app.patch('/api/products/:id', (req, res, next) => { req.user = fakeSupplier; next(); }, updateProduct);
app.get('/api/products', getProducts);
app.post('/api/auth/register', register);

/* ── helpers ──────────────────────────────────────────────────────────── */
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${extra ? ` ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const request = (port, method, urlPath, body) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1', port, method, path: urlPath,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try { json = JSON.parse(raw.toString('utf8')); } catch { /* binary */ }
          resolve({ status: res.statusCode, contentType: res.headers['content-type'] || '', bytes: raw.length, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const image = (name) => ({ dataUrl: `data:image/png;base64,${PNG}`, name });

(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;

  const filesBefore = countFiles(PRODUCT_DIR);

  /* ── 1. Supplier adds a listing WITH uploaded photos ────────────────── */
  const created = await request(port, 'POST', '/api/products', {
    name: 'Premium Basmati Rice — 10kg Bag',
    category: 'Rice & Grains',
    unit: '10kg bag',
    price: 4500,
    moq: 10,
    stock: 500,
    description: 'Super kernel, export quality.',
    images: [image('bag-front.jpg'), image('bag-inside.jpg')],
  });

  check('POST /api/products → 201', created.status === 201, `(HTTP ${created.status})`);
  const p = (created.json && created.json.product) || {};
  check('cover photo is the first upload', String(p.image).startsWith('/uploads/products/'), `-> ${p.image}`);
  check('second photo stored in additionalImages',
    Array.isArray(p.additionalImages) && p.additionalImages.length === 1 &&
    p.additionalImages[0].startsWith('/uploads/products/'));
  check('imageUploads keeps file metadata',
    Array.isArray(p.imageUploads) && p.imageUploads.length === 2 &&
    p.imageUploads[0].originalName === 'bag-front.jpg' &&
    p.imageUploads[0].mimeType === 'image/png' && p.imageUploads[0].size > 0);
  check('supplier details attached to the listing',
    p.supplierName === 'Test Supplier Co' && p.supplierCity === 'Lahore' && p.supplierVerified === true);
  check('2 photo files on disk', countFiles(PRODUCT_DIR) === filesBefore + 2,
    `(${filesBefore} → ${countFiles(PRODUCT_DIR)})`);

  /* ── 2. The stored photo is publicly served (what every list renders) ── */
  const fetched = await request(port, 'GET', p.image);
  check('GET /uploads/products/... serves the uploaded photo',
    fetched.status === 200 && fetched.bytes > 0 && fetched.contentType.includes('image/png'),
    `(HTTP ${fetched.status}, ${fetched.bytes} bytes, ${fetched.contentType})`);

  /* ── 3. Listing API returns the photo for every product view ─────────── */
  const list = await request(port, 'GET', '/api/products');
  const listed = (list.json && list.json.products && list.json.products[0]) || {};
  check('GET /api/products exposes image + imageUploads',
    listed.image === p.image && Array.isArray(listed.imageUploads) && listed.imageUploads.length === 2);
  check('catalogue response uses `id` not `_id`', typeof listed.id === 'string' && listed._id === undefined);

  /* ── 4. Editing the listing keeps the stored photos ──────────────────── */
  const patched = await request(port, 'PATCH', `/api/products/${p._id}`, { price: 4750 });
  check('PATCH /api/products/:id → 200', patched.status === 200, `(HTTP ${patched.status})`);
  const patchedProduct = (patched.json && patched.json.product) || {};
  check('photo link survives an edit (no images key sent)',
    patchedProduct.price === 4750 && patchedProduct.image === p.image &&
    Array.isArray(patchedProduct.additionalImages) && patchedProduct.additionalImages.length === 1,
    `-> ${patchedProduct.image}`);

  /* ── 5. A non-image upload is rejected before anything is written ────── */
  const filesAfterGood = countFiles(PRODUCT_DIR);
  const bad = await request(port, 'POST', '/api/products', {
    name: 'Not a photo', category: 'Other',
    images: [{ dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK', name: 'spec.pdf' }],
  });
  check('POST with a PDF photo → 400 PRODUCT_IMAGE_INVALID',
    bad.status === 400 && bad.json && bad.json.error && bad.json.error.code === 'PRODUCT_IMAGE_INVALID',
    `(HTTP ${bad.status}) ${bad.json && bad.json.error && bad.json.error.message}`);
  check('rejected upload leaves no file behind', countFiles(PRODUCT_DIR) === filesAfterGood);

  /* ── 6. Registration stores the KYC files the Admin Dashboard renders ── */
  const kycBefore = countFiles(KYC_DIR);
  const kycNamesBefore = fs.existsSync(KYC_DIR) ? new Set(fs.readdirSync(KYC_DIR)) : new Set();
  const registered = await request(port, 'POST', '/api/auth/register', {
    name: 'Test Trader', email: `trader-${Date.now()}@test.local`, phone: `0300-${Date.now()}`,
    password: 'secret123', role: 'supplier', businessName: 'Test Supplier Co', city: 'Lahore',
    documents: { cnicFront: image('cnic-front.png') },
  });
  check('POST /api/auth/register → 201', registered.status === 201, `(HTTP ${registered.status})`);
  check('KYC document written to disk', countFiles(KYC_DIR) === kycBefore + 1,
    `(${kycBefore} → ${countFiles(KYC_DIR)})`);

  /* ── cleanup — delete only what THIS check wrote, leave the rest ─────── */
  const kycCreated = (fs.existsSync(KYC_DIR) ? fs.readdirSync(KYC_DIR) : [])
    .filter((name) => !kycNamesBefore.has(name))
    .map((name) => path.join(KYC_DIR, name));
  const writtenPhotos = [p.image, ...(p.additionalImages || [])]
    .filter(Boolean)
    .map((url) => path.join(PRODUCT_DIR, path.basename(url)));
  [...writtenPhotos, ...kycCreated].forEach((file) => {
    try { fs.unlinkSync(file); } catch { /* already gone */ }
  });
  check('uploads folders restored', countFiles(PRODUCT_DIR) === filesBefore && countFiles(KYC_DIR) === kycBefore,
    `(products ${countFiles(PRODUCT_DIR)}/${filesBefore}, kyc ${countFiles(KYC_DIR)}/${kycBefore})`);

  server.close();
  console.log(failures === 0 ? '\nALL API CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
