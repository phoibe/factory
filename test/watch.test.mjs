import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWatch, writeWatch, watchStep, WATCH_LOST_MS, WATCH_MAX_TRIES } from '../scripts/lib/watch.mjs';
import { readOutage, writeOutage } from '../scripts/lib/outage.mjs';

test('the note round-trips and leaves the rest of the description as it was', () => {
  const st = { kind: 'preview', sha: 'abc', at: 1, tries: 0 };
  const body = writeWatch('Closes #1', st);
  assert.deepEqual(readWatch(body), st);
  assert.equal(writeWatch(body, null), 'Closes #1');
  assert.deepEqual(readWatch(writeWatch(body, { ...st, tries: 1 })), { ...st, tries: 1 });
  assert.equal(readWatch('Closes #1'), null);
});

test('an address holding « --> » does not end the hidden note early', () => {
  const st = { kind: 'production', check: { url: 'https://x.example/--><b>' }, at: 1, tries: 0 };
  const body = writeWatch('x', st);
  assert.equal((body.match(/-->/g) || []).length, 1);
  assert.deepEqual(readWatch(body), st);
});

test('the watch and outage notes live side by side on one PR', () => {
  const both = writeOutage(writeWatch('Closes #1', { kind: 'preview', sha: 'a', at: 1, tries: 0 }), { sha: 'a', tries: 1 });
  assert.equal(readWatch(both).sha, 'a');
  assert.equal(readOutage(both).tries, 1);
  assert.equal(readOutage(writeWatch(both, null)).tries, 1);
  assert.equal(readWatch(writeOutage(both, null)).sha, 'a');
});

test('wait, then retry, then give up', () => {
  const at = 0;
  assert.equal(watchStep({ kind: 'preview', at, tries: 0 }, WATCH_LOST_MS.preview - 1), 'wait');
  assert.equal(watchStep({ kind: 'preview', at, tries: 0 }, WATCH_LOST_MS.preview), 'retry');
  assert.equal(watchStep({ kind: 'production', at, tries: WATCH_MAX_TRIES - 1 }, WATCH_LOST_MS.production), 'retry');
  assert.equal(watchStep({ kind: 'production', at, tries: WATCH_MAX_TRIES }, WATCH_LOST_MS.production), 'give-up');
  assert.equal(watchStep({ kind: 'other', at, tries: 0 }, 1e12), 'wait');
});
