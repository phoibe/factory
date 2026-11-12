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

test('branchFiles diffs against the closest of origin/preprod, origin/HEAD and origin/main', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'jc-'));
  const g = (...args) => execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
  const commit = (f) => { writeFileSync(join(dir, f), f); g('add', '.'); g('commit', '-q', '-m', f); };
  g('init', '-q', '-b', 'main');
  commit('a.txt');
  g('update-ref', 'refs/remotes/origin/main', 'HEAD');
  commit('preprod-only.txt');
  g('update-ref', 'refs/remotes/origin/preprod', 'HEAD');
  g('checkout', '-q', '-b', 'work');
  commit('mine.txt');
  const files = branchFiles((args) => g(...args));
  assert.deepEqual(files, ['mine.txt']);
});

test('a build branch without its archived spec is told to save it', () => {
  const journal = j({ t: '1', kind: 'run', stage: 'build', issue: 42 }, ...['writing-plans', 'test-driven-development', 'requesting-code-review'].map((name, i) => ({ t: `${i + 2}`, kind: 'skill', name })));
  const opts = { stage: 'build', current: journal };
  const without = report(['lib/x.ts', '.factory/journal/s1.jsonl', 'docs/specs/README.md'], () => journal, stages, opts);
  assert.match(without, /spec rangée : lance `node \.factory\/scripts\/specs\.mjs save 42`/);
  const withSpec = report(['lib/x.ts', '.factory/journal/s1.jsonl', 'docs/specs/42-reserver.md'], () => journal, stages, opts);
  assert.doesNotMatch(withSpec, /spec rangée/);
  const otherSpec = report(['lib/x.ts', '.factory/journal/s1.jsonl', 'docs/specs/12-ancienne.md'], () => journal, stages, opts);
  const deleted = report(['lib/x.ts', '.factory/journal/s1.jsonl', 'docs/specs/42-reserver.md'], (f) => (f.endsWith('.jsonl') ? journal : null), stages, opts);
  assert.match(deleted, /spec rangée/, 'a deleted spec does not count');
  assert.match(otherSpec, /spec rangée/, 'an older spec marked « Modifiée par » is not this request\'s spec');
  assert.doesNotMatch(report(['lib/x.ts', '.factory/journal/s1.jsonl'], () => journal, stages, { stage: 'bugfix', current: journal }), /spec rangée/);
});
