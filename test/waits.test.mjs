import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitsMarker, waitedFor, requestState, WAITS_DONE_MARKER } from '../scripts/lib/waits.mjs';
import { AGENT_MARKER } from '../scripts/lib/labels.mjs';

const agent = (body) => ({ body: `${AGENT_MARKER}\n${body}`, user: { login: 'phoibe' } });
const owner = (body) => ({ body, user: { login: 'phoibe' } });

test('waitsMarker writes the invisible line the agent puts in its blocking message', () => {
  assert.equal(waitsMarker([12, 15]), '<!-- factory-waits-for #12 #15 -->');
});

test('waitedFor reads the requests named by the last blocking message', () => {
  assert.deepEqual(waitedFor([agent(`Je dois attendre.\n${waitsMarker([12])}`)]), [12]);
  assert.deepEqual(waitedFor([agent(waitsMarker([3])), agent(`encore\n<!-- factory-waits-for #12, #15 -->`)]), [12, 15]);
});

test('waitedFor is empty without a marker', () => {
  assert.deepEqual(waitedFor([agent('bloqué')]), []);
  assert.deepEqual(waitedFor([]), []);
  assert.deepEqual(waitedFor(null), []);
});

test("an owner message after the marker forgets the link", () => {
  assert.deepEqual(waitedFor([agent(waitsMarker([12])), owner("c'est bon, reprends")]), []);
});

test('a wake or abandon message consumes the marker', () => {
  assert.deepEqual(waitedFor([agent(waitsMarker([12])), agent(`${WAITS_DONE_MARKER}\n#12 est fusionnée : je reprends.`)]), []);
});

test('a later agent message without marker (session note) keeps the link', () => {
  assert.deepEqual(waitedFor([agent(waitsMarker([12])), agent('Dernier lancement…')]), [12]);
});

test('requestState tells merged, abandoned and open requests apart', () => {
  assert.equal(requestState({ state: 'open' }), 'open');
  assert.equal(requestState({ state: 'closed', state_reason: 'completed' }), 'merged');
  assert.equal(requestState({ state: 'closed', state_reason: 'not_planned' }), 'abandoned');
  assert.equal(requestState(null), 'abandoned');
  assert.equal(requestState({ state: 'closed', pull_request: { merged_at: '2026-11-08T10:00:00Z' } }), 'merged');
  assert.equal(requestState({ state: 'closed', pull_request: { merged_at: null } }), 'abandoned');
  assert.equal(requestState({ state: 'open', pull_request: { merged_at: null } }), 'open');
});
