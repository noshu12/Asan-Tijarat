'use strict';

// Tests for the realtime SSE stream (Batch 13):
//   • Backend/src/utils/sseHub.js — hub registry + broadcast
//   • Backend/src/routes/realtime.routes.js — GET /api/realtime/stream
//
// Node's built-in runner only — no new dependencies, no MongoDB,
// no network, no listening server. Run: `npm test` from the Backend
// folder.
//
// The User model is stubbed through the require cache BEFORE sseHub is
// loaded, so broadcastToAdmins can be tested without a database. The
// stub only answers the admin-ids query the hub makes; every other
// method throws, so a test that accidentally touches the DB fails
// loudly instead of hanging on a connection.
//
// Behaviour under test (read from the source, not assumed):
//   • hub: one user, several tabs; 5-connection cap (6th refused);
//     removeClient drops empty users (no leak); broadcast writes
//     `event: <type>\ndata: <json>` to that user's connections ONLY;
//     a failed write drops that connection; broadcast never throws,
//     even with no connections or a throwing res;
//   • broadcastToAdmins reaches only admin + subadmin ids, and caches
//     the lookup for 30 s (second call within the window = no new query);
//   • route: unauthenticated GET /stream -> 401 (the real `protect`
//     middleware, no token at all, so no DB is touched); a 6th tab for
//     the same user -> 429 TOO_MANY_CONNECTIONS with no stream headers;
//     11 connects in a minute -> 429 TOO_MANY_STREAMS on the 11th.

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

// --- Stub the User model before anything requires it -------------------
const ADMIN_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ADMIN_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const USER_A = '111111111111111111111111';
const USER_B = '222222222222222222222222';

let userFindCalls = 0;
const fakeUser = {
  find(filter) {
    userFindCalls += 1;
    // The hub asks for role in ['admin', 'subadmin'], _id only.
    assert.deepEqual(filter, { role: { $in: ['admin', 'subadmin'] } });
    return {
      lean: async () => [{ _id: ADMIN_A }, { _id: ADMIN_B }],
    };
  },
  findById() {
    throw new Error('test bug: User.findById must not run (no DB in tests)');
  },
};
require.cache[require.resolve('../src/models/User')] = {
  id: require.resolve('../src/models/User'),
  filename: require.resolve('../src/models/User'),
  loaded: true,
  exports: fakeUser,
};

const sseHub = require('../src/utils/sseHub');
const realtime = require('../src/routes/realtime.routes');
const { streamHandler } = realtime;

// --- Small fakes --------------------------------------------------------
function makeRes() {
  const res = new EventEmitter();
  res.writes = [];
  res.statusCode = null;
  res.body = null;
  res.ended = false;
  res.write = function write(chunk) {
    if (this.writeThrows) throw new Error('boom: socket closed');
    this.writes.push(String(chunk));
    return true;
  };
  res.writeHead = function writeHead(status, headers) {
    this.statusCode = status;
    this.headers = headers;
  };
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function json(body) {
    this.body = body;
    return this;
  };
  res.end = function end() {
    this.ended = true;
    this.emit('close');
    return this;
  };
  return res;
}

function makeReq({ userId = USER_A, cookies = {} } = {}) {
  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/stream';
  req.path = '/stream';
  req.cookies = cookies;
  req.user = userId ? { _id: userId } : undefined;
  req.get = () => undefined;
  return req;
}

/** Calls streamHandler and returns the fake res. Cleans up timers. */
function connect(userId) {
  const req = makeReq({ userId });
  const res = makeRes();
  streamHandler(req, res);
  return { req, res };
}

// --- Hub: registration + cap -------------------------------------------
test('hub: one user can hold several tabs, up to 5', () => {
  const conns = [];
  for (let i = 0; i < 5; i += 1) {
    const res = makeRes();
    assert.equal(sseHub.addClient(USER_A, res), true, `tab ${i + 1}`);
    conns.push(res);
  }
  assert.equal(sseHub.getUserConnectionCount(USER_A), 5);
  assert.equal(sseHub.getConnectionCount(), 5);
  // 6th tab is refused and does not register.
  assert.equal(sseHub.addClient(USER_A, makeRes()), false);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 5);
  for (const res of conns) res.emit('close');
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
  assert.equal(sseHub.getConnectionCount(), 0);
});

test('hub: removeClient drops the user entry when the last tab closes (no leak)', () => {
  const res1 = makeRes();
  const res2 = makeRes();
  sseHub.addClient(USER_A, res1);
  sseHub.addClient(USER_B, res2);
  sseHub.removeClient(USER_A, res1);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
  assert.equal(sseHub.getUserConnectionCount(USER_B), 1);
  // Removing a res that was never added is a no-op, not a crash.
  sseHub.removeClient(USER_A, makeRes());
  sseHub.removeClient(USER_B, res2);
  assert.equal(sseHub.getConnectionCount(), 0);
});

test('hub: close event on the res removes it automatically', () => {
  const res = makeRes();
  sseHub.addClient(USER_A, res);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 1);
  res.emit('close');
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
});

// --- Hub: broadcast ------------------------------------------------------
test('hub: broadcast writes event + JSON data to that user only', () => {
  const resA1 = makeRes();
  const resA2 = makeRes();
  const resB = makeRes();
  sseHub.addClient(USER_A, resA1);
  sseHub.addClient(USER_A, resA2);
  sseHub.addClient(USER_B, resB);

  sseHub.broadcast(USER_A, {
    id: 'n1', type: 'order_placed', title: 'Order placed', message: '', link: '', orderId: null, createdAt: '2026-11-21T00:00:00.000Z',
  });

  const expected = 'event: order_placed\ndata: {"id":"n1","type":"order_placed","title":"Order placed","message":"","link":"","orderId":null,"createdAt":"2026-11-21T00:00:00.000Z"}\n\n';
  assert.deepEqual(resA1.writes, [expected]);
  assert.deepEqual(resA2.writes, [expected]);
  // User B never sees user A's event.
  assert.deepEqual(resB.writes, []);

  for (const res of [resA1, resA2, resB]) res.emit('close');
});

test('hub: broadcast to a user with no connections is a silent no-op', () => {
  assert.doesNotThrow(() => {
    sseHub.broadcast('333333333333333333333333', { type: 'chat_message', title: 'hi' });
  });
});

test('hub: a failed write drops that connection and the rest still get the event', () => {
  const dead = makeRes();
  dead.writeThrows = true;
  const live = makeRes();
  sseHub.addClient(USER_A, dead);
  sseHub.addClient(USER_A, live);
  assert.doesNotThrow(() => sseHub.broadcast(USER_A, { type: 'chat_message', title: 'hi' }));
  assert.equal(sseHub.getUserConnectionCount(USER_A), 1);
  assert.equal(live.writes.length, 1);
  live.emit('close');
});

test('hub: broadcast never throws, even for a res that throws on write', () => {
  const res = makeRes();
  res.write = () => { throw new Error('socket gone'); };
  sseHub.addClient(USER_A, res);
  assert.doesNotThrow(() => sseHub.broadcast(USER_A, { type: 'order_placed' }));
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
});

// --- Hub: broadcastToAdmins ----------------------------------------------
test('hub: broadcastToAdmins reaches only admins, and caches the lookup for 30 s', async () => {
  userFindCalls = 0;
  const resAdminA = makeRes();
  const resAdminB = makeRes();
  const resUser = makeRes();
  sseHub.addClient(ADMIN_A, resAdminA);
  sseHub.addClient(ADMIN_B, resAdminB);
  sseHub.addClient(USER_A, resUser);

  await sseHub.broadcastToAdmins({ type: 'order_placed', title: 'New order' });
  assert.equal(userFindCalls, 1);
  assert.equal(resAdminA.writes.length, 1);
  assert.equal(resAdminB.writes.length, 1);
  assert.deepEqual(resUser.writes, []);
  assert.match(resAdminA.writes[0], /^event: order_placed\n/);

  // Second broadcast inside the 30 s window: no new DB query.
  await sseHub.broadcastToAdmins({ type: 'order_placed', title: 'Again' });
  assert.equal(userFindCalls, 1);
  assert.equal(resAdminA.writes.length, 2);

  for (const res of [resAdminA, resAdminB, resUser]) res.emit('close');
});

// --- Route: auth + caps ---------------------------------------------------
test('route: unauthenticated GET /stream -> 401 (real protect, no token)', async () => {
  const router = realtime;
  const req = makeReq({ userId: null, cookies: {} });
  const res = makeRes();
  let nextCalled = false;
  await new Promise((resolve) => {
    router.handle(req, res, () => { nextCalled = true; resolve(); });
    // protect() answers synchronously for a missing token; if it does
    // not, the promise below still resolves via the json() call.
    setImmediate(resolve);
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('route: connect writes SSE headers + ": connected", heartbeat is a 25 s interval', () => {
  realtime._resetConnectThrottle();
  const { req, res } = connect(USER_A);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/event-stream');
  assert.equal(res.headers['Cache-Control'], 'no-cache, no-transform');
  assert.equal(res.headers.Connection, 'keep-alive');
  assert.equal(res.headers['X-Accel-Buffering'], 'no');
  assert.deepEqual(res.writes, [': connected\n\n']);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 1);
  req.emit('close');
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
});

test('route: 6th tab for the same user -> 429 TOO_MANY_CONNECTIONS, no stream started', () => {
  realtime._resetConnectThrottle();
  const conns = [];
  for (let i = 0; i < 5; i += 1) conns.push(connect(USER_A));
  for (const { res } of conns) assert.equal(res.statusCode, 200);

  const { res } = connect(USER_A);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error.code, 'TOO_MANY_CONNECTIONS');
  assert.deepEqual(res.writes, []);
  assert.equal(sseHub.getUserConnectionCount(USER_A), 5);

  for (const { req } of conns) req.emit('close');
  assert.equal(sseHub.getUserConnectionCount(USER_A), 0);
});

test('route: 11 connects in a minute -> 429 TOO_MANY_STREAMS on the 11th', () => {
  realtime._resetConnectThrottle();
  const conns = [];
  for (let i = 0; i < 10; i += 1) {
    const c = connect(USER_B);
    assert.equal(c.res.statusCode, 200, `connect ${i + 1}`);
    // Close each one straight away so the 5-tab cap never interferes:
    // this test is about the per-minute throttle, not the cap.
    c.req.emit('close');
    conns.push(c);
  }
  const eleventh = connect(USER_B);
  assert.equal(eleventh.res.statusCode, 429);
  assert.equal(eleventh.res.body.error.code, 'TOO_MANY_STREAMS');
  assert.equal(sseHub.getUserConnectionCount(USER_B), 0);
  realtime._resetConnectThrottle();
});
