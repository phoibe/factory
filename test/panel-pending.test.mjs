import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_MS, LATE_MS, noteClick, noteReturn, pendingNow, untakenAnswer, heldCards, holdLine } from '../panel/pending.mjs';

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

// A card the owner answered on GitHub, but whose answer the factory has not taken yet (GitHub did not start the
// relay): it waits in « Prise en compte en cours », on every device, not back in « À vous de jouer » after 2 minutes.
const msg = (login, body, at = '2026-11-11T20:42:48Z') => ({ user: { login }, body, created_at: at });

test("the owner's own message, last in the thread, is an answer not taken yet", () => {
  const thread = [msg('phoibe', '<!-- factory-agent -->\nRépondez « ok »'), msg('phoibe', 'Les deux captures ne sont pas comparables.')];
  assert.equal(untakenAnswer(thread, 'phoibe'), Date.parse('2026-11-11T20:42:48Z'));
});

test('a factory message or note after it, or a stranger, means nothing waits', () => {
  assert.equal(untakenAnswer([msg('phoibe', 'ok'), msg('phoibe', '<!-- factory-agent -->\nJe reprends.')], 'phoibe'), null);
  assert.equal(untakenAnswer([msg('phoibe', 'ok'), msg('github-actions[bot]', 'Contrôles verts')], 'phoibe'), null);
  assert.equal(untakenAnswer([msg('phoibe', '<!-- factory-heal -->\nRelancé')], 'phoibe'), null);
  assert.equal(untakenAnswer([msg('someone', 'ok')], 'phoibe'), null);
  assert.equal(untakenAnswer([], 'phoibe'), null);
  assert.equal(untakenAnswer(null, 'phoibe'), null);
});

test("an answer the panel forwarded from a PR to its request is still the owner's answer", () => {
  assert.ok(untakenAnswer([msg('phoibe', '<!-- factory-answer-pr:12 -->\nok')], 'phoibe'));
});

test('cards on hold: those clicked and those answered, in the order of « À vous de jouer »', () => {
  const yours = [item(4, 'spec'), item(5, 'visual'), item(6, 'grilling')];
  const held = heldCards(yours, [item(6, 'grilling')], new Map([[4, T0]]));
  assert.deepEqual(held.map((c) => c.number), [4, 6]);
  assert.deepEqual(heldCards(yours, [], new Map()), []);
});

test('the line of a card on hold says when GitHub is late, only after 10 minutes', () => {
  assert.equal(LATE_MS, 600_000);
  assert.deepEqual(holdLine(undefined, T0), { late: false, text: 'En attente de GitHub' });
  assert.deepEqual(holdLine(T0, T0 + LATE_MS - 1), { late: false, text: 'En attente de GitHub' });
  assert.deepEqual(holdLine(T0, T0 + 14 * 60_000), { late: true, text: 'Réponse pas encore prise en compte · GitHub tarde depuis 14 min' });
});
