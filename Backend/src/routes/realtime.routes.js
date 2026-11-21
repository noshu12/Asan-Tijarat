'use strict';

// Realtime stream (Batch 13) — GET /api/realtime/stream.
//
// One long-lived Server-Sent Events connection per browser tab. The
// frontend opens it once after login and listens for the SAME event
// names as the notification types (order_placed, payment_submitted,
// chat_message, ...) — notify.js broadcasts every stored notification
// to the hub, so the bell, the orders list and the chat update without
// a page reload.
//
// Auth: the EXISTING `protect` middleware — no new auth system. A
// missing/invalid token is 401 before any header is written.
//
// Rate limits: /api/apiLimiter (per-IP, mounted in server.js) already
// covers this route, so no second IP limiter is added here. What IS
// added is per-USER: at most 5 live connections (extra tabs get 429)
// and at most 10 stream connects per user per minute (reconnect storms
// get 429). Both are in-memory only.

const express = require('express');
const { protect } = require('../middleware/auth');
const sseHub = require('../utils/sseHub');

const router = express.Router();

const HEARTBEAT_MS = 25 * 1000;
const MAX_CONNECTS_PER_MINUTE = 10;
const CONNECT_WINDOW_MS = 60 * 1000;

/** userId (string) -> timestamps (ms) of recent stream connects. */
const connectAttempts = new Map();

function isThrottled(userId) {
  const key = String(userId);
  const now = Date.now();
  const recent = (connectAttempts.get(key) || []).filter((t) => now - t < CONNECT_WINDOW_MS);
  if (recent.length >= MAX_CONNECTS_PER_MINUTE) {
    connectAttempts.set(key, recent);
    return true;
  }
  recent.push(now);
  connectAttempts.set(key, recent);
  return false;
}

/**
 * GET /api/realtime/stream — opens the SSE stream for the logged-in user.
 * Headers are set BEFORE any write; the first frame is a `: connected`
 * comment so the client knows the stream is live, and a `: ping` comment
 * goes out every 25 s so proxies and the browser never time the idle
 * connection out. On disconnect the heartbeat stops and the hub entry
 * is removed. Logging is counts only — never userId, email or tokens.
 */
function streamHandler(req, res) {
  const userId = String(req.user._id);

  if (isThrottled(userId)) {
    return res.status(429).json({
      error: { code: 'TOO_MANY_STREAMS', message: 'Too many stream reconnects. Please wait a minute and try again.' },
    });
  }

  // Per-user connection cap — checked BEFORE any header is written, so a
  // refused 6th tab still gets a clean 429 JSON instead of a half-open
  // stream. A refused attempt does not register in the hub.
  if (sseHub.getUserConnectionCount(userId) >= sseHub.MAX_CONNECTIONS_PER_USER) {
    return res.status(429).json({
      error: { code: 'TOO_MANY_CONNECTIONS', message: 'Too many live tabs. Close one and try again.' },
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // addClient returns false only if the cap filled between the check
  // above and this call (two tabs connecting at once) — then the stream
  // is already open, so just end it instead of answering JSON.
  if (!sseHub.addClient(userId, res)) {
    res.end();
    return;
  }

  console.log(`[sse] connect total=${sseHub.getConnectionCount()}`);

  try {
    res.write(': connected\n\n');
  } catch {
    sseHub.removeClient(userId, res);
    return;
  }

  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      cleanup();
      return;
    }
    try {
      res.write(': ping\n\n');
    } catch {
      cleanup();
    }
  }, HEARTBEAT_MS);

  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    sseHub.removeClient(userId, res);
    console.log(`[sse] disconnect total=${sseHub.getConnectionCount()}`);
  }

  // req 'close' fires when the browser tab closes or the network drops;
  // res 'close' covers the server side ending the response. Either one
  // must stop the heartbeat, or the interval leaks.
  req.on('close', cleanup);
  res.on('close', cleanup);
}

router.get('/stream', protect, streamHandler);

module.exports = router;
// Exported for the unit tests (test/sse.test.js) — the route itself is
// the only production entry point.
module.exports.streamHandler = streamHandler;
module.exports._resetConnectThrottle = () => connectAttempts.clear();
module.exports._throttleLimits = { MAX_CONNECTS_PER_MINUTE, CONNECT_WINDOW_MS };
