import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepsFor, progress, laneFor, actionFor, moves, agoText, pollDelay, timeLine, isIdle, cardChanges, yoursList } from '../panel/live.mjs';

test('a feature goes through six steps, a bug skips the questions and the spec', () => {
  assert.deepEqual(stepsFor(['factory:feature']).map((s) => s.id), ['grilling', 'spec', 'building', 'visual', 'checks', 'acceptance']);
  assert.deepEqual(stepsFor(['factory:bug']).map((s) => s.id), ['building', 'visual', 'checks', 'acceptance']);
});

test('progress places the card on its step', () => {
  assert.deepEqual(progress({ column: 'visual', labels: ['factory:feature', 'factory:visual-review'] }), { index: 3, total: 6, name: 'Captures' });
  assert.deepEqual(progress({ column: 'checks', labels: ['factory:bug', 'factory:checks'] }), { index: 2, total: 4, name: 'Contrôles' });
});

test('a queued feature sits before the build, a blocked one keeps its underlying step', () => {
  assert.equal(progress({ column: 'queued', labels: ['factory:feature', 'factory:queued'] }).index, 2);
  assert.deepEqual(progress({ column: 'blocked', labels: ['factory:feature', 'factory:building', 'factory:blocked'] }), { index: 2, total: 6, name: 'Construction' });
  assert.equal(progress({ column: 'blocked', labels: ['factory:blocked'] }), null);
});

test('laneFor sorts cards into what waits for the owner, what agents do, and the queue', () => {
  assert.equal(laneFor({ column: 'spec', labels: ['factory:spec-review'] }), 'yours');
  assert.equal(laneFor({ column: 'spec', labels: ['factory:spec-review', 'factory:running'] }), 'working');
  assert.equal(laneFor({ column: 'building', labels: ['factory:building'] }), 'working');
  assert.equal(laneFor({ column: 'queued', labels: ['factory:queued'] }), 'queued');
});

test('actionFor names what the owner has to do', () => {
  assert.equal(actionFor('grilling'), 'Répondez aux questions');
  assert.equal(actionFor('acceptance'), 'Testez la preview');
  assert.equal(actionFor('building'), null);
});

test('moves lists the cards that changed step since the previous refresh', () => {
  const prev = new Map([[1, 'building'], [2, 'checks']]);
  const cards = [{ number: 1, title: 'A', column: 'visual' }, { number: 2, title: 'B', column: 'checks' }, { number: 3, title: 'C', column: 'queued' }];
  assert.deepEqual(moves(prev, cards), [{ number: 1, title: 'A', from: 'building', to: 'visual' }]);
  assert.deepEqual(moves(null, cards), []);
});

test('agoText is short and in French', () => {
  assert.equal(agoText(3_000), "à l'instant");
  assert.equal(agoText(25_000), 'il y a 25 s');
  assert.equal(agoText(185_000), 'il y a 3 min');
});

test('pollDelay is 8 s when active, 30 s when idle, and backs off after failures, up to 5 min', () => {
  assert.equal(pollDelay(0), 8_000);
  assert.equal(pollDelay(0, true), 30_000);
  assert.equal(pollDelay(1), 16_000);
  assert.equal(pollDelay(1, true), 60_000);
  assert.equal(pollDelay(10), 300_000);
});

test('timeLine gives one short line per lane', () => {
  const clock = () => '00:17';
  assert.equal(timeLine({ status: 'working', nextLow: 20, nextHigh: 40, next: 28, total: 40, endAt: 1 }, clock), 'Entre 20 et 40 min avant la suite');
  assert.equal(timeLine({ status: 'working', overrun: true, nextLow: 0, nextHigh: 0 }, clock), 'Plus long que prévu · nouvelle estimation en cours');
  assert.equal(timeLine({ status: 'yours', total: 61 }, clock), 'Ensuite ~1 h 01 de travail des agents');
  assert.equal(timeLine({ status: 'queued' }, clock), "Démarre dès qu'une place se libère");
});

test('isIdle is true after 2 minutes without activity', () => {
  assert.equal(isIdle(1_000, 1_000 + 119_999), false);
  assert.equal(isIdle(1_000, 1_000 + 120_000), true);
});

test('cardChanges tells added, removed and changed cards, and nothing when identical', () => {
  const prev = new Map([[1, 'a'], [2, 'b'], [3, 'c']]);
  assert.deepEqual(cardChanges(prev, new Map([[1, 'a'], [3, 'x'], [4, 'd']])), { added: [4], removed: [2], changed: [3] });
  assert.deepEqual(cardChanges(prev, new Map(prev)), { added: [], removed: [], changed: [] });
  assert.deepEqual(cardChanges(null, prev).added, [1, 2, 3]);
});

test('yoursList puts the oldest wait first, and only the spec step is a plain « go »', () => {
  const item = (number, column, updated_at, labels = []) => ({ number, column, updated_at, labels });
  const list = yoursList([
    item(3, 'acceptance', '2026-11-04T12:00:00Z'),
    item(1, 'spec', '2026-11-04T09:00:00Z'),
    item(2, 'visual', '2026-11-04T10:00:00Z', ['factory:running']),
    item(4, 'building', '2026-11-04T08:00:00Z'),
    item(5, 'grilling', '2026-11-04T11:00:00Z'),
  ]);
  assert.deepEqual(list.map((c) => [c.number, c.reply]), [[1, 'go'], [5, 'open'], [3, 'open']]);
});
