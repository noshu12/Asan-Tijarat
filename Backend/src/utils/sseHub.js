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
// (addClient / removeClient / broadcast / broadcastToAll /
// getConnectionCount) — no caller changes. No Redis code now: single Render instance, and the user does
// not pay for extra services.
//
// Batch 20 (audit (c)-3) — `broadcastToAdmins` (+ `fetchAdminIds` and
// the 30 s admin-id cache) was deleted here: a repo-wide grep found zero
// production callers — every admin event goes through notifyAdmins ->
// notifyUser -> broadcast (utils/notify.js) — and the only other user
// was its own unit test (test/sse.test.js), which was updated with it.
// If an admin-only live event that is NOT stored as a notification is
// ever needed, re-add a targeted broadcast then; until then this dead
// surface (and its unused DB query path) stays out.
//
// Batch 23 (TEAMLY realtime audit, public-catalogue fan-out) —
// `broadcastToAll` below is the ONE deliberate exception to the
// userId-targeted rule: product_created / stock_updated / price_updated
// must reach marketplace + product-page viewers, who are NOT admins and
// have no notification row. Only those three public catalogue types may
// use it (see notifyPublic in utils/notify.js); order/user/KYC events
// stay notifyUser/notifyAdmins only. The payload carries catalogue data
// only (product name/price/stock via title/message/link) — no CNIC, NTN,
// phone, address, or payment reference ever goes through it.

const MAX_CONNECTIONS_PER_USER = 5;

/** userId (string) -> Set of live response objects for that user. */
const clients = new Map();

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

/** Total live SSE connections across all users (monitoring only). */
function getConnectionCount() {
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}

/**
 * Pushes one event to EVERY live connection, regardless of user.
 *
 * Batch 23 (TEAMLY realtime audit, public-catalogue fan-out) — the
 * deliberate, documented exception to the userId-targeted rule. Only
 * the three public catalogue types (product_created, stock_updated,
 * price_updated) may use it, via notifyPublic in utils/notify.js:
 * marketplace + product-page viewers are not admins and have no
 * notification row, so a targeted broadcast cannot reach them. The
 * event must carry public catalogue data only — never CNIC, NTN,
 * phone, address, or a payment reference. Order/user/KYC events must
 * NEVER come through here; those stay notifyUser/notifyAdmins only.
 *
 * A viewer who is ALSO a targeted recipient (e.g. a buyer of the
 * product, or an admin) receives the event twice on the wire — once
 * targeted, once here. Both frames carry the same type + link, so the
 * frontend must treat catalogue events as idempotent refresh triggers
 * (dedupe on type + link). Never throws.
 */
function broadcastToAll(event) {
  try {
    if (clients.size === 0) return;
    const type = event && typeof event.type === 'string' ? event.type : 'message';
    const payload = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const [key, set] of [...clients]) {
      for (const res of [...set]) {
        try {
          res.write(payload);
        } catch {
          // Dead connection — drop it and carry on with the rest.
          set.delete(res);
        }
      }
      if (set.size === 0) clients.delete(key);
    }
  } catch (err) {
    console.log('[sse] broadcastToAll failed:', err.message);
  }
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
  broadcastToAll,
  getConnectionCount,
  getUserConnectionCount,
};
