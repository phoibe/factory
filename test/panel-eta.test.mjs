import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelIntervals, stageMinutes, estimate, etaText, humanMinutes, DEFAULT_MINUTES } from '../panel/eta.mjs';

const T0 = Date.parse('2026-11-03T18:00:00Z');
const at = (min) => new Date(T0 + min * 60_000).toISOString();
const ev = (number, event, label, min) => ({ issue: { number }, event, label: { name: label }, created_at: at(min) });

test('labelIntervals pairs labeled/unlabeled and leaves the current one open', () => {
  const evs = [ev(1, 'labeled', 'factory:running', 0), ev(1, 'unlabeled', 'factory:running', 5), ev(1, 'labeled', 'factory:running', 20)];
  const iv = labelIntervals(evs, 1, 'factory:running', T0 + 30 * 60_000);
  assert.equal(iv.length, 2);
  assert.equal(iv[1].open, true);
});

test('stageMinutes uses defaults until two finished stays exist, then the median of agent time', () => {
  assert.deepEqual(stageMinutes([], T0), DEFAULT_MINUTES);
  const evs = [];
  for (const [n, len] of [[1, 30], [2, 50]]) {
    evs.push(ev(n, 'labeled', 'factory:building', 0), ev(n, 'labeled', 'factory:running', 0), ev(n, 'unlabeled', 'factory:running', len),
      ev(n, 'labeled', 'factory:running', 100), ev(n, 'unlabeled', 'factory:running', 110), ev(n, 'unlabeled', 'factory:building', 200));
  }
  const m = stageMinutes(evs, T0 + 300 * 60_000);
  assert.equal(m.building, 40); // only the first run in "building" counts: the later one is a PR fix
  assert.equal(m.grilling, DEFAULT_MINUTES.grilling);
});

test('a running build estimates its remaining time and the whole remaining flow', () => {
  const evs = [ev(3, 'labeled', 'factory:building', 0), ev(3, 'labeled', 'factory:running', 0)];
  const e = estimate({ number: 3, labels: ['factory:feature', 'factory:building', 'factory:running'], column: 'building' }, evs, DEFAULT_MINUTES, T0 + 15 * 60_000);
  assert.equal(e.status, 'working');
  assert.equal(e.since, 15);
  assert.equal(e.next, 30);
  assert.equal(e.total, 30 + 3 + 6 + 2);
  assert.equal(e.endAt, T0 + (15 + 41) * 60_000);
});

test('an item waiting for the owner never guesses the owner time', () => {
  const evs = [ev(4, 'labeled', 'factory:visual-review', 0)];
  const e = estimate({ number: 4, labels: ['factory:visual-review'], column: 'visual', pull_request: {} }, evs, DEFAULT_MINUTES, T0 + 5 * 60_000);
  assert.deepEqual([e.status, e.next, e.endAt, e.total], ['yours', null, null, 6 + 2]);
  assert.match(etaText(e), /^Attend ta réponse depuis 5 min · ensuite ~8 min/);
});

test('bugs skip grilling and spec, queued items only say they wait for a slot, overruns keep a small margin', () => {
  const bug = estimate({ number: 5, labels: ['factory:bug', 'factory:building', 'factory:running'], column: 'building' },
    [ev(5, 'labeled', 'factory:building', 0), ev(5, 'labeled', 'factory:running', 0)], DEFAULT_MINUTES, T0 + 90 * 60_000);
  assert.equal(bug.next, 2);
  assert.equal(estimate({ number: 6, labels: ['factory:queued'], column: 'queued' }, [], DEFAULT_MINUTES, T0).status, 'queued');
});

test('etaText and humanMinutes read naturally', () => {
  assert.equal(humanMinutes(45), '45 min');
  assert.equal(humanMinutes(65), '1 h 05');
  assert.equal(humanMinutes(120), '2 h');
  const text = etaText({ status: 'working', since: 3, next: 12, total: 50, endAt: T0 }, () => '19:00');
  assert.equal(text, "~12 min avant l'étape suivante · fin estimée vers 19:00 (hors tes réponses)");
});
