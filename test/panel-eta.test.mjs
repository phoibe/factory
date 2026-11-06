import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelIntervals, stageMinutes, estimate, etaText, humanMinutes, DEFAULT_MINUTES, parseEstimate, rangeText, buildingMinutes, BUILD_DEFAULTS } from '../panel/eta.mjs';

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
  assert.ok(e.nextLow < 30 && e.nextHigh > 30 && e.nextLow >= 1);
  assert.equal(e.total, 30 + 3 + 6 + 2);
  assert.equal(e.endAt, T0 + (15 + 41) * 60_000);
});

test('an item waiting for the owner never guesses the owner time', () => {
  const evs = [ev(4, 'labeled', 'factory:visual-review', 0)];
  const e = estimate({ number: 4, labels: ['factory:visual-review'], column: 'visual', pull_request: {} }, evs, DEFAULT_MINUTES, T0 + 5 * 60_000);
  assert.deepEqual([e.status, e.next, e.endAt, e.total], ['yours', null, null, 6 + 2]);
  assert.match(etaText(e), /^Attend votre réponse depuis 5 min · ensuite ~8 min/);
});

test('bugs skip grilling and spec, queued items only say they wait for a slot, overruns are admitted', () => {
  const bug = estimate({ number: 5, labels: ['factory:bug', 'factory:building', 'factory:running'], column: 'building' },
    [ev(5, 'labeled', 'factory:building', 0), ev(5, 'labeled', 'factory:running', 0)], DEFAULT_MINUTES, T0 + 90 * 60_000);
  assert.equal(bug.overrun, true);
  assert.ok(bug.next >= 0 && bug.nextLow >= 0);
  assert.equal(estimate({ number: 6, labels: ['factory:queued'], column: 'queued' }, [], DEFAULT_MINUTES, T0).status, 'queued');
});

test('etaText and humanMinutes read naturally', () => {
  assert.equal(humanMinutes(45), '45 min');
  assert.equal(humanMinutes(65), '1 h 05');
  assert.equal(humanMinutes(120), '2 h');
  const text = etaText({ status: 'working', since: 3, nextLow: 10, nextHigh: 16, next: 13, total: 50, endAt: T0 });
  assert.equal(text, "entre 10 et 16 min avant l'étape suivante (hors vos réponses)");
  assert.match(etaText({ status: 'working', overrun: true }), /^Plus long que prévu/);
});

const c = (body, min) => ({ body: body.includes('factory-estimate') ? '<!-- factory-agent -->\n' + body : body, created_at: at(min) });
const tag = (size, lo, hi) => `<!-- factory-agent -->\n<!-- factory-estimate size=${size} min=${lo} max=${hi} -->\nEstimation`;

test('parseEstimate keeps the latest valid estimate, ignores junk, fixes inverted or absurd ranges', () => {
  assert.equal(parseEstimate([c('hello', 0)]), null);
  assert.equal(parseEstimate([c('<!-- factory-estimate size=huge min=1 max=2 -->', 0)]), null);
  const latest = parseEstimate([c(tag('small', 10, 20), 0), c(tag('large', 60, 90), 30), c('merci', 40)]);
  assert.deepEqual([latest.size, latest.min, latest.max, latest.at], ['large', 60, 90, T0 + 30 * 60_000]);
  const swapped = parseEstimate([c(tag('medium', 40, 20), 0)]);
  assert.deepEqual([swapped.min, swapped.max], [20, 40]);
  const wide = parseEstimate([c(tag('medium', 5, 180), 0)]);
  assert.equal(wide.max, 5 * 2.5 | 0 || 12);
  assert.equal(parseEstimate([c(tag('small', 0, 0), 0)]).min, 1);
});

test('a card in building shows the agent range reduced by the time already spent', () => {
  const evs = [ev(7, 'labeled', 'factory:building', 0), ev(7, 'labeled', 'factory:running', 0)];
  const item = { number: 7, labels: ['factory:feature', 'factory:building', 'factory:running'], column: 'building' };
  const agent = { size: 'small', min: 20, max: 40, at: T0 };
  const e = estimate(item, evs, DEFAULT_MINUTES, T0 + 10 * 60_000, agent);
  assert.deepEqual([e.nextLow, e.nextHigh, e.overrun], [10, 30, false]);
  assert.equal(rangeText(e.nextLow, e.nextHigh), 'entre 10 et 30 min');
});

test('an agent range above the measured history of its size is brought down to that history', () => {
  const evs = [ev(17, 'labeled', 'factory:building', 0), ev(17, 'labeled', 'factory:running', 0)];
  const item = { number: 17, labels: ['factory:feature', 'factory:building', 'factory:running'], column: 'building' };
  // Builds of this size really take about 15 min; the agent announced 30 to 70.
  const e = estimate(item, evs, { ...DEFAULT_MINUTES, building: 15 }, T0 + 10 * 60_000, { size: 'small', min: 30, max: 70, at: T0 });
  assert.deepEqual([e.nextLow, e.nextHigh, e.overrun], [1, 11, false]);
});

test('past the top of the range the card says it is longer than planned, never a negative value', () => {
  const evs = [ev(8, 'labeled', 'factory:building', 0), ev(8, 'labeled', 'factory:running', 0)];
  const item = { number: 8, labels: ['factory:feature', 'factory:building', 'factory:running'], column: 'building' };
  const e = estimate(item, evs, DEFAULT_MINUTES, T0 + 50 * 60_000, { size: 'small', min: 20, max: 40, at: T0 });
  assert.equal(e.overrun, true);
  assert.ok(e.nextLow >= 0 && e.nextHigh >= 0);
  // a fresh estimate posted after the overrun replaces it
  const again = estimate(item, evs, DEFAULT_MINUTES, T0 + 50 * 60_000, { size: 'small', min: 10, max: 20, at: T0 + 49 * 60_000 });
  assert.equal(again.overrun, false);
});

test('an estimate older than the current build is ignored; without one the fallback range is used', () => {
  const evs = [ev(9, 'labeled', 'factory:building', 10), ev(9, 'labeled', 'factory:running', 10)];
  const item = { number: 9, labels: ['factory:feature', 'factory:building', 'factory:running'], column: 'building' };
  const stale = estimate(item, evs, DEFAULT_MINUTES, T0 + 12 * 60_000, { size: 'small', min: 1, max: 2, at: T0 });
  const none = estimate(item, evs, DEFAULT_MINUTES, T0 + 12 * 60_000);
  assert.deepEqual([stale.nextLow, stale.nextHigh], [none.nextLow, none.nextHigh]);
  assert.ok(none.nextLow < 43 && none.nextHigh > 43 && none.nextHigh / none.nextLow <= 2.5);
});

test('buildingMinutes uses per-size medians once two builds of that size are done, else size defaults', () => {
  assert.deepEqual(buildingMinutes([], T0, {}), BUILD_DEFAULTS);
  assert.ok(BUILD_DEFAULTS.small < BUILD_DEFAULTS.medium && BUILD_DEFAULTS.medium < BUILD_DEFAULTS.large);
  const evs = [];
  for (const [n, len] of [[1, 12], [2, 16], [3, 80]]) {
    evs.push(ev(n, 'labeled', 'factory:building', 0), ev(n, 'labeled', 'factory:running', 0), ev(n, 'unlabeled', 'factory:running', len), ev(n, 'unlabeled', 'factory:building', len + 1));
  }
  const m = buildingMinutes(evs, T0 + 500 * 60_000, { 1: 'small', 2: 'small', 3: 'large' });
  assert.equal(m.small, 14);
  assert.equal(m.large, BUILD_DEFAULTS.large); // a single sample is not enough
});

test('rangeText stays readable', () => {
  assert.equal(rangeText(20, 40), 'entre 20 et 40 min');
  assert.equal(rangeText(50, 80), 'entre 50 min et 1 h 20');
  assert.equal(rangeText(5, 5), 'environ 5 min');
});

test('rangeText says "moins de" when the low end is gone, so the ratio never looks absurd', () => {
  assert.equal(rangeText(0, 31), 'moins de 31 min');
  assert.equal(rangeText(1, 25), 'moins de 25 min');
});

test('parseEstimate only trusts the agent\'s own comments and caps absurd minutes', () => {
  assert.equal(parseEstimate([{ body: '<!-- factory-estimate size=small min=10 max=20 -->', created_at: at(0) }]), null); // not posted by the agent
  const big = parseEstimate([c(tag('large', 5000, 9000), 0)]);
  assert.ok(big.max <= 480 && big.min <= big.max);
});

test('with no label history the elapsed time still comes from the estimate date', () => {
  const item = { number: 11, labels: ['factory:feature', 'factory:building', 'factory:running'], column: 'building' };
  const e = estimate(item, [], DEFAULT_MINUTES, T0 + 90 * 60_000, { size: 'small', min: 20, max: 40, at: T0 });
  assert.equal(e.overrun, true);
});

// Real order of events: the relay adds « running » a few seconds before « building » (#209, 2026-11-06).
const sec = (number, event, label, s) => ({ issue: { number }, event, label: { name: label }, created_at: new Date(T0 + s * 1000).toISOString() });

test('a run started seconds before the building label still counts, so the card does not freeze at the start', () => {
  const evs = [sec(9, 'labeled', 'factory:running', 0), sec(9, 'labeled', 'factory:building', 3)];
  const item = { number: 9, labels: ['factory:audit', 'factory:building', 'factory:running'], column: 'building' };
  const early = estimate(item, evs, { ...DEFAULT_MINUTES, building: 20 }, T0 + 2 * 60_000);
  const later = estimate(item, evs, { ...DEFAULT_MINUTES, building: 20 }, T0 + 12 * 60_000);
  assert.ok(later.nextHigh < early.nextHigh, `${early.nextHigh} -> ${later.nextHigh}`);
  assert.equal(estimate(item, evs, { ...DEFAULT_MINUTES, building: 20 }, T0 + 25 * 60_000).overrun, true);
});

test('the build history counts the run that started just before the building label', () => {
  const evs = [];
  for (const [n, len] of [[1, 20], [2, 30]]) {
    evs.push(sec(n, 'labeled', 'factory:running', 0), sec(n, 'labeled', 'factory:building', 3), sec(n, 'unlabeled', 'factory:running', len * 60),
      sec(n, 'labeled', 'factory:running', 100 * 60), sec(n, 'unlabeled', 'factory:running', 101 * 60), sec(n, 'unlabeled', 'factory:building', 200 * 60));
  }
  assert.equal(Math.round(stageMinutes(evs, T0 + 300 * 60_000).building), 25);
  assert.equal(Math.round(buildingMinutes(evs, T0 + 300 * 60_000, { 1: 'small', 2: 'small' }).small), 25);
});
