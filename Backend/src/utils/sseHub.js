'use strict';

// SSE hub (Batch 13) — in-memory registry of live event-stream connections.
//
// One user may have several tabs open, so the registry is
// Map<userId, Set<res>>. Every function here NEVER throws: a push failure
// must never break the order/payment/dispute action that triggered it
// (notify.js calls broadcast() inside its own try/catch as well).
//
// SCALING NOTE: this map lives in this one Node process. If the backend
// ever runs as several instances behind a load balancer, replace this
// module with a Redis pub/sub adapter behind the SAME interface
// (addClient / removeClient / broadcast / broadcastToAdmins /
// getConnectionCount) — no caller changes. No Redis code now: single
// Render instance, and the user does not pay for extra services.

const User = require('../models/User');

const MAX_CONNECTIONS_PER_USER = 5;
const ADMIN_CACHE_TTL_MS = 30 * 1000; // admin ids re-read at most every 30 s

/** userId (string) -> Set of live response objects for that user. */
const clients = new Map();

/** Cached admin + sub-admin ids: { ids: string[], fetchedAt: number }. */
let adminCache = { ids: [], fetchedAt: 0 };

function keyOf(userId) {
  return String(userId);
}

/**
 * Registers one SSE response for a user. Returns false when the user
 * already has MAX_CONNECTIONS_PER_USER live connections (the route then
 * answers 429) — otherwise true. The connection removes itself from the
 * registry when it closes, so a dead tab never leaks.
 */
function addClient(userId, res) {
  const key = keyOf(userId);
  let set = clients.get(key);
  if (!set) {
    set = new Set();
    clients.set(key, set);
  }
  if (set.size >= MAX_CONNECTIONS_PER_USER) return false;
  set.add(res);
  res.on('close', () => removeClient(userId, res));
  return true;
}

/** Removes one connection; drops the user's entry entirely when empty. */
function removeClient(userId, res) {
  const key = keyOf(userId);
  const set = clients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(key);
}

/**
 * Pushes one event to every live connection of one user.
 * `event` must carry `type` (the SSE event name, which is also the
 * notification type, e.g. 'order_placed') — the whole object is sent as
 * the JSON data. No connections = silent no-op. A failed write drops
 * that connection so a dead tab is never retried. Never throws.
 */
function broadcast(userId, event) {
  try {
    const set = clients.get(keyOf(userId));
    if (!set || set.size === 0) return;
    const type = event && typeof event.type === 'string' ? event.type : 'message';
    const payload = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of [...set]) {
      try {
        res.write(payload);
      } catch {
        // Dead connection — drop it and carry on with the rest.
        set.delete(res);
      }
    }
    if (set.size === 0) clients.delete(keyOf(userId));
  } catch (err) {
    console.log('[sse] broadcast failed:', err.message);
  }
}

/**
 * Admin + sub-admin userIds, cached for 30 s so a broadcast storm (e.g.
 * many orders at once) does not hit the DB once per event. A failed
 * lookup logs and returns the last good list (possibly empty) — the
 * notification rows are still written by notify.js either way.
 */
async function fetchAdminIds() {
  const now = Date.now();
  if (now - adminCache.fetchedAt < ADMIN_CACHE_TTL_MS) return adminCache.ids;
  try {
    const admins = await User.find(
      { role: { $in: ['admin', 'subadmin'] } },
      { _id: 1 }
    ).lean();
    adminCache = { ids: admins.map((a) => String(a._id)), fetchedAt: now };
  } catch (err) {
    console.log('[sse] admin lookup failed:', err.message);
  }
  return adminCache.ids;
}

/**
 * Pushes one event to every admin + sub-admin connection. Used for
 * admin-only events that are NOT stored as notifications; the normal
 * path (notifyAdmins -> notifyUser -> broadcast) needs no separate call.
 * Never throws.
 */
async function broadcastToAdmins(event) {
  try {
    const ids = await fetchAdminIds();
    for (const id of ids) {
      broadcast(id, event);
    }
  } catch (err) {
    console.log('[sse] broadcastToAdmins failed:', err.message);
  }
}

/** Total live SSE connections across all users (monitoring only). */
function getConnectionCount() {
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}

/** Live SSE connections for one user (0 when none). */
function getUserConnectionCount(userId) {
  const set = clients.get(keyOf(userId));
  return set ? set.size : 0;
}

module.exports = {
  MAX_CONNECTIONS_PER_USER,
  addClient,
  removeClient,
  broadcast,
  broadcastToAdmins,
  getConnectionCount,
  getUserConnectionCount,
};
