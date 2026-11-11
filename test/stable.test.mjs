import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTag, notes, readyToPromote, ownerRequestActive, hourlyRunActive } from '../scripts/stable.mjs';

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

// The factory itself runs the newest version first (the scout); stable follows on its own once that version has
// lived an hour on the factory without trouble.
const H = 3_600_000;
const now = Date.parse('2026-11-04T18:00:00Z');
const calm = { ahead: 2, lastCommitAt: now - 2 * H, mainGreen: true, troubles: [], now };

test('readyToPromote: a new version that lived an hour on the factory without trouble becomes stable', () => {
  assert.deepEqual(readyToPromote(calm), { ready: true, reason: 'prête' });
});

test('readyToPromote: nothing new, too fresh, red tests or trouble on the factory keep the stable version', () => {
  assert.equal(readyToPromote({ ...calm, ahead: 0 }).ready, false);
  assert.match(readyToPromote({ ...calm, lastCommitAt: now - 20 * 60_000 }).reason, /moins d'une heure/);
  assert.match(readyToPromote({ ...calm, mainGreen: false }).reason, /tests/);
  assert.match(readyToPromote({ ...calm, troubles: ['#12 bloquée'] }).reason, /#12 bloquée/);
});

// GitHub keeps a single pending run per concurrency group and cancels the older one: the hourly run must never
// share the owner's queue, and it gives way whenever an owner request (button or issue) is queued or running.
const run = (id, event, status) => ({ id, event, status });

test('ownerRequestActive: an owner request queued or running makes the hourly run give way', () => {
  assert.equal(ownerRequestActive([run(1, 'schedule', 'in_progress')], 1), false);
  assert.equal(ownerRequestActive([run(1, 'schedule', 'in_progress'), run(2, 'workflow_dispatch', 'queued')], 1), true);
  assert.equal(ownerRequestActive([run(1, 'schedule', 'in_progress'), run(2, 'issues', 'pending')], 1), true);
  assert.equal(ownerRequestActive([run(1, 'schedule', 'in_progress'), run(2, 'workflow_dispatch', 'completed')], 1), false);
  assert.equal(ownerRequestActive([run(1, 'schedule', 'in_progress'), run(3, 'schedule', 'queued')], 1), false);
});

test('hourlyRunActive: an owner request waits for an hourly run already under way', () => {
  assert.equal(hourlyRunActive([run(2, 'workflow_dispatch', 'in_progress')], 2), false);
  assert.equal(hourlyRunActive([run(1, 'schedule', 'in_progress'), run(2, 'workflow_dispatch', 'in_progress')], 2), true);
  assert.equal(hourlyRunActive([run(1, 'schedule', 'completed'), run(2, 'workflow_dispatch', 'in_progress')], 2), false);
});
