// The relay workflow's jobs, read from the file itself (issue #212).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/relay.yml', import.meta.url), 'utf8');
// The text of one top-level job (two-space indented key) up to the next one.
const job = (name) => {
  const m = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:\\n|(?![\\s\\S]))`, 'm').exec(yml);
  assert.ok(m, `job ${name}`);
  return m[1];
};

test('new check results never cut a merge in progress: they wait for it, then are handled', () => {
  const report = job('report');
  assert.match(report, /concurrency:[\s\S]*?cancel-in-progress: false/);
  assert.doesNotMatch(report, /cancel-in-progress: true/);
});

test('the preview job waits for the preview outside the queue lock, before opening it', () => {
  // Waiting and opening run in the read-only job; the report runs in the job that writes.
  const open = job('preview-open');
  const wait = open.indexOf('relay.mjs preview-url');
  const smoke = open.indexOf('smoke.mjs');
  assert.ok(wait > 0 && wait < smoke, 'waits first, then opens');
  assert.match(open.slice(smoke - 300, smoke), /if: steps\.wait\.outputs\.url != ''/);
  assert.match(open, /url: \$\{\{ steps\.wait\.outputs\.url \}\}/);
  assert.doesNotMatch(open, /: write/);
  const preview = job('preview');
  assert.match(preview, /preview-report[^\n]*--url "\$PREVIEW_URL"/);
  assert.match(preview, /PREVIEW_URL: \$\{\{ needs\.preview-open\.outputs\.url \}\}/);
});

// Issue #271: a private project's jobs run on its dev server when the factory set FACTORY_RUNS_ON, else on GitHub.
test('every job of the project workflows runs on the machine the factory chose for the project', () => {
  for (const [file, image] of [['relay.yml', 'ubuntu-24.04'], ['sync.yml', 'ubuntu-latest']]) {
    const text = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
    const lines = text.split('\n').filter((l) => /^\s+runs-on:/.test(l));
    assert.ok(lines.length > 0, file);
    for (const l of lines) assert.equal(l.trim(), `runs-on: \${{ vars.FACTORY_RUNS_ON && fromJSON(vars.FACTORY_RUNS_ON) || '${image}' }}`, `${file}: ${l.trim()}`);
  }
});

test('the checks may run as long as the project allows (checksMinutes, 30 by default)', () => {
  const job = yml.slice(yml.indexOf('\n  checks:'), yml.indexOf('\n  report:'));
  assert.match(job, /timeout-minutes: \$\{\{ fromJSON\(needs\.decide\.outputs\.checksMinutes \|\| '30'\) \}\}/);
  assert.match(yml, /checksMinutes: \$\{\{ steps\.relay\.outputs\.checksMinutes \}\}/);
});
