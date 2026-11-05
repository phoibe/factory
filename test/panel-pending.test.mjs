import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_MS, noteClick, noteReturn, pendingNow } from '../panel/pending.mjs';

const item = (number, column) => ({ number, column });
const T0 = 1_000_000;

test('a click alone marks nothing: the owner is still on GitHub', () => {
  const s = noteClick({}, item(5, 'acceptance'), T0);
  assert.deepEqual(pendingNow(s, [item(5, 'acceptance')], T0 + 1000).pending, []);
});

test('coming back after a click puts the plate on hold', () => {
  const s = noteReturn(noteClick({}, item(5, 'acceptance'), T0), T0 + 5000);
  const r = pendingNow(s, [item(5, 'acceptance'), item(6, 'spec')], T0 + 6000);
  assert.deepEqual(r.pending.map((c) => c.number), [5]);
});

test('the hold ends as soon as the plate really changes column', () => {
  const s = noteReturn(noteClick({}, item(5, 'acceptance'), T0), T0 + 5000);
  const r = pendingNow(s, [item(5, 'checks')], T0 + 9000);
  assert.deepEqual(r.pending, []);
  assert.deepEqual(r.state, {});
});

test('the hold ends after 2 minutes: the plate is normal again', () => {
  const s = noteReturn(noteClick({}, item(5, 'acceptance'), T0), T0 + 5000);
  assert.equal(PENDING_MS, 120_000);
  assert.equal(pendingNow(s, [item(5, 'acceptance')], T0 + 5000 + PENDING_MS - 1).pending.length, 1);
  const r = pendingNow(s, [item(5, 'acceptance')], T0 + 5000 + PENDING_MS);
  assert.deepEqual(r.pending, []);
  assert.deepEqual(r.state, {});
});

test('a plate that left the board is forgotten; several plates can wait', () => {
  let s = noteClick(noteClick({}, item(5, 'acceptance'), T0), item(6, 'spec'), T0);
  s = noteReturn(s, T0 + 1000);
  const r = pendingNow(s, [item(6, 'spec'), item(5, 'acceptance')], T0 + 2000);
  assert.deepEqual(r.pending.map((c) => c.number), [6, 5]);
  assert.deepEqual(Object.keys(pendingNow(s, [item(6, 'spec')], T0 + 2000).state), ['6']);
});

test('a return with no click does nothing; a click never returned expires after a day', () => {
  assert.deepEqual(noteReturn({}, T0), {});
  const s = noteClick({}, item(5, 'spec'), T0);
  assert.deepEqual(pendingNow(s, [item(5, 'spec')], T0 + 86_400_001).state, {});
});

test('a second click restarts the wait', () => {
  let s = noteReturn(noteClick({}, item(5, 'spec'), T0), T0 + 1000);
  s = noteClick(s, item(5, 'spec'), T0 + 100_000);
  assert.deepEqual(pendingNow(s, [item(5, 'spec')], T0 + 100_500).pending, []);
});
