'use strict';

// Tests for calcPlatformFee / platformFeePercent
// (Backend/src/utils/payment.js, Batch 05).
//
// Node's built-in runner only — no new dependencies, no MongoDB,
// no network. Run: `npm test` from the Backend folder.
// The fee % is read from process.env.PLATFORM_FEE_PERCENT on every
// call, so each test sets the env var it needs and restores it after.

const test = require('node:test');
const assert = require('node:assert/strict');

const { calcPlatformFee, platformFeePercent } = require('../src/utils/payment');

const ENV_KEY = 'PLATFORM_FEE_PERCENT';
let savedEnv;

function setFee(value) {
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = String(value);
}

test.beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
});

test.afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

test('default (env unset): 0% fee — nothing is ever charged', () => {
  setFee(undefined);
  assert.equal(platformFeePercent(), 0);
  assert.equal(calcPlatformFee(10000), 0);
  assert.equal(calcPlatformFee(999999), 0);
});

test('2% fee on whole totals', () => {
  setFee('2');
  assert.equal(calcPlatformFee(10000), 200);
  assert.equal(calcPlatformFee(5000), 100);
  assert.equal(calcPlatformFee(0), 0);
});

test('fee is rounded to whole rupees (no paisa fractions)', () => {
  setFee('10');
  assert.equal(calcPlatformFee(999), 100); // 99.9 -> 100
  setFee('2');
  assert.equal(calcPlatformFee(125), 3); // 2.5 -> 3
});

test('decimal fee % works', () => {
  setFee('2.5');
  assert.equal(platformFeePercent(), 2.5);
  assert.equal(calcPlatformFee(1000), 25);
});

test('fee % is clamped to 0–100', () => {
  setFee('150');
  assert.equal(platformFeePercent(), 100);
  assert.equal(calcPlatformFee(10000), 10000); // never more than the total
  setFee('100');
  assert.equal(calcPlatformFee(10000), 10000);
  setFee('-5');
  assert.equal(platformFeePercent(), 0);
  assert.equal(calcPlatformFee(10000), 0);
});

test('garbage env value means 0% (never crashes, never charges)', () => {
  setFee('abc');
  assert.equal(platformFeePercent(), 0);
  assert.equal(calcPlatformFee(10000), 0);
  setFee('');
  assert.equal(platformFeePercent(), 0);
});

test('bad totals mean a 0 fee', () => {
  setFee('2');
  assert.equal(calcPlatformFee(-100), 0);
  assert.equal(calcPlatformFee(0), 0);
  assert.equal(calcPlatformFee('abc'), 0);
  assert.equal(calcPlatformFee(undefined), 0);
  assert.equal(calcPlatformFee(null), 0);
});

test('numeric-string total is accepted (Number coercion)', () => {
  setFee('2');
  assert.equal(calcPlatformFee('1000'), 20);
});
