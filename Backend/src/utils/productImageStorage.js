// ────────────────────────────────────────────────────────────
//  Product photo storage
//
//  A supplier uploads photos from their device while adding a listing
//  (/supplier/add-product). The browser sends each picture as a base64
//  `data:` URL inside the JSON body of POST /api/products, this module
//  validates it, writes it under `Backend/uploads/products` and returns the
//  metadata that is stored ON the product document — so the uploaded image is
//  permanently linked to that listing and can be rendered everywhere the
//  product appears (supplier portal, marketplace, admin dashboard).
//
//  Order matters: the FIRST photo is the listing's cover image.
// ────────────────────────────────────────────────────────────
const {
  UploadError,
  parseDataUrl,
  sanitizeOriginalName,
  writeUploadedFile,
  deleteStoredFiles,
} = require('./uploadStorage');

const FOLDER = 'products';
/** Public URL prefix stored in MongoDB (frontend prepends the API origin). */
const PUBLIC_PREFIX = `/uploads/${FOLDER}`;

/** Images only — a listing photo must be renderable by every product view. */
const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Matches the "Max 5 images" hint in the add-product form. */
const MAX_PRODUCT_IMAGES = 5;

class ProductImageError extends UploadError {
  constructor(message) {
    super('PRODUCT_IMAGE_INVALID', message);
    this.name = 'ProductImageError';
  }
}

/**
 * Flattens the two accepted request shapes into one ordered list.
 * `images: [{ dataUrl, name }, …]` (the form) and `image: { dataUrl, name }`
 * (single upload) both work; plain strings are treated as already-stored URLs
 * and passed through untouched, so re-sending the current cover still works.
 */
function normalizeInput({ images, image } = {}) {
  const entries = [];

  const push = (value) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    entries.push(value);
  };

  push(images);
  if (image !== undefined) push(image);

  return entries;
}

/** Validates + writes one photo. */
function saveOneImage(entry) {
  if (typeof entry === 'string') return { url: entry.trim(), meta: null, file: null };

  const parsed = parseDataUrl(entry && entry.dataUrl);
  if (!parsed) {
    throw new ProductImageError('Product photo must be a base64 data URL.');
  }

  const extension = ALLOWED_MIME[parsed.mimeType];
  if (!extension) {
    throw new ProductImageError('Product photo must be a JPG, PNG or WEBP image.');
  }
  if (parsed.buffer.length > MAX_IMAGE_BYTES) {
    throw new ProductImageError('Product photo is larger than 5MB.');
  }

  const { file, url } = writeUploadedFile({
    buffer: parsed.buffer,
    extension,
    folder: FOLDER,
    prefix: 'product',
  });

  return {
    url,
    file,
    meta: {
      url,
      originalName: sanitizeOriginalName(entry && entry.name, file.split(/[\\/]/).pop()),
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      uploadedAt: new Date(),
    },
  };
}

/**
 * Stores every photo supplied with a listing.
 *
 * @param {{ images?: Array<{dataUrl: string, name?: string}|string>, image?: object|string }} payload
 * @returns {{ urls: string[], uploads: object[], files: string[] }} the ordered
 *          photo URLs (index 0 = cover), the metadata of the files written and
 *          their absolute paths (for cleanup after a failed DB write).
 * @throws {ProductImageError} on an invalid or missing-exceeding upload.
 */
function saveProductImages(payload) {
  const entries = normalizeInput(payload);
  const urls = [];
  const uploads = [];
  const files = [];

  if (entries.length > MAX_PRODUCT_IMAGES) {
    throw new ProductImageError(`A listing can have at most ${MAX_PRODUCT_IMAGES} photos.`);
  }

  for (const entry of entries) {
    const saved = saveOneImage(entry);
    if (!saved.url) continue;

    urls.push(saved.url);
    if (saved.meta) uploads.push(saved.meta);
    if (saved.file) files.push(saved.file);
  }

  return { urls, uploads, files };
}

module.exports = {
  saveProductImages,
  deleteStoredFiles,
  ProductImageError,
  PUBLIC_PREFIX,
  MAX_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
};
