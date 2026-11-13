import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../agent/stages/${f}`, import.meta.url), 'utf8');
const grilling = read('grilling.md');
const spec = read('spec.md');

test('a small, clear, non-sensitive request skips the questions and goes straight to the spec', () => {
  assert.match(grilling, /Demande petite et claire \?/);
  assert.match(grilling, /\*\*toutes\*\* les questions/);
  assert.match(grilling, /pas de nouvel écran/);
  assert.match(grilling, /une seule\s+construction/);
});

test('sensitive requests always keep their questions', () => {
  assert.match(grilling, /Une demande \*\*sensible\*\* garde toujours ses questions/);
});

test('a round only asks the real questions; the obvious ones go to the spec', () => {
  assert.match(grilling, /seulement les vraies questions/);
  assert.match(grilling, /Ce que j'ai décidé pour vous/);
});

test('the spec lists the choices made for the owner and says when the questions were skipped', () => {
  assert.match(spec, /### Ce que j'ai décidé pour vous/);
  assert.match(spec, /Pas de questions : la demande était claire\./);
});

test('a spec reached by skipping the questions starts the build on its own unless it is sensible', () => {
  assert.match(spec, /questions\s+sautées/);
});
