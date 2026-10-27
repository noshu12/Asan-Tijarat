const mongoose = require('mongoose');

/**
 * Shared GPS-location helpers used by the auth (registration / profile) and
 * order (checkout) flows.
 */

/**
 * GPS point captured by the browser's Geolocation API — rendered as a
 * clickable Google Maps link in the Admin Dashboard and on order details.
 */
const deviceLocationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    capturedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * Normalises a browser-captured GPS point to { lat, lng, capturedAt }.
 * Returns null when either coordinate is missing or out of range, so a
 * malformed client payload can never end up as a broken Maps link.
 */
function sanitizeLocation(input) {
  if (!input || typeof input !== 'object') return null;
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
  return { lat, lng, capturedAt: Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt };
}

/**
 * Google Maps URL that drops the pin exactly on the GPS point. Works in any
 * browser and deep-links the Maps app on mobile, so a supplier can tap it
 * and navigate straight to the shopkeeper.
 */
function googleMapsLink(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
}

module.exports = { deviceLocationSchema, sanitizeLocation, googleMapsLink };
