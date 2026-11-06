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

// Issue #212: the queue lock's sign of life moves the lock forward, never over a run that took it over.
test('the queue lock gives a sign of life by moving its ref forward, and knows when it lost it', async () => {
  const calls = [];
  const replies = {
    'GET /git/ref/factory/lock': [null],
    'POST /git/trees': [{ sha: 'tree1' }],
    'POST /git/commits': [{ sha: 'c1' }, { sha: 'c2' }, { sha: 'c3' }],
    'POST /git/refs': [{}],
    'PATCH /git/refs/factory/lock': [{}, 422],
  };
  const gh = github({
    token: 't', repo: 'o/r', sleep: async () => {},
    fetchImpl: async (url, init) => {
      const key = `${init.method} ${url.replace('https://api.github.com/repos/o/r', '')}`;
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      const a = (replies[key] || []).shift();
      if (a === null) return answer(404);
      if (a === 422) return answer(422);
      return answer(200, a);
    },
  });
  assert.equal(await gh.queueLock.acquire(), true);
  assert.equal(await gh.queueLock.refresh(), true);
  const beat = calls.filter((c) => c.key === 'POST /git/commits')[1].body;
  assert.deepEqual(beat.parents, ['c1']);
  assert.equal(beat.tree, 'tree1');
  const patch = calls.find((c) => c.key === 'PATCH /git/refs/factory/lock').body;
  assert.deepEqual(patch, { sha: 'c2', force: false });
  // Someone took the lock over: the fast-forward is refused, and this run no longer owns it.
  assert.equal(await gh.queueLock.refresh(), false);
  const before = calls.length;
  await gh.queueLock.release();
  assert.ok(!calls.slice(before).some((c) => c.key.startsWith('DELETE')), 'never drops a lock it lost');
});
