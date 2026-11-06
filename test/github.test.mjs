import { test } from 'node:test';
import assert from 'node:assert/strict';
import { github } from '../scripts/lib/github.mjs';

const answer = (status, body = {}) => ({ ok: status < 400, status, json: async () => body, text: async () => 'x', headers: new Map() });
const client = (answers, sink = []) => github({
  token: 't', repo: 'o/r', sleep: async () => {},
  fetchImpl: async (url, init) => { sink.push(init.method); const a = answers.shift(); if (a instanceof Error) throw a; return a; },
});

test('a GitHub 503 is retried instead of killing the step (PR #162)', async () => {
  const gh = client([answer(503), answer(200, { number: 162 })]);
  assert.equal((await gh.getPr(162)).number, 162);
});

test('a network error is retried too', async () => {
  const gh = client([new Error('ECONNRESET'), answer(200, { number: 1 })]);
  assert.equal((await gh.getPr(1)).number, 1);
});

test('retries stop after a few tries and the error is reported', async () => {
  const sink = [];
  const gh = client([answer(503), answer(503), answer(503), answer(503)], sink);
  await assert.rejects(gh.getPr(1), /503/);
  assert.equal(sink.length, 4);
});

test('a POST is not repeated on a 500/502 (it may have been written), only on 503', async () => {
  const sink = [];
  await assert.rejects(client([answer(502)], sink).comment(1, 'hi'), /502/);
  assert.equal(sink.length, 1);
  assert.ok(await client([answer(503), answer(201, { id: 1 })]).comment(1, 'hi'));
});

test('a 4xx is not retried', async () => {
  const sink = [];
  await assert.rejects(client([answer(422)], sink).merge(1), /422/);
  assert.equal(sink.length, 1);
});

const limited = (status, headers) => ({ ok: false, status, json: async () => ({}), text: async () => 'rate limit', headers: new Map(Object.entries(headers)) });

test('a 429 pauses for the time GitHub asks, then the same call is retried', async () => {
  const waits = [];
  const answers = [limited(429, { 'retry-after': '3' }), answer(200, { number: 5 })];
  const gh = github({ token: 't', repo: 'o/r', sleep: async (ms) => { waits.push(ms); }, fetchImpl: async () => answers.shift() });
  assert.equal((await gh.getPr(5)).number, 5);
  assert.deepEqual(waits, [3000]);
});

test('a rate-limited POST is retried (GitHub did not apply it)', async () => {
  const sink = [];
  const gh = client([limited(403, { 'retry-after': '1' }), answer(201, { id: 1 })], sink);
  assert.ok(await gh.comment(1, 'hi'));
  assert.equal(sink.length, 2);
});

test('a wait too long to spend in place throws RateLimited, the event is taken up later', async () => {
  const gh = client([limited(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800) })]);
  await assert.rejects(gh.getPr(1), (e) => e.rateLimited === true && e.waitMs > 60_000);
});

test('a 403 without rate-limit headers is thrown at once (a refused permission)', async () => {
  const sink = [];
  await assert.rejects(client([limited(403, {})], sink).merge(1), (e) => /403/.test(e.message) && !e.rateLimited);
  assert.equal(sink.length, 1);
});

test('paginated reads pause on the rate limit too', async () => {
  const gh = client([limited(429, { 'retry-after': '2' }), answer(200, [{ id: 1 }])]);
  assert.deepEqual(await gh.listComments(1), [{ id: 1 }]);
});

test('pauses stop once three minutes were spent waiting in one run: the event is then taken up later', async () => {
  const many = Array.from({ length: 10 }, () => limited(429, { 'retry-after': '50' }));
  const gh = client([...many, answer(200, { number: 1 })]);
  await gh.getPr(1).catch(() => {});
  await gh.getPr(1).catch(() => {});
  await assert.rejects(gh.getPr(1), (e) => e.rateLimited === true);
});

test('no pause runs past the job\'s time: after 12 minutes of run, the limit is passed on so the event is taken up later', async () => {
  let t = 0;
  const gh = github({ token: 't', repo: 'o/r', now: () => t, sleep: async () => {}, fetchImpl: async () => answers.shift() });
  const answers = [limited(429, { 'retry-after': '30' }), answer(200, { number: 1 })];
  t = 11.8 * 60_000;
  await assert.rejects(gh.getPr(1), (e) => e.rateLimited === true);
});
