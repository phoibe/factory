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
    'stages/build.md': ['`code`', '`review`', '`plan`'], 'stages/bugfix.md': ['`review`', '`plan`', '`code`'], 'stages/audit.md': ['`code`', '`review`'], 'stages/ui-polish.md': ['`code`'],
    'stages/grilling.md': ['`plan`'], 'stages/spec.md': ['`plan`'], 'stages/framing.md': ['`plan`'], 'stages/docs.md': ['`plan`'],
    'stages/design-pass.md': ['`code`'], 'stages/visual-fix.md': ['`code`'], 'stages/acceptance-fix.md': ['`code`'], 'stages/skills-fix.md': ['`review`'],
  };
  for (const [file, roles] of Object.entries(expected)) {
    const text = read(file);
    for (const r of roles) assert.ok(text.includes(r), `${file} should name ${r}`);
    for (const m of ['haiku', 'sonnet', 'opus']) assert.ok(!text.includes(`\`${m}\``), `${file} should not name \`${m}\``);
  }
});

// Issue #550: the upstream thinking goes to a sub-agent of role `plan`; the pilot only publishes, with the proof line.
test('the upstream phase is delegated to the plan role, with its proof line', () => {
  assert.match(line('plan'), /phase amont[^\n]*cadrage[^\n]*analyse d'un bug/);
  for (const s of ['**Phase amont**', '**Preuve de la phase amont.**', 'upstream.mjs', 'factory-upstream', 'sans le réécrire', 'relance-le sur le rôle `review`', 'Seul le chat']) {
    assert.ok(grid.includes(s), s);
  }
  assert.match(grid, /tâches simples → code → revue/);
  assert.match(grid, /même pour une petite/);
  for (const f of ['grilling.md', 'spec.md', 'framing.md']) {
    const text = read(`stages/${f}`);
    assert.ok(text.includes('`plan`') && text.includes('upstream.mjs'), f);
  }
  const bug = read('stages/bugfix.md');
  assert.ok(bug.indexOf('`plan`') >= 0 && bug.indexOf('`plan`') < bug.indexOf('`code`'), 'bugfix: analysis by `plan` before the fix by `code`');
  assert.ok(read('stages/docs.md').includes('`plan`'));
  const question = read('stages/question.md');
  assert.ok(!question.includes('upstream.mjs') && !question.includes('`plan`'), 'the chat stays with the pilot');
});

// Review of #550: the plan sub-agent never publishes; a way out when the proof keeps being refused; words match the code.
test('the plan sub-agent hands its text back, and the proof line has a way out', () => {
  const flat = (s) => s.replace(/\s+/g, ' ');
  const g = flat(grid);
  assert.match(g, /ne publie rien et ne pose aucun label/);
  assert.match(g, /`model` = `models\.plan\.model`/);
  assert.match(g, /après un sous-agent `plan` puis un sous-agent `review`, chacun lancé avec son `model`, publie sans la ligne/);
  assert.match(g, /Aucun round de questions, aucune spec ni fiche projet ne se publie sans cette ligne/);
  assert.match(g, /avant le dernier test rouge/);
  for (const f of ['grilling.md', 'spec.md', 'framing.md']) assert.match(flat(read(`stages/${f}`)), /ne rien publier ni poser aucun label/, f);
  assert.match(read('stages/framing.md'), /tu poses les labels\.\n\nCette étape a lieu/);
  assert.match(flat(read('stages/bugfix.md')), /après le rattrapage éventuel et avant tout autre travail/);
  assert.match(flat(read('stages/grilling.md')), /factory-split[^]*sous-agent du rôle `plan` la relit[^]*upstream\.mjs <n>/);
});
