import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../agent/${f}`, import.meta.url), 'utf8');
const agent = read('AGENT.md');
const grid = agent.slice(agent.indexOf('**Modèle et effort des sous-agents.**'));

test('AGENT.md holds one grid: model and effort for each kind of sub-agent', () => {
  assert.ok(agent.includes('**Modèle et effort des sous-agents.**'));
  assert.match(grid, /`haiku`[^\n]*`low`/);
  assert.match(grid, /`sonnet`[^\n]*`medium`/);
  assert.match(grid, /`opus`[^\n]*`high`/);
  assert.match(grid, /jamais `xhigh` ni `max`/i);
  assert.match(grid, /Haiku → Sonnet → Opus/);
});

test('each stage that dispatches a sub-agent names its model', () => {
  const expected = {
    'stages/build.md': ['`opus`', '`sonnet`'], 'stages/bugfix.md': ['`opus`'], 'stages/audit.md': ['`sonnet`', '`opus`'],
    'stages/design-pass.md': ['`sonnet`'], 'stages/visual-fix.md': ['`sonnet`'], 'stages/acceptance-fix.md': ['`sonnet`'], 'stages/skills-fix.md': ['`opus`'],
  };
  for (const [file, models] of Object.entries(expected)) for (const m of models) assert.ok(read(file).includes(m), `${file} should name ${m}`);
});
