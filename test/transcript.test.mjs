import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fromTranscript, findTranscript, importTranscript } from '../agent/scripts/transcript.mjs';

const prompt = { type: 'user', timestamp: '1', message: { role: 'user', content: 'Tu es l\'agent.\n```routine-fire-payload\n{"repo":"phoibe/factory","issue":62,"pr":null,"stage":"build","factory":"phoibe/factory"}\n```' } };
const use = (id, name, input) => ({ type: 'assistant', timestamp: '2', message: { content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, content, is_error = false) => ({ type: 'user', timestamp: '3', message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] } });
const lines = [prompt, use('a', 'Skill', { skill: 'factory:writing-plans' }), use('b', 'Bash', { command: 'npm test 2>&1 | tail' }), result('b', 'not ok 1 - x\n# fail 1'),
  use('c', 'Bash', { command: 'npm test' }), result('c', '# pass 3\n# fail 0'), use('d', 'Bash', { command: 'ls' }), result('d', 'x')].map((o) => JSON.stringify(o));

test('the transcript gives the run, the skills and the test runs with their outcome', () => {
  const e = fromTranscript(lines);
  assert.deepEqual(e.map((x) => x.kind), ['run', 'skill', 'test', 'test']);
  assert.equal(e[0].stage, 'build');
  assert.equal(e[1].name, 'factory:writing-plans');
  assert.deepEqual(e.slice(2).map((x) => x.ok), [false, true]);
});

test('the journal is rebuilt in the project from the newest transcript of its run', () => {
  const projects = mkdtempSync(join(tmpdir(), 'projects-'));
  mkdirSync(join(projects, '-home-user'));
  writeFileSync(join(projects, '-home-user', 'abc-123.jsonl'), lines.join('\n'));
  writeFileSync(join(projects, '-home-user', 'other.jsonl'), JSON.stringify({ type: 'user', message: { content: '{"repo":"phoibe/habitudes","stage":"build"}' } }));
  assert.match(findTranscript('phoibe/factory', { projectsDir: projects }), /abc-123/);
  const root = mkdtempSync(join(tmpdir(), 'repo-'));
  const file = importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  assert.match(file, /\.factory\/journal\/abc-123\.jsonl$/);
  assert.match(readFileSync(file, 'utf8'), /"kind":"run".*"stage":"build"/);
});

test('a journal the hooks already wrote is kept as it is', () => {
  const projects = mkdtempSync(join(tmpdir(), 'projects-'));
  mkdirSync(join(projects, 'p'));
  writeFileSync(join(projects, 'p', 's1.jsonl'), lines.join('\n'));
  const root = mkdtempSync(join(tmpdir(), 'repo-'));
  mkdirSync(join(root, '.factory/journal'), { recursive: true });
  writeFileSync(join(root, '.factory/journal/s1.jsonl'), '{"kind":"run","stage":"build"}\n');
  importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  assert.equal(readFileSync(join(root, '.factory/journal/s1.jsonl'), 'utf8'), '{"kind":"run","stage":"build"}\n');
});

test('a secret put before a test command in the session never reaches the journal', () => {
  const out = fromTranscript([prompt, use('s', 'Bash', { command: 'API_KEY=sk-123 npm test' })].map((o) => JSON.stringify(o)));
  assert.equal(out.find((e) => e.kind === 'test').cmd, 'API_KEY=… npm test');
});

test('a journal written from the transcript is rebuilt as the session goes on, keeping the entries added since', () => {
  const projects = mkdtempSync(join(tmpdir(), 'projects-'));
  mkdirSync(join(projects, 'p'));
  const session = join(projects, 'p', 's2.jsonl');
  writeFileSync(session, lines.slice(0, 2).join('\n'));
  const root = mkdtempSync(join(tmpdir(), 'repo-'));
  const file = importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  const upstream = JSON.stringify({ t: '9', kind: 'upstream', doc: 'spec', status: 'proved', by: [] });
  writeFileSync(file, readFileSync(file, 'utf8') + upstream + '\n');
  writeFileSync(session, [...lines, JSON.stringify(use('e', 'Agent', { model: 'fable', description: 'phase amont' }))].join('\n'));
  importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  const kinds = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind);
  assert.deepEqual(kinds, ['run', 'skill', 'test', 'test', 'agent', 'upstream']);
});

test('an entry added to a rebuilt journal stays with its run', () => {
  const projects = mkdtempSync(join(tmpdir(), 'projects-'));
  mkdirSync(join(projects, 'p'));
  const session = join(projects, 'p', 's3.jsonl');
  const at = (o, ts) => JSON.stringify({ ...o, timestamp: ts });
  writeFileSync(session, at(prompt, '2026-11-24T10:00:00Z'));
  const root = mkdtempSync(join(tmpdir(), 'repo-'));
  const file = importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  writeFileSync(file, readFileSync(file, 'utf8') + JSON.stringify({ t: '2026-11-24T10:30:00Z', kind: 'upstream' }) + '\n');
  writeFileSync(session, [at(prompt, '2026-11-24T10:00:00Z'), at(prompt, '2026-11-24T11:00:00Z')].join('\n'));
  importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  assert.deepEqual(readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind), ['run', 'upstream', 'run']);
});

test('a kept entry already rebuilt from the transcript (same id) is not written twice', () => {
  const projects = mkdtempSync(join(tmpdir(), 'projects-'));
  mkdirSync(join(projects, 'p'));
  writeFileSync(join(projects, 'p', 's4.jsonl'), lines.slice(0, 2).join('\n'));
  const root = mkdtempSync(join(tmpdir(), 'repo-'));
  const file = importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  const skill = JSON.stringify({ t: '2', kind: 'skill', name: 'factory:writing-plans', id: 'a' });
  writeFileSync(file, readFileSync(file, 'utf8') + skill + '\n');
  importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  assert.deepEqual(readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind), ['run', 'skill']);
});

test('a kept entry of another kind sharing an id with a transcript entry stays', () => {
  const projects = mkdtempSync(join(tmpdir(), 'projects-'));
  mkdirSync(join(projects, 'p'));
  writeFileSync(join(projects, 'p', 's5.jsonl'), lines.slice(0, 4).join('\n'));
  const root = mkdtempSync(join(tmpdir(), 'repo-'));
  const file = importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  const gate = JSON.stringify({ t: '3', kind: 'gate', id: 'b' });
  writeFileSync(file, readFileSync(file, 'utf8') + gate + '\n');
  importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  assert.deepEqual(readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind), ['run', 'skill', 'test', 'gate']);
});

// Review #556 (D2): Claude Code writes each sub-agent's tool calls to <session>/subagents/agent-*.jsonl.
test("the sub-agents' transcripts are merged into the rebuilt journal, in time order", () => {
  const projects = mkdtempSync(join(tmpdir(), 'projects-'));
  mkdirSync(join(projects, 'p', 's6', 'subagents'), { recursive: true });
  const at = (o, ts) => JSON.stringify({ ...o, timestamp: ts });
  writeFileSync(join(projects, 'p', 's6.jsonl'), [at(prompt, '2026-11-24T10:00:00Z'),
    at(use('m1', 'Agent', { model: 'opus', description: 'code' }), '2026-11-24T10:01:00Z'),
    at(use('m2', 'Skill', { skill: 'requesting-code-review' }), '2026-11-24T10:09:00Z')].join('\n'));
  writeFileSync(join(projects, 'p', 's6', 'subagents', 'agent-x.jsonl'), [
    at({ type: 'user', message: { role: 'user', content: prompt.message.content } }, '2026-11-24T10:01:01Z'),
    at(use('x1', 'Skill', { skill: 'test-driven-development' }), '2026-11-24T10:02:00Z'),
    at(use('x2', 'Bash', { command: 'npm test' }), '2026-11-24T10:03:00Z'), at(result('x2', 'not ok 1 - x\n# fail 1'), '2026-11-24T10:03:05Z'),
    at(use('x3', 'Bash', { command: 'npm test' }), '2026-11-24T10:05:00Z'), at(result('x3', '# pass 1\n# fail 0'), '2026-11-24T10:05:05Z')].join('\n'));
  const root = mkdtempSync(join(tmpdir(), 'repo-'));
  const file = importTranscript(root, 'phoibe/factory', { projectsDir: projects });
  const got = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  // A sub-agent's prompt quoting the routine payload does not start a new run.
  assert.deepEqual(got.map((e) => e.kind), ['run', 'agent', 'skill', 'test', 'test', 'skill']);
  assert.deepEqual(got.filter((e) => e.kind === 'test').map((e) => e.ok), [false, true]);
  assert.deepEqual(got.filter((e) => e.kind === 'skill').map((e) => e.name), ['test-driven-development', 'requesting-code-review']);
});
