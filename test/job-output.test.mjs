import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toJobOutput, fromJobOutput } from '../scripts/lib/job-output.mjs';

test('an address that contains a secret (the project name as ntfy topic) still travels between jobs', () => {
  const url = 'https://yoldmewhen2-skyk-git-claude-issue-56-phoibe.vercel.app';
  const out = toJobOutput(url);
  assert.ok(!out.includes('yoldmewhen2'), 'GitHub drops a job output that contains a secret');
  assert.match(out, /^hex:[0-9a-f]+$/);
  assert.equal(fromJobOutput(out), url);
  assert.equal(fromJobOutput(toJobOutput(JSON.stringify({ pr: 4, detail: 'é' }))), '{"pr":4,"detail":"é"}');
});

test('empty stays empty (the jobs test « != \'\' »), and a plain value is read as is', () => {
  assert.equal(toJobOutput(''), '');
  assert.equal(toJobOutput(null), '');
  assert.equal(fromJobOutput(''), '');
  assert.equal(fromJobOutput(undefined), '');
  assert.equal(fromJobOutput('{"pr":1}'), '{"pr":1}');
});

test('relay.yml never reads a hex-encoded output as JSON', () => {
  const yml = readFileSync(new URL('../.github/workflows/relay.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(yml, /fromJSON\(needs\.decide\.outputs\.(preview|production)\)/);
  assert.match(yml, /previewSha: \$\{\{ steps\.relay\.outputs\.previewSha \}\}/);
  assert.match(yml, /productionSha: \$\{\{ steps\.relay\.outputs\.productionSha \}\}/);
});

test('the live site is recognised under every name its host gives it, never a preview', async () => {
  const { isLiveEnv } = await import('../scripts/relay.mjs');
  for (const env of ['Production', 'production', 'github-pages', 'Production – yoldmewhen2-skyk', 'Production - app']) assert.ok(isLiveEnv(env), env);
  for (const env of ['Preview', 'Preview – yoldmewhen2-skyk', 'staging', '', null, 'production-preview']) assert.ok(!isLiveEnv(env), String(env));
});
