import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPickable, pickOrder } from '../scripts/lib/pick.mjs';
import { L, LABEL_DEFS } from '../scripts/lib/labels.mjs';

const issue = (number, labels, created = `2026-01-${String(number).padStart(2, '0')}T00:00:00Z`) => ({ number, labels: labels.map((name) => ({ name })), created_at: created });

test('only untouched features, bugs and reviews can be picked', () => {
  assert.equal(isPickable([L.feature]), true);
  assert.equal(isPickable([L.bug]), true);
  for (const l of [L.question, L.project, 'factory:release', L.grilling, L.specReview, L.queued, L.building, L.blocked, L.running, L.noPick]) {
    assert.equal(isPickable([L.feature, l]), false, l);
  }
  assert.equal(isPickable(['documentation']), false);
});

test('pull requests are never picked', () => {
  assert.deepEqual(pickOrder([{ ...issue(1, [L.feature]), pull_request: {} }]), []);
});

test('order: urgent first (even over bugs), then bugs, then the rest, oldest first', () => {
  const list = [issue(1, [L.feature]), issue(2, [L.bug]), issue(3, [L.feature, L.urgent]), issue(4, [L.bug, L.urgent]), issue(5, [L.bug])];
  assert.deepEqual(pickOrder(list).map((i) => i.number), [3, 4, 2, 5, 1]);
});

test('the new labels have a definition so the factory creates them', () => {
  const names = LABEL_DEFS.map((d) => d[0]);
  for (const l of [L.noPick, L.urgent, L.autoPicked]) assert.ok(names.includes(l), l);
});
