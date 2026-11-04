import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTitle, stageName } from '../scripts/lib/run-title.mjs';

test('runTitle names the project, the card and the step', () => {
  assert.equal(runTitle({ repo: 'phoibe/habitudes', issue: 5, pr: 15, stage: 'fix-checks' }), 'habitudes · PR #15 · Correction des contrôles');
  assert.equal(runTitle({ repo: 'phoibe/habitudes', issue: 12, pr: null, stage: 'grilling' }), 'habitudes · issue #12 · Questions');
  assert.equal(stageName('nouvelle-etape'), 'nouvelle-etape');
});
