// ────────────────────────────────────────────────────────────
//  Shared upload plumbing
//
//  Every file this API accepts arrives as a base64 `data:` URL inside a JSON
//  body (no multipart parser, no multer):
//    • registration KYC documents  → src/utils/kycStorage.js
//    • supplier product photos     → src/utils/productImageStorage.js
//
//  This module owns what both features share: data-URL parsing, file-name
//  sanitising, writing under `Backend/uploads/<folder>` (served by server.js at
//  `GET /uploads/*`) and cleaning up after a failed write.
// ────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** `Backend/uploads` — the static root. */
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

/** Base class for every validation failure raised by the storage helpers. */
class UploadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

/**
 * Parses `data:<mime>;base64,<payload>`.
 * @returns {{ mimeType: string, buffer: Buffer } | null} `null` when the value
 *          is not a usable data URL.
 */
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) return null;
  return { mimeType, buffer };
}

/**
 * Checks the file's REAL content against its claimed type using magic bytes.
 * The data-URL mime header is client-controlled — without this, a hostile
 * client could store e.g. an HTML/JS payload with a `.jpg` name under
 * /uploads, which browsers might then sniff and execute.
 *
 * Supported: JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A),
 * WEBP (RIFF....WEBP), PDF (%PDF).
 *
 * @returns {boolean} true when the buffer's signature matches the mime type.
 */
function fileSignatureMatches(buffer, mimeType) {
  if (!buffer || buffer.length < 12 || typeof mimeType !== 'string') return false;
  const m = mimeType.toLowerCase();
  switch (m) {
    case 'image/jpeg':
    case 'image/jpg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png': {
      const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      return sig.every((b, i) => buffer[i] === b);
    }
    case 'image/webp':
      return (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
      );
    case 'application/pdf':
      return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    default:
      return false;
  }
}

/** Strips folder components / control characters from a client-supplied name. */
function sanitizeOriginalName(name, fallback) {
  if (typeof name !== 'string' || !name.trim()) return fallback;
  const base = path.basename(name.trim()).replace(/[^\w.\- ]+/g, '_');
  return base.slice(0, 120) || fallback;
}

/**
 * Writes a validated buffer to `uploads/<folder>/<prefix>-<timestamp>-<rand><ext>`.
 * The stored file name is generated server-side, so a hostile client name can
 * never escape the upload folder.
 * @returns {{ file: string, url: string }} absolute path + public URL path.
 */
function writeUploadedFile({ buffer, extension, folder, prefix }) {
  const directory = path.join(UPLOAD_ROOT, folder);
  fs.mkdirSync(directory, { recursive: true });

  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
  const file = path.join(directory, filename);
  fs.writeFileSync(file, buffer);

  return { file, url: `/uploads/${folder}/${filename}` };
}

/** Removes files written by a request that failed afterwards. */
function deleteStoredFiles(files) {
  if (!Array.isArray(files)) return;
  for (const file of files) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* already gone — nothing to clean up */
    }
  }
}

module.exports = {
  UPLOAD_ROOT,
  UploadError,
  parseDataUrl,
  fileSignatureMatches,
  sanitizeOriginalName,
  writeUploadedFile,
  deleteStoredFiles,
};
