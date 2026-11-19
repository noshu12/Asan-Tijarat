'use strict';

// Tests for the CSRF double-submit middleware
// (Backend/src/middleware/csrf.js, new audit #20).
//
// Node's built-in runner only — no new dependencies, no MongoDB,
// no network, no Express server: req/res/next are small mocks.
// Run: `npm test` from the Backend folder.
//
// Behaviour under test (read from csrf.js, not assumed):
//   • non-/api paths pass straight through, no token needed;
//   • GET / HEAD / OPTIONS on /api/* issue a token when the browser
//     has none (res.cookie 'asan_csrf', 24 h) and expose it as
//     req.csrfToken; an existing cookie is reused, not re-issued;
//   • POST / PUT / PATCH / DELETE on /api/* need the same value in
//     the `x-csrf-token` header as in the `asan_csrf` cookie —
//     missing or mismatched -> 403 { error: { code:
//     'CSRF_TOKEN_INVALID', ... } }, handler never runs (next not
//     called); matching -> next().

const test = require('node:test');
const assert = require('node:assert/strict');

const { csrfProtection, CSRF_COOKIE, CSRF_HEADER } = require('../src/middleware/csrf');

const TOKEN = 'a'.repeat(64); // a valid-looking issued token (64 hex chars)
const OTHER = 'b'.repeat(64);

function makeReq({ method = 'GET', path = '/api/orders', cookies = {}, headers = {} } = {}) {
  const lowerHeaders = {};
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v;
  return {
    method,
    path,
    cookies,
    // Express req.get() is case-insensitive.
    get(name) {
      return lowerHeaders[String(name).toLowerCase()];
    },
  };
}

function makeRes() {
  const res = {
    cookieCalls: [],
    statusCode: null,
    body: null,
    cookie(name, value, options) {
      this.cookieCalls.push({ name, value, options });
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

function run(req, res) {
  let nextCalls = 0;
  csrfProtection(req, res, () => { nextCalls += 1; });
  return nextCalls;
}

test('GET /api/* with no cookie issues a token and exposes it on req', () => {
  const req = makeReq({ method: 'GET', path: '/api/orders' });
  const res = makeRes();
  assert.equal(run(req, res), 1);
  assert.match(req.csrfToken, /^[0-9a-f]{64}$/);
  assert.equal(res.cookieCalls.length, 1);
  assert.equal(res.cookieCalls[0].name, CSRF_COOKIE);
  assert.equal(res.cookieCalls[0].value, req.csrfToken);
  assert.equal(res.cookieCalls[0].options.httpOnly, false); // frontend JS must read it
  assert.equal(res.cookieCalls[0].options.path, '/');
  assert.equal(res.cookieCalls[0].options.maxAge, 24 * 60 * 60 * 1000);
  assert.equal(res.statusCode, null); // no error response
});

test('GET /api/* with an existing cookie reuses it and sets no new cookie', () => {
  const req = makeReq({ method: 'GET', path: '/api/orders', cookies: { [CSRF_COOKIE]: TOKEN } });
  const res = makeRes();
  assert.equal(run(req, res), 1);
  assert.equal(req.csrfToken, TOKEN);
  assert.equal(res.cookieCalls.length, 0);
});

test('HEAD and OPTIONS on /api/* behave like GET (token issued)', () => {
  for (const method of ['HEAD', 'OPTIONS']) {
    const req = makeReq({ method, path: '/api/orders' });
    const res = makeRes();
    assert.equal(run(req, res), 1, method);
    assert.match(req.csrfToken, /^[0-9a-f]{64}$/, method);
  }
});

test('non-/api paths pass through with no token work', () => {
  const req = makeReq({ method: 'POST', path: '/health' });
  const res = makeRes();
  assert.equal(run(req, res), 1);
  assert.equal(req.csrfToken, undefined);
  assert.equal(res.cookieCalls.length, 0);
  assert.equal(res.statusCode, null);
});

test('POST /api/* with matching cookie + header passes', () => {
  const req = makeReq({
    method: 'POST',
    path: '/api/orders',
    cookies: { [CSRF_COOKIE]: TOKEN },
    headers: { [CSRF_HEADER]: TOKEN },
  });
  const res = makeRes();
  assert.equal(run(req, res), 1);
  assert.equal(res.statusCode, null);
});

test('PUT and DELETE with a matching token pass; PATCH too', () => {
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const req = makeReq({
      method,
      path: '/api/orders/1',
      cookies: { [CSRF_COOKIE]: TOKEN },
      headers: { [CSRF_HEADER]: TOKEN },
    });
    const res = makeRes();
    assert.equal(run(req, res), 1, method);
  }
});

test('POST /api/* with no cookie and no header -> 403 CSRF_TOKEN_INVALID', () => {
  const req = makeReq({ method: 'POST', path: '/api/orders' });
  const res = makeRes();
  assert.equal(run(req, res), 0); // handler never runs
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'CSRF_TOKEN_INVALID');
  assert.equal(typeof res.body.error.message, 'string');
});

test('POST /api/* with cookie but no header -> 403', () => {
  const req = makeReq({
    method: 'POST',
    path: '/api/orders',
    cookies: { [CSRF_COOKIE]: TOKEN },
  });
  const res = makeRes();
  assert.equal(run(req, res), 0);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'CSRF_TOKEN_INVALID');
});

test('POST /api/* with header but no cookie -> 403', () => {
  const req = makeReq({
    method: 'POST',
    path: '/api/orders',
    headers: { [CSRF_HEADER]: TOKEN },
  });
  const res = makeRes();
  assert.equal(run(req, res), 0);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'CSRF_TOKEN_INVALID');
});

test('POST /api/* with mismatched cookie and header -> 403', () => {
  const req = makeReq({
    method: 'POST',
    path: '/api/orders',
    cookies: { [CSRF_COOKIE]: TOKEN },
    headers: { [CSRF_HEADER]: OTHER },
  });
  const res = makeRes();
  assert.equal(run(req, res), 0);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'CSRF_TOKEN_INVALID');
});

test('DELETE /api/* with a mismatched token -> 403 (not just POST)', () => {
  const req = makeReq({
    method: 'DELETE',
    path: '/api/orders/1',
    cookies: { [CSRF_COOKIE]: TOKEN },
    headers: { [CSRF_HEADER]: OTHER },
  });
  const res = makeRes();
  assert.equal(run(req, res), 0);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'CSRF_TOKEN_INVALID');
});

test('header name is read case-insensitively (X-CSRF-Token)', () => {
  const req = makeReq({
    method: 'POST',
    path: '/api/orders',
    cookies: { [CSRF_COOKIE]: TOKEN },
    headers: { 'X-CSRF-Token': TOKEN },
  });
  const res = makeRes();
  assert.equal(run(req, res), 1);
});
