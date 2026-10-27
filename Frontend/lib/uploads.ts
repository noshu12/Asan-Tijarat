import type { UploadPayload } from './api';

/**
 * Client-side helpers for every file the UI lets a user pick:
 *  • KYC documents  — CNIC front/back + NTN (registration Step 3)
 *  • Product photos — the picture(s) a supplier attaches to a listing
 *
 * The API accepts each file as a base64 `data:` URL, so photos straight off a
 * phone are down-scaled and re-encoded here before they are sent — a 4MB camera
 * shot usually lands under ~400KB, which keeps the request small without
 * hurting legibility.
 */

/** Mirrors the "max 5MB" copy in the forms and the server-side limit. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Value for the `<input type="file" accept>` attribute (KYC: PDF allowed). */
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Product photos must be renderable everywhere → no PDFs. */
export const IMAGE_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Matches the backend cap in src/utils/productImageStorage.js. */
export const MAX_PRODUCT_IMAGES = 5;

/** Longest edge an uploaded image is scaled down to before sending. */
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.82;
/** Below this size re-encoding is pointless — send the original bytes. */
const COMPRESS_THRESHOLD_BYTES = 900 * 1024;

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function extensionOf(fileName: string): string {
  return (fileName.split('.').pop() || '').toLowerCase();
}

/**
 * Returns a human-readable problem, or `null` when the file is acceptable.
 * Used by both the dropzones (immediate feedback) and the submit handlers.
 */
export function validateUploadFile(file: File): string | null {
  const type = file.type || '';
  const extension = extensionOf(file.name);
  const looksAccepted =
    ACCEPTED_UPLOAD_TYPES.includes(type) ||
    (type === '' && ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(extension));

  if (!looksAccepted) return 'Only JPG, PNG, WEBP or PDF files are accepted.';
  if (file.size > MAX_UPLOAD_BYTES) return 'File is larger than 5MB.';
  return null;
}

/** Same as above, but only images — used by the product-photo uploader. */
export function validateProductImage(file: File): string | null {
  const type = file.type || '';
  const extension = extensionOf(file.name);
  const looksAccepted =
    ACCEPTED_IMAGE_TYPES.includes(type) ||
    (type === '' && ['jpg', 'jpeg', 'png', 'webp'].includes(extension));

  if (!looksAccepted) return 'Product photo must be a JPG, PNG or WEBP image.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Image is larger than 5MB.';
  return null;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read the selected image.'));
    };
    image.src = objectUrl;
  });
}

/** Scales + re-encodes a photo to JPEG. Returns `null` when it is not worth it. */
async function compressImage(file: File): Promise<{ dataUrl: string; size: number } | null> {
  try {
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    // White backdrop so transparent PNGs don't turn black as JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const size = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    if (!size || size >= file.size) return null; // keep the original when bigger
    return { dataUrl, size };
  } catch {
    return null; // fall back to the untouched file
  }
}

/**
 * Converts a chosen file into the payload the API expects (base64 data URL +
 * original name). Images over ~900KB are down-scaled first; everything else is
 * sent as-is.
 */
export async function toUploadPayload(file: File): Promise<UploadPayload> {
  if (isImageFile(file) && file.size > COMPRESS_THRESHOLD_BYTES) {
    const compressed = await compressImage(file);
    if (compressed) {
      const base = file.name.replace(/\.[^.]+$/, '') || 'upload';
      return { dataUrl: compressed.dataUrl, name: `${base}.jpg` };
    }
  }
  return { dataUrl: await readAsDataUrl(file), name: file.name };
}

/** KYC documents (CNIC/NTN — a PDF is allowed) → used by the register wizard. */
export const toKycPayload = toUploadPayload;

/** Product photos → used by the supplier's Add Product form. */
export const toProductImagePayload = toUploadPayload;
