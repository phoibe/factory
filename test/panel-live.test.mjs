import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepsFor, progress, laneFor, actionFor, moves, agoText, pollDelay, timeLine } from '../panel/live.mjs';

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
  assert.equal(actionFor('grilling'), 'Réponds aux questions');
  assert.equal(actionFor('acceptance'), 'Teste la preview');
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

test('pollDelay is 15 s when all is well and backs off after failures, up to 5 min', () => {
  assert.equal(pollDelay(0), 15_000);
  assert.equal(pollDelay(1), 30_000);
  assert.equal(pollDelay(10), 300_000);
});

test('timeLine gives one short line per lane', () => {
  const clock = () => '00:17';
  assert.equal(timeLine({ status: 'working', next: 28, total: 40, endAt: 1 }, clock), "~28 min avant l'étape suivante · fin vers 00:17");
  assert.equal(timeLine({ status: 'yours', total: 61 }, clock), 'Ensuite ~1 h 01 de travail des agents');
  assert.equal(timeLine({ status: 'queued' }, clock), "Démarre dès qu'une place se libère");
});
