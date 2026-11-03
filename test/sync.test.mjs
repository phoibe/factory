import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sync, render } from '../scripts/sync.mjs';

const project = (config) => {
  const dir = mkdtempSync(join(tmpdir(), 'proj-'));
  if (config) writeFileSync(join(dir, 'factory.config.json'), JSON.stringify(config));
  return dir;
};

test('installs default skills and agent instructions', () => {
  const dir = project();
  const res = sync({ projectDir: dir });
  assert.ok(res.installed.includes('grilling'));
  assert.ok(existsSync(join(dir, '.claude/skills/grilling/SKILL.md')));
  assert.ok(!existsSync(join(dir, '.claude/skills/brainstorming')));
  const agent = readFileSync(join(dir, '.factory/AGENT.md'), 'utf8');
  assert.ok(!agent.includes('{{'));
  for (const f of readdirSync(join(dir, '.factory/stages'))) {
    assert.ok(!readFileSync(join(dir, '.factory/stages', f), 'utf8').includes('{{'), f);
  }
  assert.ok(existsSync(join(dir, '.factory/scripts/shots.mjs')));
});

test('re-sync removes only skills the factory installed and the owner disabled', () => {
  const dir = project();
  sync({ projectDir: dir });
  mkdirSync(join(dir, '.claude/skills/my-own'), { recursive: true });
  writeFileSync(join(dir, '.claude/skills/my-own/SKILL.md'), '---\nname: my-own\n---');
  writeFileSync(join(dir, 'factory.config.json'), JSON.stringify({ skills: { 'matt-pocock': { skills: { grilling: false } } } }));
  const res = sync({ projectDir: dir });
  assert.deepEqual(res.removed, ['grilling']);
  assert.ok(!existsSync(join(dir, '.claude/skills/grilling')));
  assert.ok(existsSync(join(dir, '.claude/skills/my-own/SKILL.md')));
  assert.ok(existsSync(join(dir, '.claude/skills/to-spec')));
});

test('disabled stages are shown as off in AGENT.md', () => {
  const dir = project({ stages: { screenshots: false } });
  sync({ projectDir: dir });
  assert.match(readFileSync(join(dir, '.factory/AGENT.md'), 'utf8'), /captures avant\/après ❌/);
});

test('render leaves unknown placeholders untouched', () => {
  assert.equal(render('{{a}} {{b}}', { a: 1 }), '1 {{b}}');
});
