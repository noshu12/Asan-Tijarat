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
  fileSignatureMatches,
  sanitizeOriginalName,
  writeUploadedFile,
  deleteStoredFiles,
} = require('./uploadStorage');
const {
  isCloudinaryEnabled,
  uploadPrivateDocument,
  deleteCloudinaryAsset,
} = require('./cloudinary');

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
 * Validates + writes one document (disk or Cloudinary private — see
 * USE_CLOUDINARY). Cloudinary docs are PRIVATE: no public URL exists, the
 * admin route mints short-lived signed URLs from the stored publicId.
 * @returns {{ doc: object, file: string|null, cloudinaryId: string|null }}
 */
async function saveOneDocument(field, value) {
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
  // Magic-byte check: the data-URL mime header is client-controlled, so verify
  // the bytes really are a JPG/PNG/WEBP/PDF before writing the file to disk.
  if (!fileSignatureMatches(parsed.buffer, parsed.mimeType)) {
    throw new KycUploadError(`${label} content does not match its claimed file type.`);
  }

  // Cloudinary mode (production): PRIVATE document → Cloudinary.
  if (isCloudinaryEnabled()) {
    const publicId = `${field}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const { publicId: storedId } = await uploadPrivateDocument(parsed.buffer, {
      publicId,
      format: extension.replace('.', ''),
    });
    return {
      file: null,
      cloudinaryId: storedId,
      doc: {
        url: 'cloudinary:${storedId}',
        storage: 'cloudinary',
        publicId: storedId,
        resourceType: parsed.mimeType === 'application/pdf' ? 'raw' : 'image',
        originalName: sanitizeOriginalName(value && value.name, `${publicId}${extension}`),
        mimeType: parsed.mimeType,
        size: parsed.buffer.length,
        uploadedAt: new Date(),
      },
    };
  }

  // Local-disk mode (dev).
  const { file, url } = writeUploadedFile({
    buffer: parsed.buffer,
    extension,
    folder: FOLDER,
    prefix: field,
  });

  return {
    file,
    cloudinaryId: null,
    doc: {
      url,
      storage: 'local',
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
async function saveKycDocuments(input) {
  const documents = {};
  const files = [];
  const cloudinaryIds = [];

  if (!input || typeof input !== 'object') return { documents, files, cloudinaryIds };

  for (const field of DOCUMENT_FIELDS) {
    const value = input[field];
    if (!value || (typeof value === 'object' && !value.dataUrl)) continue;

    const saved = await saveOneDocument(field, value);
    documents[field] = saved.doc;
    if (saved.file) files.push(saved.file);
    if (saved.cloudinaryId) cloudinaryIds.push({ publicId: saved.cloudinaryId, resourceType: saved.doc.resourceType || 'image' });
  }

  return { documents, files, cloudinaryIds };
}

/**
 * Rollback helper — deletes disk files AND private Cloudinary documents
 * written for a registration whose DB write failed.
 */
async function deleteStoredUploads(stored) {
  const files = (stored && stored.files) || [];
  const cloudinaryIds = (stored && stored.cloudinaryIds) || [];
  if (files.length) deleteStoredFiles(files);
  for (const { publicId, resourceType } of cloudinaryIds) {
    // eslint-disable-next-line no-await-in-loop
    await deleteCloudinaryAsset(publicId, { resourceType, type: 'private' });
  }
}

module.exports = {
  saveKycDocuments,
  // Re-exported from uploadStorage so callers keep one import for KYC storage.
  deleteStoredFiles,
  deleteStoredUploads,
  KycUploadError,
  DOCUMENT_FIELDS,
  MAX_FILE_BYTES,
  UPLOAD_ROOT,
  PUBLIC_PREFIX,
};
