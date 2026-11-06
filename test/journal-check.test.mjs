import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchFiles, report } from '../agent/scripts/journal-check.mjs';

const j = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const stages = { plan: true, tdd: true, review: true, designPass: true };

test('lists the steps the journal does not show, with how to do them', () => {
  const files = ['app/page.tsx', '.factory/journal/s1.jsonl'];
  const journal = j({ t: '1', kind: 'run', stage: 'build' }, { t: '2', kind: 'skill', name: 'superpowers:writing-plans' }, { t: '3', kind: 'skill', name: 'test-driven-development' });
  const out = report(files, () => journal, stages);
  assert.match(out, /revue de code : charge le skill `requesting-code-review`/);
  assert.match(out, /passe design : suis `.factory\/stages\/design-pass.md`/);
  assert.doesNotMatch(out, /plan :/);
});

test('says nothing is missing once every step is in the journal', () => {
  const journal = j({ t: '1', kind: 'run', stage: 'build' }, ...['writing-plans', 'test-driven-development', 'requesting-code-review'].map((name, i) => ({ t: `${i + 2}`, kind: 'skill', name })));
  assert.match(report(['lib/x.ts', '.factory/journal/s1.jsonl'], () => journal, stages), /rien ne manque/);
});

test('branchFiles joins the diff with main and the new untracked files', () => {
  const git = (args) => ({ 'merge-base': 'base\n', diff: 'app/a.tsx\n.factory/journal/old.jsonl\n', 'ls-files': '.factory/journal/new.jsonl\n' })[args[0]];
  assert.deepEqual(branchFiles(git), ['app/a.tsx', '.factory/journal/old.jsonl', '.factory/journal/new.jsonl']);
});

test('the command line checks the latest run with its own stage', async () => {
  const { runOptions } = await import('../agent/scripts/journal-check.mjs');
  const old = j({ t: '2026-11-01T10:00:00Z', kind: 'run', stage: 'build' });
  const now = j({ t: '2026-11-02T10:00:00Z', kind: 'run', stage: 'skills-fix' });
  const files = ['.factory/journal/a.jsonl', '.factory/journal/b.jsonl', 'x.js'];
  const read = (f) => (f.endsWith('a.jsonl') ? old : f.endsWith('b.jsonl') ? now : null);
  assert.deepEqual(runOptions(files, read), { stage: 'skills-fix', current: now });
  assert.deepEqual(runOptions(['x.js'], read), {});
});
