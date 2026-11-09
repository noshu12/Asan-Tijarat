// cloudinary.js — Cloudinary storage backend (#2 Cloudinary FINAL, 7/8 pre-deploy).
//
// Two storage modes, toggled by env (no code change):
//   USE_CLOUDINARY=true  → files go to Cloudinary (production)
//   anything else        → files stay on local disk (dev)
//
// Product photos → PUBLIC on Cloudinary (anyone can view listings).
// KYC documents  → PRIVATE on Cloudinary (signed URLs, generated only by
//                  the backend admin route — never exposed publicly).
//
// Credentials live ONLY in Backend/.env:
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// Never in chat, never in git.

const cloudinary = require('cloudinary').v2;

let configured = false;

function isCloudinaryEnabled() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return (
    String(process.env.USE_CLOUDINARY || '').toLowerCase() === 'true' &&
    Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)
  );
}

function ensureConfigured() {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

/**
 * Uploads a PUBLIC product photo. Returns { secureUrl, publicId }.
 * Folder keeps the Cloudinary media library organized per environment.
 */
function uploadProductImage(buffer, { publicId, format }) {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'asan-tijarat/products',
        public_id: publicId,
        format,
        resource_type: 'image',
        // Public listing photos — anyone with the URL can view them.
        type: 'upload',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ secureUrl: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Uploads a PUBLIC image to a given Cloudinary folder. Generic version of
 * uploadProductImage — Batch 05 uses it for delivery-proof photos
 * (folder 'asan-tijarat/delivery'). Returns { secureUrl, publicId }.
 */
function uploadPublicImage(buffer, { publicId, format, folder }) {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        format,
        resource_type: 'image',
        // Public photo — both trading parties + admin can open it.
        type: 'upload',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ secureUrl: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Uploads a PRIVATE KYC document. Returns { publicId }.
 * `type: 'private'` (authenticated) means no public URL exists — access
 * only via signed URLs minted by the backend admin route.
 */
function uploadPrivateDocument(buffer, { publicId, format }) {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'asan-tijarat/kyc',
        public_id: publicId,
        format,
        // PDFs go as raw; images stay images. Both private.
        resource_type: format === 'pdf' ? 'raw' : 'image',
        type: 'private',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Mints a short-lived signed URL for a PRIVATE document.
 * Only the backend admin route calls this — the URL is never stored.
 */
function getPrivateSignedUrl(publicId, { resourceType = 'image', expiresInSeconds = 600 } = {}) {
  ensureConfigured();
  return cloudinary.url(publicId, {
    type: 'private',
    sign_url: true,
    secure: true,
    resource_type: resourceType,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
}

/** Deletes one Cloudinary asset (rollback after a failed DB write). */
async function deleteCloudinaryAsset(publicId, { resourceType = 'image', type = 'upload' } = {}) {
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type });
  } catch (err) {
    console.log('[cloudinary] rollback delete failed:', publicId, err.message);
  }
}

module.exports = {
  isCloudinaryEnabled,
  uploadProductImage,
  uploadPublicImage,
  uploadPrivateDocument,
  getPrivateSignedUrl,
  deleteCloudinaryAsset,
};
