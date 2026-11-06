import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStack, stackDate, inlineParts, STACK_SECTIONS } from '../panel/stack.mjs';

const SHEET = `# Stack technique

Quelques mots d'introduction.

## Interface
- **Langage** : JavaScript — aucun framework

## Bibliothèques
### Pour faire tourner le logiciel
- Aucune
### Pour la fabrication et les tests
- **Playwright 1** — pilote un navigateur
- **axe-core 4** — vérifie l'accessibilité
`;

test('the sections come in the order of the sheet, with their lists and sub-headings', () => {
  const { intro, sections } = parseStack(SHEET);
  assert.deepEqual(intro, ["Quelques mots d'introduction."]);
  assert.deepEqual(sections.map((s) => s.title), ['Interface', 'Bibliothèques']);
  assert.deepEqual(sections[0].blocks, [{ type: 'ul', items: ['**Langage** : JavaScript — aucun framework'] }]);
  assert.deepEqual(sections[1].blocks, [
    { type: 'h', text: 'Pour faire tourner le logiciel' },
    { type: 'ul', items: ['Aucune'] },
    { type: 'h', text: 'Pour la fabrication et les tests' },
    { type: 'ul', items: ['**Playwright 1** — pilote un navigateur', "**axe-core 4** — vérifie l'accessibilité"] },
  ]);
});

test('an empty or missing sheet has no section', () => {
  assert.deepEqual(parseStack('').sections, []);
  assert.deepEqual(parseStack(null).sections, []);
});

test('a plain paragraph in a section is kept, joined across lines', () => {
  const { sections } = parseStack('## Données\nPas de base de données classique :\ntout est dans GitHub.\n');
  assert.deepEqual(sections[0].blocks, [{ type: 'p', text: 'Pas de base de données classique : tout est dans GitHub.' }]);
});

test('bold parts are split out for display', () => {
  assert.deepEqual(inlineParts('**Node.js 22** — moteur'), [{ bold: true, text: 'Node.js 22' }, { bold: false, text: ' — moteur' }]);
  assert.deepEqual(inlineParts('rien'), [{ bold: false, text: 'rien' }]);
});

test('the date reads « Mise à jour le 6 novembre 2026 »', () => {
  assert.equal(stackDate('2026-11-06T15:42:31Z'), 'Mise à jour le 6 novembre 2026');
  assert.equal(stackDate(null), '');
});

test('the sheet sections are the ones of the spec, in order', () => {
  assert.deepEqual(STACK_SECTIONS, ['Interface', 'Moteur / serveur', 'Autres services', 'Données', 'Bibliothèques', 'Services nécessaires']);
});

import { readFileSync } from 'node:fs';
const factorySheet = () => parseStack(readFileSync(new URL('../STACK.md', import.meta.url), 'utf8'));
const textOf = (s) => s.blocks.flatMap((b) => b.items || [b.text]).join('\n');

test('the factory sheet has every section of the spec, in order', () => {
  assert.deepEqual(factorySheet().sections.map((s) => s.title), STACK_SECTIONS);
});

test('the factory sheet says what criterion 3 of the spec lists', () => {
  const s = Object.fromEntries(factorySheet().sections.map((x) => [x.title, textOf(x)]));
  assert.match(s.Interface, /aucun framework/);
  assert.match(s.Interface, /GitHub Pages/);
  assert.match(s['Moteur / serveur'], /Node\.js 22/);
  assert.match(s['Moteur / serveur'], /aucun framework/);
  assert.match(s['Moteur / serveur'], /GitHub Actions/);
  assert.match(s['Autres services'], /Python 3\.12/);
  assert.match(s['Autres services'], /FastAPI 0\.115/);
  assert.match(s['Autres services'], /Modal/);
  assert.match(s.Données, /Pas de base de données classique/);
  const libs = factorySheet().sections.find((x) => x.title === 'Bibliothèques').blocks;
  const build = libs.findIndex((b) => b.type === 'h' && /fabrication et les tests/.test(b.text));
  assert.ok(build > 0);
  assert.match(libs.slice(build).map((b) => (b.items || []).join('\n')).join('\n'), /Playwright 1[\s\S]*axe-core 4/);
});

test('each library and service of the factory sheet has its version or terms, and a short explanation', () => {
  const sheet = factorySheet().sections;
  const libs = sheet.find((x) => x.title === 'Bibliothèques').blocks.flatMap((b) => b.items || []).filter((i) => i.startsWith('**'));
  for (const l of libs) assert.match(l, /\*\* (\(.*\) )?— \S/, l);
  for (const l of libs.filter((i) => !/copie intégrée/.test(i))) assert.match(l, /\*\*[^*]+ \d+(\.\d+)?\*\*/, l);
  for (const svc of sheet.find((x) => x.title === 'Services nécessaires').blocks.flatMap((b) => b.items)) {
    assert.match(svc, /— (gratuit|payant), (compte nécessaire|sans compte)\./, svc);
  }
});
