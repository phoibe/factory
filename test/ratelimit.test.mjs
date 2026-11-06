import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimitDelay, RateLimited, isRateLimited, MAX_PAUSE_MS } from '../scripts/lib/ratelimit.mjs';

const h = (o = {}) => new Map(Object.entries(o));
const NOW = 1_000_000_000_000;

test('a 429 waits the time GitHub gives in retry-after', () => {
  assert.equal(rateLimitDelay(429, h({ 'retry-after': '7' }), NOW), 7000);
});

test('a 403 with no calls left waits until the limit resets', () => {
  assert.equal(rateLimitDelay(403, h({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 120) }), NOW), 120_000);
});

test('a bare 429 waits one minute', () => {
  assert.equal(rateLimitDelay(429, h(), NOW), 60_000);
});

test('a 403 that is a refused permission is not a rate limit', () => {
  assert.equal(rateLimitDelay(403, h({ 'x-ratelimit-remaining': '4000' }), NOW), null);
  assert.equal(rateLimitDelay(404, h(), NOW), null);
  assert.equal(rateLimitDelay(200, h(), NOW), null);
});

test('RateLimited carries the wait and is recognised', () => {
  const e = new RateLimited(90_000);
  assert.equal(e.waitMs, 90_000);
  assert.ok(isRateLimited(e));
  assert.ok(!isRateLimited(new Error('403')));
  assert.equal(MAX_PAUSE_MS, 60_000);
});
