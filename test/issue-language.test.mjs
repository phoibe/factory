import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sync } from '../scripts/sync.mjs';

// Issue #447: issues opened by an agent kept getting English titles, because only the chat stage said
// « titre court en français » and the « Code … en anglais » rule was stretched to issue titles.
const generated = () => {
  const dir = mkdtempSync(join(tmpdir(), 'proj-'));
  sync({ projectDir: dir });
  return (p) => readFileSync(join(dir, '.factory', p), 'utf8');
};

test('the generated AGENT.md says every issue opened by an agent has its title and text in French', () => {
  const agent = generated()('AGENT.md');
  const section = agent.slice(agent.indexOf('**Ouvrir une issue.**'));
  assert.match(section.slice(0, 600), /titre et (son |le )?texte[^.]*toujours en français/);
});

test('the English rule of AGENT.md is limited to code, technical names and commits, never issues', () => {
  const agent = generated()('AGENT.md');
  const line = agent.split('\n').find((l) => /en anglais/.test(l) && /[Cc]ode/.test(l) && /commits/.test(l));
  assert.ok(line, 'English rule line missing');
  assert.match(line, /jamais le titre ni le texte d'une issue/);
});

test('every stage that opens issues reminds that their title and text are in French', () => {
  const read = generated();
  for (const stage of ['audit.md', 'ui-polish.md', 'spec.md', 'foundation.md', 'feedback.md', 'acceptance-fix.md', 'question.md']) {
    assert.match(read(`stages/${stage}`), /(titre|texte)[^.]*en français/, stage);
  }
  const foundation = read('stages/foundation.md');
  const step9 = foundation.slice(foundation.indexOf('**Issues de la première version**'));
  assert.match(step9.slice(0, 400), /titre et texte en français/);
});
