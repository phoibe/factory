import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNetworkFailure, readOutage, writeOutage, outageStep, isRetry, syncStep, OUTAGE_TOLD } from '../scripts/lib/outage.mjs';

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.parse('2026-11-06T10:00:00Z');

test('network and GitHub outages are recognised in a failed download', () => {
  for (const text of [
    'npm error code ECONNRESET\nnpm error network aborted',
    'npm ERR! code ETIMEDOUT',
    'npm error code E503\nnpm error 503 Service Unavailable - GET https://registry.npmjs.org/x',
    'getaddrinfo EAI_AGAIN registry.npmjs.org',
    'Error: Download failed: server returned code 502',
    'request to https://registry.npmjs.org/axe-core failed, reason: socket hang up',
    'HTTP 504: Gateway Timeout',
  ]) assert.equal(isNetworkFailure(text), true, text);
});

test('in doubt it is the code: ordinary errors are not outages', () => {
  for (const text of ['', 'npm error code ERESOLVE\nunable to resolve dependency tree', 'npm error code E404 Not Found', 'SyntaxError: Unexpected token', 'found 2 high severity vulnerabilities']) {
    assert.equal(isNetworkFailure(text), false, text);
  }
});

test('the outage state round-trips through a PR body and is removed cleanly', () => {
  const body = 'Résumé\n\nCloses #4';
  const s = { sha: 'abc', since: T0, tries: 1, next: null };
  const written = writeOutage(body, s);
  assert.deepEqual(readOutage(written), s);
  assert.equal(readOutage(writeOutage(written, { ...s, tries: 2 })).tries, 2);
  assert.equal(writeOutage(written, null), body);
  assert.equal(readOutage(body), null);
});

test('first outage: silent retry in about 2 minutes', () => {
  const step = outageStep(null, { sha: 'abc', now: T0 });
  assert.equal(step.action, 'wait');
  assert.equal(step.retryInMs, 2 * MIN);
  assert.equal(step.tell, false);
  assert.equal(step.state.since, T0);
});

test('second outage: silent retry about 10 minutes later', () => {
  const step = outageStep({ sha: 'abc', since: T0, tries: 1 }, { sha: 'abc', now: T0 + 5 * MIN });
  assert.equal(step.retryInMs, null);
  assert.equal(step.state.next, T0 + 15 * MIN);
  assert.equal(step.tell, false);
});

test('after the two retries: one message, then every 30 minutes', () => {
  const third = outageStep({ sha: 'abc', since: T0, tries: 2 }, { sha: 'abc', now: T0 + 20 * MIN });
  assert.equal(third.tell, true);
  assert.equal(third.state.next, T0 + 50 * MIN);
  const fourth = outageStep(third.state, { sha: 'abc', now: T0 + 55 * MIN });
  assert.equal(fourth.tell, false);
  assert.equal(fourth.state.next, T0 + 85 * MIN);
  assert.match(OUTAGE_TOLD, /GitHub ou le réseau a un problème en ce moment, je réessaie plus tard, rien à faire de votre côté\./);
});

test('after 3 hours of outage the card is blocked', () => {
  const step = outageStep({ sha: 'abc', since: T0, tries: 7, told: true }, { sha: 'abc', now: T0 + 3 * H });
  assert.equal(step.action, 'block');
  assert.equal(step.state.blocked, true);
});

test('a new commit starts the schedule again from zero', () => {
  const step = outageStep({ sha: 'old', since: T0 - 5 * H, tries: 6, told: true }, { sha: 'new', now: T0 });
  assert.equal(step.action, 'wait');
  assert.equal(step.retryInMs, 2 * MIN);
  assert.equal(step.state.since, T0);
});

test('« réessaie » and its variants are a retry, other messages are not', () => {
  for (const t of ['réessaie', 'Réessaie !', 'reessaie', 'réessayer stp', 'relance', 'retry']) assert.equal(isRetry(t), true, t);
  for (const t of ['simplifie la feature', 'pourquoi ça bloque ?', '']) assert.equal(isRetry(t), false, t);
});

test('sync: a first difference dispatches at once', () => {
  const s = syncStep(null, { mine: 'v2', theirs: 'v1', now: T0 });
  assert.equal(s.dispatch, true);
  assert.deepEqual(s.state, { fingerprint: 'v2', since: T0, tries: 1, last: T0 });
});

test('sync: retries after 5 min, 30 min, 2 h, then once a day', () => {
  let state = syncStep(null, { mine: 'v2', theirs: 'v1', now: T0 }).state;
  let t = T0;
  for (const wait of [5 * MIN, 30 * MIN, 2 * H, 24 * H, 24 * H]) {
    assert.equal(syncStep(state, { mine: 'v2', theirs: 'v1', now: t + wait - MIN }).dispatch, false, `before ${wait}`);
    const s = syncStep(state, { mine: 'v2', theirs: 'v1', now: t + wait });
    assert.equal(s.dispatch, true, `at ${wait}`);
    state = s.state;
    t += wait;
  }
});

test('sync: one alert after a day of failures, never again', () => {
  const state = { fingerprint: 'v2', since: T0, tries: 4, last: T0 + 3 * H };
  assert.equal(syncStep(state, { mine: 'v2', theirs: 'v1', now: T0 + 23 * H }).alert, false);
  const s = syncStep(state, { mine: 'v2', theirs: 'v1', now: T0 + 24 * H });
  assert.equal(s.alert, true);
  assert.equal(s.changed, true);
  assert.equal(syncStep(s.state, { mine: 'v2', theirs: 'v1', now: T0 + 50 * H }).alert, false);
});

test('sync: success or a new factory version starts again from zero', () => {
  const state = { fingerprint: 'v2', since: T0, tries: 4, last: T0, alerted: true };
  const ok = syncStep(state, { mine: 'v2', theirs: 'v2', now: T0 + H });
  assert.deepEqual([ok.state, ok.dispatch, ok.changed], [null, false, true]);
  assert.deepEqual(syncStep(null, { mine: 'v2', theirs: 'v2', now: T0 }).changed, false);
  const fresh = syncStep(state, { mine: 'v3', theirs: 'v1', now: T0 + H });
  assert.deepEqual([fresh.dispatch, fresh.state.since, fresh.state.tries], [true, T0 + H, 1]);
});
