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
