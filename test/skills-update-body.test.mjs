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
  assert.equal(classifyFile('scripts/engine-checksums.txt'), 'program');
  assert.equal(classifyFile('requirements.txt'), 'program');
  assert.equal(classifyFile('scripts/run.sh'), 'program');
  assert.equal(classifyFile('scripts/data/fonts.json'), 'program');
  assert.equal(classifyFile('scripts/VERSION'), 'program');
});

test('parseNameStatus reads NUL-separated git diff --name-status -z output, unquoted names included', () => {
  const out = 'M\0packs/alpha/tdd/SKILL.md\0A\0packs/alpha/fresh-skill/café.sh\0M\0packs/catalog.json\0';
  assert.deepEqual(parseNameStatus(out), [
    { status: 'M', path: 'packs/alpha/tdd/SKILL.md' },
    { status: 'A', path: 'packs/alpha/fresh-skill/café.sh' },
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

test('a pack dropped from the sources is listed as removed', () => {
  const body = skillsUpdateBody({ before, after: catalog([['alpha', 'a1', ['tdd', 'old-skill']], ['beta', 'b1', ['design']]]), changes: [] });
  assert.match(body, /- Pack gamma : source retirée/);
  assert.match(body, /### Retirés\n- Pack gamma : steady/);
});

test('a type change is shown as modified, never as a raw git letter', () => {
  const body = skillsUpdateBody({ before, after, changes: [{ status: 'T', path: 'packs/alpha/tdd/scripts/link.sh' }] });
  assert.ok(body.includes('- modifié : `scripts/link.sh` (Pack alpha : tdd)'));
});

test('more than 20 programs fold the programs list too', () => {
  const many = Array.from({ length: 21 }, (_, i) => ({ status: 'A', path: `packs/alpha/tdd/scripts/f${i}.js` }));
  const body = skillsUpdateBody({ before, after, changes: many });
  assert.match(body, /<details><summary>Voir les 21 fichiers<\/summary>/);
});

test('exactly 20 files are shown unfolded', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => ({ status: 'A', path: `packs/alpha/tdd/scripts/f${i}.js` }));
  assert.ok(!skillsUpdateBody({ before, after, changes: twenty }).includes('<details>'));
});
