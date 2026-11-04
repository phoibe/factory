import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findRoot, hookCommand } from '../agent/scripts/run-root.mjs';

// A routine serving several projects: one folder holding a clone per repository.
function layout() {
  const home = mkdtempSync(join(tmpdir(), 'routine-'));
  for (const name of ['habitudes', 'factory']) {
    const d = join(home, name);
    mkdirSync(join(d, '.factory/scripts'), { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main', d]);
    for (const f of ['journal.mjs', 'run-root.mjs', 'gate.mjs', 'journal-check.mjs', 'fabrication.mjs']) cpSync(resolve('agent/scripts', f), join(d, '.factory/scripts', f));
  }
  return home;
}

test('findRoot picks the clone named by the run, or keeps a single-project folder', () => {
  const home = layout();
  assert.equal(findRoot(home, 'phoibe/factory'), join(home, 'factory'));
  assert.equal(findRoot(join(home, 'habitudes'), 'phoibe/habitudes'), join(home, 'habitudes'));
  assert.equal(findRoot(home, 'phoibe/inconnu'), home);
});

test('in a multi-project routine the hooks write the journal into the repository of the run', () => {
  const home = layout();
  const hook = (input) => spawnSync('sh', ['-c', hookCommand('journal.mjs')], { input: JSON.stringify({ session_id: `s-${process.pid}`, ...input }), env: { ...process.env, CLAUDE_PROJECT_DIR: home }, encoding: 'utf8' });
  assert.equal(hook({ hook_event_name: 'UserPromptSubmit', prompt: '{"repo":"phoibe/factory","issue":33,"stage":"foundation"}' }).status, 0);
  const skill = { hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_use_id: 'tu1', tool_input: { skill: 'writing-plans' } };
  hook(skill);
  hook(skill); // the same call seen twice (each clone's settings carry the hook) is recorded once
  const dir = join(home, 'factory/.factory/journal');
  const lines = readFileSync(join(dir, readdirSync(dir)[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.kind), ['run', 'skill']);
  assert.ok(!existsSync(join(home, 'habitudes/.factory/journal')));
});

test('the hook command never fails when no factory script is there', () => {
  const r = spawnSync('sh', ['-c', hookCommand('gate.mjs')], { input: '{}', env: { ...process.env, CLAUDE_PROJECT_DIR: mkdtempSync(join(tmpdir(), 'empty-')) } });
  assert.equal(r.status, 0);
});
