import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnFor, waitsForOwner, boardItems, toggleSkill, setPath, toBase64, fromBase64 } from '../panel/lib.mjs';

test('columnFor picks the most urgent state', () => {
  assert.equal(columnFor(['factory:feature', 'factory:grilling']), 'grilling');
  assert.equal(columnFor(['factory:building', 'factory:blocked']), 'blocked');
  assert.equal(columnFor(['factory:fixing']), 'checks');
  assert.equal(columnFor(['bug']), null);
});

test('waitsForOwner is false while an agent runs', () => {
  assert.equal(waitsForOwner(['factory:spec-review']), true);
  assert.equal(waitsForOwner(['factory:spec-review', 'factory:running']), false);
  assert.equal(waitsForOwner(['factory:building']), false);
});

test('an issue with an open PR in a later state shows once', () => {
  const items = [
    { number: 1, labels: ['factory:feature', 'factory:building'] },
    { number: 9, labels: ['factory:acceptance'], pull_request: {}, body: 'Closes #1' },
    { number: 2, labels: ['factory:feature', 'factory:grilling'] },
  ];
  assert.deepEqual(boardItems(items).map((i) => [i.number, i.column]), [[9, 'acceptance'], [2, 'grilling']]);
});

test('toggleSkill and setPath do not mutate the input', () => {
  const cfg = { maxParallel: 2, stages: { grilling: true }, skills: { sp: { enabled: true, skills: { tdd: true } } } };
  assert.equal(toggleSkill(cfg, 'sp', 'tdd', false).skills.sp.skills.tdd, false);
  assert.equal(setPath(cfg, 'stages.grilling', false).stages.grilling, false);
  assert.equal(cfg.stages.grilling, true);
});

test('base64 round-trips accents', () => {
  assert.equal(fromBase64(toBase64('Règles é ✅')), 'Règles é ✅');
});
