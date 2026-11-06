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
  const preview = job('preview');
  const wait = preview.indexOf('relay.mjs preview-url');
  const open = preview.indexOf('smoke.mjs');
  assert.ok(wait > 0 && wait < open, 'waits first, then opens');
  assert.match(preview, /preview-report[^\n]*--url "\$\{\{ steps\.wait\.outputs\.url \}\}"/);
  assert.match(preview.slice(open - 300, open), /if: steps\.wait\.outputs\.url != ''/);
});
