'use strict';

// avatar.js — avatar URL allow-list (Batch 17, Round-5 audit L2).
//
// `avatar` used to be stored exactly as the client sent it, so any
// `data:` / `javascript:` / `blob:` URL could be persisted and later
// rendered. The allow-list:
//   • '' (no avatar) and relative paths ('/uploads/...') — the normal
//     stored forms;
//   • http(s) URLs — Cloudinary / external avatars;
//   • data:image/*;base64,... — the profile-photo upload itself: the
//     settings page reads the picked file with FileReader.readAsDataURL
//     (after checking file.type starts with 'image/' and size ≤ 2 MB),
//     so a real image data URL is a legitimate stored avatar and must
//     keep working. Any other data: URL (notably data:text/html) is
//     rejected — that is the stored-URL surface the audit flagged.

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/** True when `value` is a safe avatar to store and later render in <img>. */
function isSafeAvatar(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v === '') return true;
  if (v.startsWith('/')) return true;
  if (/^https?:\/\//i.test(v)) return true;
  if (IMAGE_DATA_URL.test(v)) return true;
  return false;
}

module.exports = { isSafeAvatar };
