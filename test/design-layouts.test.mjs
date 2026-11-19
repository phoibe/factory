// Issue #509: every project's DESIGN.md describes its screen layouts (« Mises en page »), kept current by each build
// and checked by the design pass; a project framed from another project's design copies its layouts too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { hasLayoutsSection } from '../scripts/lib/labels.mjs';

const stage = (f) => readFileSync(new URL(`../agent/stages/${f}`, import.meta.url), 'utf8');
const SECTION = 'Mises en page';

test('design-pass.md defines the « Mises en page » section with its fixed grid', () => {
  const section = stage('design-pass.md').split(`\n## ${SECTION}\n`)[1]?.split('\n## ')[0];
  assert.ok(section, `missing "## ${SECTION}" section`);
  for (const term of ['Disposition générale', 'Sommaire ou navigation', 'Largeur', 'Libellés et explications',
    'Volets repliables', 'Sur téléphone', 'Écrans concernés', 'schéma', 'capture', 'Aucun écran pour l\'instant']) {
    assert.ok(section.includes(term), `the grid does not mention "${term}"`);
  }
});

test('the design pass completes a late document and fixes a screen that contradicts it', () => {
  const md = stage('design-pass.md');
  assert.match(md, /Mise en page ajoutée au design : …/);
  assert.match(md, /contredit[^.]*mise en page[^.]*\. C'est l'écran qui est corrigé, pas le\s+document/);
  assert.match(md, /juge l'écran\s+aussi sur sa mise en page/);
});

test('a build adds a new layout, or the screen name to a known one, in the same delivery', () => {
  const md = stage('build.md');
  assert.match(md, /Mises en page[^]{0,600}même PR/);
  assert.match(md, /ajoute son nom[^.]*Écrans concernés/);
});

test('the foundation writes the section, and copies it from a reused design', () => {
  const md = stage('foundation.md');
  assert.ok(md.includes(`« ${SECTION} »`), 'foundation does not write the section');
  assert.match(md, /Design repris[^]{0,600}à l'identique/);
  assert.match(md, /ne reste pas lié/);
});

test('the framing offers to reuse the design of another project', () => {
  assert.ok(stage('framing.md').includes('« Reprendre le design d\'un de vos projets »'));
});

test('the layouts stage only describes the current screens in DESIGN.md', () => {
  assert.ok(existsSync(new URL('../agent/stages/layouts.md', import.meta.url)));
  const md = stage('layouts.md');
  assert.match(md, /seul fichier[^.]*`DESIGN\.md`/);
  assert.ok(md.includes(`## ${SECTION}`) || md.includes(`« ${SECTION} »`));
  assert.match(md, /design-pass\.md/);
  assert.match(md, /factory:checks/);
  assert.match(md, /Pas vérifié en vrai/);
});

test('the general review and the UI improvement keep the layouts in DESIGN.md current', () => {
  for (const f of ['audit.md', 'ui-polish.md']) assert.ok(stage(f).includes(`« ${SECTION} »`), f);
});

test('the factory\'s own DESIGN.md has its layouts section', () => {
  const md = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
  assert.ok(hasLayoutsSection(md));
  const section = md.split(/^## (?:\d+\. )?Mises en page.*$/m)[1].split(/\n## /)[0];
  assert.ok((section.match(/^### /gm) || []).length >= 4, 'one sub-part per screen type');
  for (const term of ['Disposition générale', 'Sur téléphone', 'Écrans concernés']) {
    assert.equal((section.match(new RegExp(`\\*\\*${term}`, 'g')) || []).length, (section.match(/^### /gm) || []).length, term);
  }
});

test('the section title is recognised with or without its number', () => {
  assert.ok(hasLayoutsSection('# D\n\n## 9. Mises en page\n'));
  assert.ok(hasLayoutsSection('## Mises en page\n'));
  assert.ok(!hasLayoutsSection('## 4. Layout\nles mises en page ci-dessous'));
});
