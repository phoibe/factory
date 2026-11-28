// Issue #628: each run records what it consumed (tokens per hour, per task, per model) on the branch
// claude/factory-usage of its project, for the « Consommation » page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KINDS, expiredMonths, kindOf, mergeRun, pilotKind, recordUsage, sizeOf, usageFromTranscript } from '../agent/scripts/usage.mjs';

const FIX = new URL('./fixtures/usage/', import.meta.url).pathname;
const lines = (f) => readFileSync(join(FIX, f), 'utf8').split('\n').filter(Boolean);
const sub = (name) => ({ lines: lines(`session-1/subagents/${name}.jsonl`), meta: JSON.parse(readFileSync(join(FIX, `session-1/subagents/${name}.meta.json`), 'utf8')) });
const fixture = (stage = 'build') => usageFromTranscript({ main: lines('session-1.jsonl'), subagents: ['agent-a1', 'agent-a2', 'agent-a3'].map(sub), stage });

const usage = (i, cc, r, o, split) => ({ input_tokens: i, cache_creation_input_tokens: cc, cache_read_input_tokens: r, output_tokens: o,
  ...(split ? { cache_creation: { ephemeral_5m_input_tokens: split[0], ephemeral_1h_input_tokens: split[1] } } : {}) });
const line = (id, ts, u, extra = {}) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, model: 'claude-opus-5-5', usage: u }, ...extra });

test('the fixture session gives the pilot and each sub-agent with tokens, per hour and model', () => {
  const { tasks, use } = fixture();
  assert.deepEqual(tasks, [
    { type: 'pilot', kind: 'build', model: 'claude-opus-5-5', effort: 'medium' },
    { type: 'review', kind: 'review-round', model: 'claude-fable-5', effort: 'high' },
    { type: 'code', kind: 'build', model: 'claude-opus-5-5', effort: 'low' },
  ]);
  assert.deepEqual(use, [
    ['2026-11-28T10', 0, 'claude-opus-5-5', 10, 0, 100, 1000, 5],
    ['2026-11-28T11', 0, 'claude-opus-5-5', 2, 40, 0, 0, 3],
    ['2026-11-28T11', 1, 'claude-fable-5', 5, 50, 0, 500, 23],
    ['2026-11-28T11', 1, 'claude-haiku-4-5', 1, 0, 0, 0, 1],
    ['2026-11-28T11', 2, 'claude-opus-5-5', 4, 0, 0, 40, 8],
  ]);
});

test('two lines of the same message are counted once', () => {
  const u = usage(1, 0, 0, 1, [0, 0]);
  const { use } = usageFromTranscript({ main: [line('a', '2026-11-28T10:00:00Z', u), line('a', '2026-11-28T10:00:01Z', u)], subagents: [], stage: 'build' });
  assert.deepEqual(use, [['2026-11-28T10', 0, 'claude-opus-5-5', 1, 0, 0, 0, 1]]);
});

test('a main line also in a sub-agent file counts for the sub-agent only', () => {
  const u = usage(5, 0, 0, 5, [0, 0]);
  const { use } = usageFromTranscript({ main: [line('a', '2026-11-28T10:00:00Z', usage(1, 0, 0, 1)), line('b', '2026-11-28T10:00:00Z', u)],
    subagents: [{ lines: [line('b', '2026-11-28T10:00:00Z', u)], meta: { description: '[role:code] x' } }], stage: 'build' });
  assert.deepEqual(use, [['2026-11-28T10', 0, 'claude-opus-5-5', 1, 0, 0, 0, 1], ['2026-11-28T10', 1, 'claude-opus-5-5', 5, 0, 0, 0, 5]]);
});

test('sidechain main lines and synthetic messages are skipped', () => {
  const u = usage(1, 0, 0, 1);
  const { use } = usageFromTranscript({ main: [line('a', '2026-11-28T10:00:00Z', u, { isSidechain: true }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-11-28T10:00:00Z', message: { id: 'b', model: '<synthetic>', usage: u } })], subagents: [], stage: 'build' });
  assert.deepEqual(use, []);
});

test('cache writes split into 5 minutes and 1 hour, all of it 5 minutes without the detail', () => {
  const { use } = usageFromTranscript({ main: [line('a', '2026-11-28T10:00:00Z', usage(0, 30, 0, 0, [10, 20])), line('b', '2026-11-28T12:00:00Z', usage(0, 30, 0, 0))], subagents: [], stage: 'build' });
  assert.deepEqual(use.map((r) => r.slice(4, 6)), [[10, 20], [30, 0]]);
});

test('usage at 10:59Z and 11:01Z land in two hours (UTC)', () => {
  const u = usage(1, 0, 0, 0);
  const { use } = usageFromTranscript({ main: [line('a', '2026-11-28T10:59:00Z', u), line('b', '2026-11-28T12:01:00+01:00', u)], subagents: [], stage: 'build' });
  assert.deepEqual(use.map((r) => r[0]), ['2026-11-28T10', '2026-11-28T11']);
});

test('effort: the meta first, else the most frequent line effort; the pilot takes its most frequent', () => {
  const u = usage(1, 0, 0, 0);
  const { tasks } = usageFromTranscript({
    main: [line('a', '2026-11-28T10:00:00Z', u, { effort: 'high' }), line('b', '2026-11-28T10:00:00Z', u, { effort: 'low' }), line('c', '2026-11-28T10:00:00Z', u, { effort: 'low' })],
    subagents: [{ lines: [line('d', '2026-11-28T10:00:00Z', u, { effort: 'low' })], meta: { description: '[role:code] x', effort: 'medium' } },
      { lines: [line('e', '2026-11-28T10:00:00Z', u, { effort: 'high' }), line('f', '2026-11-28T10:00:00Z', u, { effort: 'high' }), line('g', '2026-11-28T10:00:00Z', u, { effort: 'low' })], meta: { description: '[role:code] y' } },
      { lines: [line('h', '2026-11-28T10:00:00Z', u)], meta: { description: '[role:code] z' } }],
    stage: 'build' });
  assert.deepEqual(tasks.map((t) => t.effort), ['low', 'medium', 'high', null]);
});

test('a task with no tokens is dropped; the model is the one with the most tokens', () => {
  const { tasks, use } = fixture();
  assert.equal(tasks.length, 3, 'agent-a3 has no assistant line');
  assert.equal(tasks[1].model, 'claude-fable-5');
  assert.ok(use.every((r) => r[1] < tasks.length));
});

test('role and kind come from the description, derived from the stage without a kind tag', () => {
  const { tasks } = usageFromTranscript({ main: [], subagents: [{ lines: [line('a', '2026-11-28T10:00:00Z', usage(1, 0, 0, 0))], meta: { description: '[role:plan:amont] Analyse du bug' } }], stage: 'bugfix' });
  assert.deepEqual(tasks.slice(1).map((t) => [t.type, t.kind]), [['plan', 'bug']]);
  assert.equal(kindOf({ role: 'review', label: '[kind:review-round] Tour 2', stage: 'build' }), 'review-round');
  assert.equal(kindOf({ role: 'plan', up: true, label: 'Questions', stage: 'grilling' }), 'questions');
  assert.equal(kindOf({ role: 'plan', up: true, label: 'x', stage: 'spec' }), 'questions');
  assert.equal(kindOf({ role: 'plan', up: true, label: 'x', stage: 'framing' }), 'framing');
  assert.equal(kindOf({ role: 'plan', label: 'Plan', stage: 'build' }), 'plan');
  assert.equal(kindOf({ role: 'code', label: 'x', stage: 'fix-checks' }), 'checks-fix');
  assert.equal(kindOf({ role: 'code', label: 'x', stage: 'visual-fix' }), 'owner-fix');
  assert.equal(kindOf({ role: 'code', label: 'x', stage: 'foundation' }), 'build');
  assert.equal(kindOf({ role: 'review', label: 'Synthèse', stage: 'audit' }), 'audit');
  assert.equal(kindOf({ role: 'audit', label: 'Historique : PR 1 à 50', stage: 'audit' }), 'history');
  assert.equal(kindOf({ role: 'audit', label: 'Relecture : le panneau', stage: 'audit' }), 'parts');
  assert.equal(kindOf({ role: 'simple', label: 'Captures', stage: 'screenshots' }), 'screenshots');
  assert.equal(kindOf({ role: 'simple', label: 'x', stage: 'build' }), 'other');
  assert.equal(kindOf({ role: 'review', label: '[kind:build] x', stage: 'build' }), 'other', 'a kind of another role is ignored');
  assert.equal(kindOf({ role: 'code', label: '[kind:other] x', stage: 'build' }), 'other');
  const plain = usageFromTranscript({ main: [], subagents: [{ lines: [line('a', '2026-11-28T10:00:00Z', usage(1, 0, 0, 0))], meta: { description: 'Recherche' } }], stage: 'build' });
  assert.deepEqual(plain.tasks[1], { type: 'code', kind: 'build', model: 'claude-opus-5-5', effort: null });
});

test('the pilot kind follows the stage', () => {
  assert.deepEqual(['grilling', 'spec', 'build', 'bugfix', 'foundation', 'feedback', 'fix-checks', 'visual-fix', 'acceptance-fix', 'update-branch', 'resume', 'skills-fix', 'audit', 'ui-polish', 'question', 'docs'].map(pilotKind),
    ['questions', 'questions', 'build', 'build', 'build', 'fixes', 'fixes', 'fixes', 'fixes', 'fixes', 'fixes', 'fixes', 'audit', 'audit', 'other', 'other']);
  assert.deepEqual(KINDS, {
    plan: ['questions', 'plan', 'bug', 'framing', 'other'],
    code: ['build', 'task-review', 'design-critique', 'review-fix', 'owner-fix', 'checks-fix', 'other'],
    review: ['final-review', 'review-round', 'scope-check', 'security', 'audit', 'other'],
    audit: ['parts', 'history', 'other'],
    simple: ['research', 'screenshots', 'other'],
    pilot: ['questions', 'build', 'fixes', 'audit', 'other'],
  });
});

test('the size is the last estimate of a feature, nothing for a bug', () => {
  const feature = { labels: [{ name: 'factory:feature' }], body: 'x <!-- factory-estimate size=small min=10 max=20 -->' };
  const comments = [{ body: '<!-- factory-estimate size=large min=1 max=2 -->' }, { body: 'merci' }, { body: '<!-- factory-estimate size=medium min=1 max=2 -->' }];
  assert.equal(sizeOf(feature, comments), 'medium');
  assert.equal(sizeOf(feature, []), 'small');
  assert.equal(sizeOf({ labels: [{ name: 'factory:feature' }], body: '' }, []), null);
  assert.equal(sizeOf({ labels: [{ name: 'factory:bug' }], body: feature.body }, comments), null);
  assert.equal(sizeOf(null, []), null);
});

test('a run replaces its own record and keeps the other sessions', () => {
  const a = { at: '2026-11-28T10:00:00Z', stage: 'build' };
  const month = mergeRun(mergeRun(null, 's1', a), 's2', { ...a, stage: 'spec' });
  assert.deepEqual(Object.keys(month.runs), ['s1', 's2']);
  const again = mergeRun(month, 's1', { ...a, stage: 'bugfix' });
  assert.equal(again.v, 1);
  assert.equal(again.runs.s1.stage, 'bugfix');
  assert.equal(again.runs.s2.stage, 'spec');
});

test('months older than 3 before this month expire', () => {
  assert.deepEqual(expiredMonths(['2026-07.json', '2026-08.json', '2026-11.json'], new Date('2026-11-28')), ['2026-07.json']);
  assert.deepEqual(expiredMonths(['2025-12.json', 'README.md', '2026-01.json'], new Date('2026-03-01')), []);
  assert.deepEqual(expiredMonths(['2025-11.json'], new Date('2026-03-01')), ['2025-11.json']);
});

// The agent instructions spell the kind of each sub-agent, so that the page can tell them apart.
test('AGENT.md lists every kind and the stages tag their sub-agents', () => {
  const read = (f) => readFileSync(new URL(`../agent/${f}`, import.meta.url), 'utf8');
  const agent = read('AGENT.md').replace(/\s+/g, ' ');
  for (const [role, ids] of Object.entries(KINDS)) for (const id of ids) assert.ok(agent.includes(`\`${id}\``), `${role}: ${id}`);
  assert.ok(agent.includes('`[role:<rôle>] [kind:<id>] <libellé>`'));
  assert.ok(agent.includes("juste avant : `node .factory/scripts/usage.mjs` depuis le dossier du projet (s'il échoue, continue)"));
  const build = read('stages/build.md');
  for (const k of ['[kind:final-review]', '[kind:review-round]', '[kind:scope-check]', '[kind:security]', '[kind:plan]']) assert.ok(build.includes(k), k);
  const question = read('stages/question.md');
  assert.ok(question.indexOf('node .factory/scripts/usage.mjs') > question.indexOf('5. **Dernière action**'), 'the chat records it in its last step');
  assert.ok(question.indexOf('node .factory/scripts/usage.mjs') < question.indexOf('DELETE repos/<repo>/issues/<n>/labels/factory:running'), 'before removing the lock');
});

// The record goes to a branch of its own; a second run of the same session replaces its record.
test('the record is pushed to claude/factory-usage, once per session, and expired months go', () => {
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  const base = mkdtempSync(join(tmpdir(), 'usage-'));
  const bare = join(base, 'origin.git');
  git(['init', '--quiet', '--bare', bare]);
  const repo = join(base, 'repo');
  git(['init', '--quiet', '-b', 'main', repo]);
  git(['config', 'remote.origin.url', 'https://github.com/o/r'], repo);
  git(['config', `url.${bare}.insteadOf`, 'https://github.com/o/r'], repo);
  git(['commit', '--quiet', '--allow-empty', '-m', 'init'], repo);
  const projects = join(base, 'projects');
  mkdirSync(join(projects, '-repo'), { recursive: true });
  cpSync(join(FIX, 'session-1.jsonl'), join(projects, '-repo', 'session-1.jsonl'));
  cpSync(join(FIX, 'session-1'), join(projects, '-repo', 'session-1'), { recursive: true });
  const gh = (p) => (p.endsWith('/comments') ? [{ body: '<!-- factory-estimate size=large min=1 max=2 -->' }] : { labels: [{ name: 'factory:feature' }], body: '' });
  const opts = { cwd: repo, projectsDir: projects, now: new Date('2026-11-28T12:00:00Z'), gh, git: (args, cwd) => git(args, cwd || repo) };

  const dry = recordUsage({ ...opts, dryRun: true });
  assert.equal(dry.session, 'session-1');
  assert.equal(dry.run.issue, 12);
  assert.equal(dry.run.size, 'large');
  assert.equal(dry.run.stage, 'build');
  assert.throws(() => git(['ls-remote', '--exit-code', bare, 'claude/factory-usage']), 'the dry run pushes nothing');

  recordUsage(opts);
  const read = (f) => git(['--git-dir', bare, 'show', `claude/factory-usage:${f}`]);
  const month = JSON.parse(read('usage/2026-11.json'));
  assert.deepEqual(Object.keys(month.runs), ['session-1']);
  assert.equal(month.runs['session-1'].tasks.length, 3);
  assert.equal(month.runs['session-1'].at, '2026-11-28T11:06:00.000Z', 'the time of its last message');

  // Another session pushes between our fetch and our push, with an old month: our push is refused, then retried on
  // top of it; both runs stay and the old month goes.
  const other = join(base, 'other');
  const otherWrites = () => {
    git(['clone', '--quiet', '--branch', 'claude/factory-usage', bare, other]);
    execFileSync('node', ['-e', `const fs=require('fs');const p='usage/2026-11.json';const m=JSON.parse(fs.readFileSync(p));m.runs.s2={stage:'spec'};fs.writeFileSync(p,JSON.stringify(m));fs.writeFileSync('usage/2026-07.json','{}')`], { cwd: other });
    git(['add', '.'], other);
    git(['commit', '--quiet', '-m', 'other'], other);
    git(['push', '--quiet', 'origin', 'HEAD:claude/factory-usage'], other);
  };
  let pushes = 0;
  const racing = (args, cwd) => { if (args[0] === 'push' && pushes++ === 0) otherWrites(); return git(args, cwd || repo); };
  appendFileSync(join(projects, '-repo', 'session-1.jsonl'), `${line('m6', '2026-11-28T11:10:00Z', usage(1, 0, 0, 1))}\n`); // the session went on
  recordUsage({ ...opts, git: racing });
  assert.equal(pushes, 2, 'the refused push is retried');
  const after = JSON.parse(read('usage/2026-11.json'));
  assert.deepEqual(Object.keys(after.runs).sort(), ['s2', 'session-1']);
  assert.equal(after.runs['session-1'].at, '2026-11-28T11:10:00.000Z', 'its record is replaced');
  assert.throws(() => read('usage/2026-07.json'), 'the expired month is deleted');
  const commits = git(['--git-dir', bare, 'rev-list', '--count', 'claude/factory-usage']);
  recordUsage(opts);
  assert.equal(git(['--git-dir', bare, 'rev-list', '--count', 'claude/factory-usage']), commits, 'nothing changed: no new commit');
  assert.ok(readdirSync(repo).every((f) => f !== 'usage'), 'the project copy is untouched');
});
