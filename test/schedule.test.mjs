import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the safety-net tick runs every 5 minutes, the minimum GitHub allows', () => {
  const yml = readFileSync('.github/workflows/factory.yml', 'utf8');
  const crons = [...yml.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(crons, ['*/5 * * * *']);
});
