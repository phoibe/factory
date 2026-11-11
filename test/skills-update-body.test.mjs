import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFile, parseNameStatus, skillsUpdateBody } from '../scripts/lib/skills-update-body.mjs';

const catalog = (packs) => ({
  packs: packs.map(([id, commit, skills]) => ({
    id, name: `Pack ${id}`, repo: `owner/${id}`, commit, skills: skills.map((s) => ({ id: s })),
  })),
});

const before = catalog([
  ['alpha', 'a1', ['tdd', 'old-skill']],
  ['beta', 'b1', ['design']],
  ['gamma', 'g1', ['steady']],
]);
const after = catalog([
  ['alpha', 'a2', ['tdd', 'fresh-skill']],
  ['beta', 'b2', ['design']],
  ['gamma', 'g1', ['steady']],
]);

test('classifyFile: SKILL.md is the sheet, agents yaml is settings, docs are pages, the rest is a program', () => {
  assert.equal(classifyFile('SKILL.md'), 'sheet');
  assert.equal(classifyFile('agents/openai.yaml'), 'settings');
  assert.equal(classifyFile('references/guide.md'), 'page');
  assert.equal(classifyFile('LICENSE.txt'), 'page');
  assert.equal(classifyFile('scripts/run.sh'), 'program');
  assert.equal(classifyFile('scripts/data/fonts.json'), 'program');
  assert.equal(classifyFile('scripts/VERSION'), 'program');
});

test('parseNameStatus reads git diff --name-status lines under packs', () => {
  const out = 'M\tpacks/alpha/tdd/SKILL.md\nA\tpacks/alpha/fresh-skill/SKILL.md\nM\tpacks/catalog.json\n';
  assert.deepEqual(parseNameStatus(out), [
    { status: 'M', path: 'packs/alpha/tdd/SKILL.md' },
    { status: 'A', path: 'packs/alpha/fresh-skill/SKILL.md' },
    { status: 'M', path: 'packs/catalog.json' },
  ]);
});

const changes = [
  { status: 'M', path: 'packs/alpha/tdd/SKILL.md' },
  { status: 'A', path: 'packs/alpha/tdd/scripts/helper.js' },
  { status: 'M', path: 'packs/alpha/tdd/references/notes.md' },
  { status: 'A', path: 'packs/alpha/fresh-skill/SKILL.md' },
  { status: 'A', path: 'packs/alpha/fresh-skill/run.sh' },
  { status: 'D', path: 'packs/alpha/old-skill/SKILL.md' },
  { status: 'M', path: 'packs/beta/design/SKILL.md' },
  { status: 'M', path: 'packs/beta/design/agents/openai.yaml' },
  { status: 'M', path: 'packs/catalog.json' },
  { status: 'M', path: 'packs/NOTICE.md' },
];

test('the body warns at the top with the number of programs changed', () => {
  const body = skillsUpdateBody({ before, after, changes });
  assert.match(body.split('\n')[0], /⚠️ Cette mise à jour change 2 programmes : regardez-les avant de fusionner/);
});

test('the body links each changed source to its upstream comparison', () => {
  const body = skillsUpdateBody({ before, after, changes });
  assert.ok(body.includes('https://github.com/owner/alpha/compare/a1...a2'));
  assert.ok(body.includes('https://github.com/owner/beta/compare/b1...b2'));
  assert.match(body, /Pack gamma.*inchangé/);
});

test('the body groups skills into new, removed and modified, with what moved', () => {
  const body = skillsUpdateBody({ before, after, changes });
  assert.match(body, /### Nouveaux\n- Pack alpha : fresh-skill/);
  assert.match(body, /### Retirés\n- Pack alpha : old-skill/);
  assert.match(body, /- Pack alpha : tdd \(fiche, pages annexes, programmes\)/);
  assert.match(body, /- Pack beta : design \(fiche, réglages pour un autre outil\)/);
});

test('the programs section lists each program with its skill', () => {
  const body = skillsUpdateBody({ before, after, changes });
  assert.match(body, /## ⚠️ Programmes et autres fichiers qui ne sont pas des fiches/);
  assert.ok(body.includes('- ajouté : `scripts/helper.js` (Pack alpha : tdd)'));
  assert.ok(body.includes('- ajouté : `run.sh` (Pack alpha : fresh-skill)'));
});

test('sheets and settings only: no alert and no programs section', () => {
  const body = skillsUpdateBody({
    before, after,
    changes: [
      { status: 'M', path: 'packs/beta/design/SKILL.md' },
      { status: 'M', path: 'packs/beta/design/agents/openai.yaml' },
    ],
  });
  assert.ok(!body.includes('⚠️'));
  assert.ok(!body.includes('Programmes et autres fichiers'));
});

test('the body keeps the closing sentence about tests and merging', () => {
  const body = skillsUpdateBody({ before, after, changes });
  assert.match(body, /Les tests de la factory passent\. Fusionnez cette PR/);
});

test('up to 20 files the file-by-file detail is shown, beyond it is folded', () => {
  const small = skillsUpdateBody({ before, after, changes });
  assert.ok(!small.includes('<details>'));
  assert.ok(small.includes('`packs/alpha/tdd/references/notes.md`'));
  const many = Array.from({ length: 21 }, (_, i) => ({ status: 'A', path: `packs/alpha/tdd/scripts/f${i}.js` }));
  const big = skillsUpdateBody({ before, after, changes: many });
  assert.match(big, /<details><summary>Voir le détail des 21 fichiers<\/summary>/);
  assert.match(big.split('\n')[0], /21 programmes/);
  assert.match(big, /- Pack alpha : tdd \(programmes\)/);
});
