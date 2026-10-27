/**
 * Temporary verification for the storage utils (deleted after use):
 *   • uploadStorage / kycStorage  — re-checked after the shared-module refactor
 *   • productImageStorage         — new: supplier product photos
 */
const fs = require('fs');
const path = require('path');

const { saveKycDocuments, deleteStoredFiles, KycUploadError } = require('./src/utils/kycStorage');
const { saveProductImages, ProductImageError, MAX_PRODUCT_IMAGES } = require('./src/utils/productImageStorage');

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${extra ? ` ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const image = (name = 'photo.png') => ({ dataUrl: `data:image/png;base64,${PNG}`, name });
const pdf = (name = 'ntn.pdf') => ({
  dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4 fake certificate').toString('base64')}`,
  name,
});

const KYC_DIR = path.join(__dirname, 'uploads', 'kyc');
const PRODUCT_DIR = path.join(__dirname, 'uploads', 'products');
const countFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0);

/* ── 1. KYC storage (regression after the refactor) ───────────────────── */
const kyc = saveKycDocuments({
  cnicFront: image('front.png'),
  cnicBack: image('C:\\evil\\..\\back.png'),
  ntn: pdf(),
});

check('KYC: 3 files written', kyc.files.length === 3 && kyc.files.every((f) => fs.existsSync(f)));
check('KYC: urls are /uploads/kyc/*', Object.values(kyc.documents).every((d) => d.url.startsWith('/uploads/kyc/')));
check('KYC: mime/size/timestamp recorded',
  kyc.documents.cnicFront.mimeType === 'image/png' &&
  kyc.documents.cnicFront.size === Buffer.from(PNG, 'base64').length &&
  kyc.documents.cnicFront.uploadedAt instanceof Date);
check('KYC: pdf accepted', kyc.documents.ntn.mimeType === 'application/pdf');
check('KYC: file name sanitised', kyc.documents.cnicBack.originalName === 'back.png',
  `-> ${kyc.documents.cnicBack.originalName}`);

try {
  saveKycDocuments({ cnicFront: { dataUrl: 'data:text/plain;base64,YQ==', name: 'x.txt' } });
  check('KYC: rejects disallowed mime', false);
} catch (err) {
  check('KYC: rejects disallowed mime', err instanceof KycUploadError && err.code === 'KYC_UPLOAD_INVALID', `-> ${err.message}`);
}
try {
  saveKycDocuments({ ntn: { dataUrl: 'nope' } });
  check('KYC: rejects malformed data url', false);
} catch (err) {
  check('KYC: rejects malformed data url', err instanceof KycUploadError, `-> ${err.message}`);
}
const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 10).toString('base64');
try {
  saveKycDocuments({ ntn: { dataUrl: `data:image/png;base64,${bigBuffer}` } });
  check('KYC: rejects >5MB', false);
} catch (err) {
  check('KYC: rejects >5MB', err instanceof KycUploadError, `-> ${err.message}`);
}
check('KYC: documents optional', Object.keys(saveKycDocuments(undefined).documents).length === 0);
deleteStoredFiles(kyc.files);
check('KYC: cleanup removes files', kyc.files.every((f) => !fs.existsSync(f)));

/* ── 2. Product photo storage ─────────────────────────────────────────── */
const before = countFiles(PRODUCT_DIR);

const product = saveProductImages({
  images: [image('bag-front.jpg'), image('bag-side.jpg'), image('bag-closeup.jpg')],
});

check('Product: 3 photos written', product.files.length === 3 && product.files.every((f) => fs.existsSync(f)));
check('Product: urls are /uploads/products/*', product.urls.every((u) => u.startsWith('/uploads/products/')));
check('Product: upload order preserved (index 0 = cover)', product.urls.length === 3 && product.uploads.length === 3);
check('Product: metadata stored', product.uploads[0].originalName === 'bag-front.jpg' &&
  product.uploads[0].mimeType === 'image/png' && product.uploads[0].size > 0 &&
  product.uploads[0].uploadedAt instanceof Date);
check('Product: files landed on disk', countFiles(PRODUCT_DIR) === before + 3, `(${before} → ${countFiles(PRODUCT_DIR)})`);

const single = saveProductImages({ image: image('single.png') });
check('Product: single `image` upload accepted', single.urls.length === 1);

const passthrough = saveProductImages({ images: ['https://cdn.example.com/x.jpg', image('new.png')] });
check('Product: plain URL passed through, upload written',
  passthrough.urls[0] === 'https://cdn.example.com/x.jpg' &&
  passthrough.urls[1].startsWith('/uploads/products/') &&
  passthrough.uploads.length === 1 &&
  passthrough.files.length === 1);

try {
  saveProductImages({ images: [pdf('spec.pdf')] });
  check('Product: rejects PDF (photo must be an image)', false);
} catch (err) {
  check('Product: rejects PDF (photo must be an image)',
    err instanceof ProductImageError && err.code === 'PRODUCT_IMAGE_INVALID', `-> ${err.message}`);
}
try {
  saveProductImages({ images: [{ dataUrl: `data:image/png;base64,${bigBuffer}`, name: 'huge.png' }] });
  check('Product: rejects >5MB photo', false);
} catch (err) {
  check('Product: rejects >5MB photo', err instanceof ProductImageError, `-> ${err.message}`);
}
try {
  saveProductImages({ images: Array.from({ length: MAX_PRODUCT_IMAGES + 1 }, () => image()) });
  check(`Product: rejects more than ${MAX_PRODUCT_IMAGES} photos`, false);
} catch (err) {
  check(`Product: rejects more than ${MAX_PRODUCT_IMAGES} photos`, err instanceof ProductImageError, `-> ${err.message}`);
}
check('Product: no photos → empty result',
  saveProductImages({}).urls.length === 0 && saveProductImages(undefined).files.length === 0);

const written = [...product.files, ...single.files, ...passthrough.files];
deleteStoredFiles(written);
check('Product: cleanup removes files', written.every((f) => !fs.existsSync(f)));
check('Product: uploads/products back to its original size', countFiles(PRODUCT_DIR) === before, `(${countFiles(PRODUCT_DIR)})`);

console.log(failures === 0 ? '\nALL STORAGE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
