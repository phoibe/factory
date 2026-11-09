// The sync workflow's commit step, played in a throwaway repo (Pulsar Novae #173).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const yml = readFileSync(new URL('../.github/workflows/sync.yml', import.meta.url), 'utf8');
// The `git add` lines of the Commit step, as the runner plays them.
const addLines = yml.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('git add'));

const staged = (gitignore) => {
  const dir = mkdtempSync(join(tmpdir(), 'factory-sync-'));
  const sh = (cmd) => execSync(cmd, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  sh('git init -q');
  writeFileSync(join(dir, '.gitignore'), gitignore);
  mkdirSync(join(dir, '.claude/skills/tdd/data'), { recursive: true });
  mkdirSync(join(dir, '.claude/worktrees/x'), { recursive: true });
  mkdirSync(join(dir, '.factory'), { recursive: true });
  writeFileSync(join(dir, '.claude/skills/tdd/SKILL.md'), 'skill');
  writeFileSync(join(dir, '.claude/skills/tdd/data/ref.md'), 'data');
  writeFileSync(join(dir, '.claude/settings.json'), '{}');
  writeFileSync(join(dir, '.claude/settings.local.json'), '{"secret":1}');
  writeFileSync(join(dir, '.claude/worktrees/x/file'), 'local');
  writeFileSync(join(dir, '.factory/AGENT.md'), 'agent');
  writeFileSync(join(dir, 'factory.config.json'), '{}');
  for (const line of addLines) sh(line);
  return sh('git diff --cached --name-only').trim().split('\n').sort();
};

const factoryFiles = ['.claude/settings.json', '.claude/skills/tdd/SKILL.md', '.claude/skills/tdd/data/ref.md', '.factory/AGENT.md', 'factory.config.json'];

test('a project that ignores .claude/ still receives the factory files', () => {
  assert.deepEqual(staged('.claude/\ndata/\n'), factoryFiles);
});

test('only what the factory installs is committed, never local Claude state', () => {
  assert.deepEqual(staged(''), factoryFiles);
});
