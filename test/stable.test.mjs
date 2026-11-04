import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTag, notes } from '../scripts/stable.mjs';

test('nextTag numbers the stable versions by day', () => {
  const d = new Date('2026-11-04T10:00:00Z');
  assert.equal(nextTag([], d), 'v2026.11.04');
  assert.equal(nextTag(['v2026.11.04'], d), 'v2026.11.04.2');
  assert.equal(nextTag(['v2026.11.04', 'v2026.11.04.2'], d), 'v2026.11.04.3');
});

test('notes list the changes, without the sync commits', () => {
  assert.equal(notes(['feat: a', 'chore(factory): sync skills', '']), 'Ce qui change pour les projets :\n\n- feat: a');
  assert.match(notes([]), /aucun changement/);
});
