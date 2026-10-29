// ────────────────────────────────────────────────────────────
//  KYC document storage
//
//  Registration (Step 3 of /getstarted) collects three compliance
//  documents:
//    • cnicFront   — front side of the CNIC (both roles)
//    • cnicBack    — back side of the CNIC (both roles)
//    • ntn         — NTN certificate / scanned copy (supplier only)
//    • utilityBill — shop utility bill showing the account number
//                    (shopkeeper only, since the 2026-10-29 redesign)
//
//  The browser sends each one as a base64 `data:` URL inside the JSON
//  body of POST /api/auth/register, so the API needs no multipart
//  dependency (no multer). This module validates every file, writes it
//  under `Backend/uploads/kyc` (shared plumbing lives in uploadStorage.js)
//  and returns the metadata that is stored on the user document — the real
//  uploaded images the Admin Dashboard renders (never a placeholder).
// ────────────────────────────────────────────────────────────
const {
  UPLOAD_ROOT,
  UploadError,
  parseDataUrl,
  sanitizeOriginalName,
  writeUploadedFile,
  deleteStoredFiles,
} = require('./uploadStorage');

const FOLDER = 'kyc';
/** Public URL prefix stored in MongoDB (frontend prepends the API origin). */
const PUBLIC_PREFIX = `/uploads/${FOLDER}`;

/** Mirrors the "max 5MB" copy shown in the registration wizard. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/** Fields accepted under `documents` on POST /api/auth/register. */
const DOCUMENT_FIELDS = ['cnicFront', 'cnicBack', 'ntn', 'utilityBill'];

/** Human labels used in validation messages. */
const DOCUMENT_LABELS = {
  cnicFront: 'CNIC front image',
  cnicBack: 'CNIC back image',
  ntn: 'NTN certificate',
  utilityBill: 'Shop utility bill',
};

class KycUploadError extends UploadError {
  constructor(message) {
    super('KYC_UPLOAD_INVALID', message);
    this.name = 'KycUploadError';
  }
}

/**
 * Validates + writes one document to disk.
 * @returns {{ doc: object, file: string }} metadata for MongoDB and the path
 *          written (kept so a failed registration can clean up after itself).
 */
function saveOneDocument(field, value) {
  const label = DOCUMENT_LABELS[field] || field;
  const parsed = parseDataUrl(value && value.dataUrl);

  if (!parsed) {
    throw new KycUploadError(`${label} must be a base64 data URL.`);
  }
  const extension = ALLOWED_MIME[parsed.mimeType];
  if (!extension) {
    throw new KycUploadError(`${label} must be a JPG, PNG, WEBP or PDF file.`);
  }
  if (parsed.buffer.length > MAX_FILE_BYTES) {
    throw new KycUploadError(`${label} is larger than 5MB.`);
  }

  const { file, url } = writeUploadedFile({
    buffer: parsed.buffer,
    extension,
    folder: FOLDER,
    prefix: field,
  });

  return {
    file,
    doc: {
      url,
      originalName: sanitizeOriginalName(value && value.name, file.split(/[\\/]/).pop()),
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      uploadedAt: new Date(),
    },
  };
}


/**
 * Stores every supplied KYC document.
 *
 * @param {object|undefined} input `{ cnicFront?, cnicBack?, ntn?, utilityBill? }`
 *        where each entry is `{ dataUrl, name }`. Missing/blank entries are
 *        ignored, so the endpoint stays backward compatible with registrations
 *        that send no documents at all.
 * @returns {{ documents: object, files: string[] }} the metadata to persist on
 *          the User document plus the absolute paths written (for cleanup).
 * @throws {KycUploadError} on an invalid file.
 */
function saveKycDocuments(input) {
  const documents = {};
  const files = [];

  if (!input || typeof input !== 'object') return { documents, files };

  for (const field of DOCUMENT_FIELDS) {
    const value = input[field];
    if (!value || (typeof value === 'object' && !value.dataUrl)) continue;

    const saved = saveOneDocument(field, value);
    documents[field] = saved.doc;
    files.push(saved.file);
  }

  return { documents, files };
}

module.exports = {
  saveKycDocuments,
  // Re-exported from uploadStorage so callers keep one import for KYC storage.
  deleteStoredFiles,
  KycUploadError,
  DOCUMENT_FIELDS,
  MAX_FILE_BYTES,
  UPLOAD_ROOT,
  PUBLIC_PREFIX,
};
