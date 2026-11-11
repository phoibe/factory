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
