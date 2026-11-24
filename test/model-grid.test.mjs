import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../agent/${f}`, import.meta.url), 'utf8');
const agent = read('AGENT.md');
const grid = agent.slice(agent.indexOf('**Modèles par rôle.**'));
const line = (role) => grid.split('\n').find((l) => l.startsWith('|') && l.includes(`\`${role}\``)) || '';

test('AGENT.md holds one table: the model and effort of each of the 4 roles', () => {
  assert.ok(agent.includes('**Modèles par rôle.**'));
  assert.ok(!agent.includes('**Modèle et effort des sous-agents.**'));
  assert.match(grid, /`models`/);
  assert.match(line('plan'), /`fable`[^\n]*`high`/);
  assert.match(line('code'), /`opus`[^\n]*`medium`/);
  assert.match(line('review'), /`fable`[^\n]*`high`/);
  assert.match(line('simple'), /`sonnet`[^\n]*`low`/);
  assert.match(grid, /jamais `xhigh` ni `max`/i);
  assert.match(grid, /tâches simples → code → revue/);
  assert.match(grid, /même pour une petite/);
});

test('each stage that dispatches a sub-agent names a role, not a fixed model', () => {
  const expected = {
    'stages/build.md': ['`code`', '`review`', '`plan`'], 'stages/bugfix.md': ['`review`'], 'stages/audit.md': ['`code`', '`review`'], 'stages/ui-polish.md': ['`code`'],
    'stages/design-pass.md': ['`code`'], 'stages/visual-fix.md': ['`code`'], 'stages/acceptance-fix.md': ['`code`'], 'stages/skills-fix.md': ['`review`'],
  };
  for (const [file, roles] of Object.entries(expected)) {
    const text = read(file);
    for (const r of roles) assert.ok(text.includes(r), `${file} should name ${r}`);
    for (const m of ['haiku', 'sonnet', 'opus']) assert.ok(!text.includes(`\`${m}\``), `${file} should not name \`${m}\``);
  }
});
