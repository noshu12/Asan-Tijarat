// ────────────────────────────────────────────────────────────
//  Delivery-proof photo storage (Batch 05)
//
//  At delivery the supplier uploads ONE photo as proof that the goods
//  reached the shopkeeper (see the dispute rules: reasons 9-11 are decided
//  on this proof + the shopkeeper's delivery confirmation). The photo is
//  stored exactly like a product photo — Cloudinary in production, local
//  disk in dev — and its metadata is saved ON the order (deliveryProof),
//  so the later blockchain phase can hash it. No hashing happens here.
// ────────────────────────────────────────────────────────────
const path = require('path');
const {
  parseDataUrl,
  fileSignatureMatches,
  sanitizeOriginalName,
  writeUploadedFile,
  UploadError,
} = require('./uploadStorage');
const {
  isCloudinaryEnabled,
  uploadPublicImage,
} = require('./cloudinary');

const FOLDER = 'delivery';
/** Images only — a delivery proof must be viewable by both parties + admin. */
const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

class DeliveryProofError extends UploadError {
  constructor(message) {
    super('DELIVERY_PROOF_INVALID', message);
    this.name = 'DeliveryProofError';
  }
}

/**
 * Validates + stores one delivery photo.
 * @param {{ dataUrl: string, name?: string }} entry
 * @returns {{ url, storage, publicId, originalName, mimeType, size, uploadedAt }}
 * @throws {DeliveryProofError} on an invalid upload.
 */
async function saveDeliveryPhoto(entry) {
  const parsed = parseDataUrl(entry && entry.dataUrl);
  if (!parsed) {
    throw new DeliveryProofError('Delivery photo must be a base64 data URL.');
  }

  const extension = ALLOWED_MIME[parsed.mimeType];
  if (!extension) {
    throw new DeliveryProofError('Delivery photo must be a JPG, PNG or WEBP image.');
  }
  if (parsed.buffer.length > MAX_IMAGE_BYTES) {
    throw new DeliveryProofError('Delivery photo is larger than 5MB.');
  }
  // Magic-byte check: the data-URL mime header is client-controlled.
  if (!fileSignatureMatches(parsed.buffer, parsed.mimeType)) {
    throw new DeliveryProofError('Delivery photo content does not match its claimed image type.');
  }

  const publicId = `delivery_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // Cloudinary mode (production): public photo both parties can open.
  if (isCloudinaryEnabled()) {
    const { secureUrl, publicId: storedId } = await uploadPublicImage(parsed.buffer, {
      publicId,
      format: extension.replace('.', ''),
      folder: 'asan-tijarat/delivery',
    });
    return {
      url: secureUrl,
      storage: 'cloudinary',
      publicId: storedId,
      originalName: sanitizeOriginalName(entry && entry.name, `${publicId}${extension}`),
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      uploadedAt: new Date(),
    };
  }

  // Local-disk mode (dev). Served at /uploads/delivery/* (see server.js).
  const { file, url } = writeUploadedFile({
    buffer: parsed.buffer,
    extension,
    folder: FOLDER,
    prefix: 'delivery',
  });

  return {
    url,
    storage: 'local',
    publicId: null,
    originalName: sanitizeOriginalName(entry && entry.name, path.basename(file)),
    mimeType: parsed.mimeType,
    size: parsed.buffer.length,
    uploadedAt: new Date(),
  };
}

module.exports = { saveDeliveryPhoto, DeliveryProofError };
