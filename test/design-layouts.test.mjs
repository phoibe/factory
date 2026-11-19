// Issue #509: every project's DESIGN.md describes its screen layouts (« Mises en page »), kept current by each build
// and checked by the design pass; a project framed from another project's design copies its layouts too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// True when a DESIGN.md has its « Mises en page » section (`## Mises en page`, `## 9. Mises en page`…).
const hasLayoutsSection = (text) => /^##\s+(?:\d+\.\s*)?Mises en page\b/im.test(String(text || ''));

const stage = (f) => readFileSync(new URL(`../agent/stages/${f}`, import.meta.url), 'utf8');
const SECTION = 'Mises en page';

test('design-pass.md defines the « Mises en page » section with its fixed grid', () => {
  const section = stage('design-pass.md').split(`\n## ${SECTION}\n`)[1]?.split('\n## ')[0];
  assert.ok(section, `missing "## ${SECTION}" section`);
  for (const term of ['Disposition générale', 'Sommaire ou navigation', 'Largeur', 'Libellés et explications',
    'Volets repliables', 'Sur téléphone', 'Écrans concernés', 'schéma', 'capture', 'Aucun écran pour l\'instant',
    'largeurs chiffrées']) {
    assert.ok(section.includes(term), `the grid does not mention "${term}"`);
  }
});

test('the design pass completes a late document and fixes a screen that contradicts it', () => {
  const md = stage('design-pass.md');
  assert.match(md, /Mise en page ajoutée au design : …/);
  assert.match(md, /contredit[^.]*mise en page[^.]*\. C'est l'écran\s+qui est corrigé, pas le\s+document/);
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

test('a reused design never gets the project\'s own layouts written over the reference ones (PR #512)', () => {
  const md = stage('design-pass.md');
  assert.match(md, /Design repris de <projet> \(`<dépôt>`\)/);
  assert.match(md, /ne la modifie jamais avec ce qui est propre à ce projet/);
  assert.match(md, /ne complète jamais le document/);
  assert.match(md, /Mise en page absente de <projet de référence>/);
  assert.match(stage('build.md'), /design repris\*\* ne change jamais cette partie/);
  assert.match(stage('foundation.md'), /en tête de `DESIGN\.md` la ligne « Design repris de/);
});

test('a project without the section only gets it on request, never in passing (PR #512)', () => {
  assert.match(stage('design-pass.md'), /ne la reçoit que sur demande du\s+propriétaire[^]{0,200}Ne la crée jamais en passant/);
  assert.match(stage('build.md'), /\*\*sans\*\* cette partie ne la\s+reçoit que si la demande la réclame/);
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
