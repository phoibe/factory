// Issue #385: before showing a change, the agent tries it in the project's real conditions (read only), and the
// PR summary says what was tried for real or what could not be (« Pas vérifié en vrai : … »).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide } from '../agent/scripts/gate.mjs';

const j = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const stages = { plan: false, tdd: false, review: false, designPass: false };
const env = (stage, files = {}) => {
  const sessionText = j({ t: '1', kind: 'run', stage }, ...['systematic-debugging', 'requesting-code-review', 'impeccable'].map((name) => ({ t: '2', kind: 'skill', name })), { t: '3', kind: 'test', ok: false }, { t: '4', kind: 'test', ok: true });
  return { files: ['lib/x.mjs', '.factory/journal/s.jsonl'], read: () => sessionText, stages, sessionText, readFile: (p) => files[p] ?? null, cwd: '/w' };
};
const open = () => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: '/w', tool_input: { command: 'gh api repos/o/r/pulls -f title=x -f head=b -f base=main -F body=@pr.md' } });
const reason = (res) => res?.out.hookSpecificOutput.permissionDecisionReason;

test('a PR whose summary says nothing about the real-conditions trial is refused', () => {
  for (const stage of ['build', 'bugfix', 'foundation', 'audit']) {
    const res = decide(open(), env(stage, { '/w/pr.md': 'Résumé : le bouton est plus grand.\n\nCloses #3' }));
    assert.equal(res?.out.hookSpecificOutput.permissionDecision, 'deny', stage);
    assert.match(reason(res), /lecture seule[\s\S]*Essayé en vrai[\s\S]*Pas vérifié en vrai/);
  }
});

test('a PR that says what was tried for real, or what could not be, goes through', () => {
  assert.equal(decide(open(), env('build', { '/w/pr.md': 'Résumé.\n\n**Essayé en vrai** : le tableau lu sur le vrai dépôt.\n\nCloses #3' })), null);
  assert.equal(decide(open(), env('bugfix', { '/w/pr.md': 'Résumé.\n\nPas vérifié en vrai : la mise en ligne (elle écrirait sur le site).\n\nCloses #3' })), null);
  assert.equal(decide({ hook_event_name: 'PreToolUse', tool_name: 'mcp__github__create_pull_request', tool_input: { body: 'Essayé en vrai : la page.' } }, env('build')), null);
  assert.ok(decide({ hook_event_name: 'PreToolUse', tool_name: 'mcp__github__create_pull_request', tool_input: { body: 'Résumé.' } }, env('build')));
});

test('reading the real pull requests is never taken for opening one', () => {
  const bash = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
  assert.equal(decide(bash('gh api -X GET repos/o/r/pulls -f state=closed'), env('build')), null);
  assert.equal(decide(bash('gh api repos/o/r/pulls --method GET -f head=o:b'), env('build')), null);
  assert.equal(decide(bash("n=$(gh api 'repos/o/r/pulls?head=o:b' --jq '.[0].number'); gh api repos/o/r/issues/$n/labels -f 'labels[]=factory:checks'"), env('build')), null);
});

test('a summary written without accents still counts', () => {
  assert.equal(decide(open(), env('build', { '/w/pr.md': 'Pas verifie en vrai : la mise en ligne.' })), null);
  assert.equal(decide(open(), env('build', { '/w/pr.md': 'Essaye en vrai : la page.'.normalize('NFD') })), null);
});

test('a PR body sent from a file the lock cannot read is told how to send it', () => {
  assert.match(reason(decide(open(), env('build'))), /-F body=@/);
});

test('only opening the PR is checked, and only on runs that build', () => {
  const labels = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'gh api repos/o/r/issues/3/labels -f "labels[]=factory:checks"' } };
  assert.equal(decide(labels, env('build')), null);
  assert.equal(decide(open(), env('fix-checks', { '/w/pr.md': 'Résumé.' })), null);
});

const stage = (f) => readFileSync(new URL(`../agent/${f}`, import.meta.url), 'utf8');

test('the building stages ask for a read-only trial in real conditions', () => {
  for (const f of ['stages/build.md', 'stages/bugfix.md', 'stages/foundation.md', 'stages/audit.md']) {
    const text = stage(f);
    assert.match(text, /conditions réelles/, f);
    assert.match(text, /lecture seule/, f);
    assert.match(text, /Pas vérifié en vrai/, f);
    assert.match(text, /Essayé en vrai/, f);
  }
});

test('a fix that follows a recent delivery says why it was not seen, with the test that would have caught it', () => {
  const text = stage('stages/bugfix.md');
  assert.match(text, /Pourquoi ça n'avait pas été vu/);
  assert.match(text, /test qui aurait attrapé/);
});

test('after publishing, the agent reads back what really arrived', () => {
  assert.match(stage('AGENT.md'), /relis ce qui est réellement arrivé/);
  assert.match(stage('AGENT.md'), /body_html/);
});
