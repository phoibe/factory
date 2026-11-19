import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../agent/stages/question.md', import.meta.url), 'utf8');

test('the question stage creates a ticket only on an explicit action of the owner', () => {
  assert.match(stage, /\*\*jamais\*\* une issue de toi-même/);
  assert.match(stage, /Une\s+carte\s+par\s+sujet/);
  assert.match(stage, /Créez une issue/);
  assert.doesNotMatch(stage, /Crée une issue/);
  assert.doesNotMatch(stage, /Une demande floue \? Crée quand même/);
});

test('the question stage only proposes a request, the owner creates it with a click (issue #492)', () => {
  assert.match(stage, /<creer-issue type="feature" titre="/);
  assert.match(stage, /Créer cette demande/);
  assert.doesNotMatch(stage, /crée l'issue avec l'API REST/i);
  assert.doesNotMatch(stage, /state=closed/);
});

test('both chat agents know the coloured callouts and keep them for what matters (issue #460)', () => {
  const server = readFileSync(new URL('../server/chat/core.py', import.meta.url), 'utf8');
  for (const text of [stage, server]) {
    assert.match(text, /⚠️[^\n]*orange/);
    assert.match(text, /✅[^\n]*vert/);
    assert.match(text, /➡️[^\n]*bleu/);
    assert.match(text, /seulement\s+quand ça compte/);
  }
});

test('the question agent never creates a ticket itself, by any means (issue #492)', () => {
  assert.match(stage, /ni `gh api …\/issues`, ni `gh issue create`, ni autre moyen/);
});

test('the question agent shows the card right away, without asking first (issue #506)', () => {
  assert.doesNotMatch(stage, /voulez-vous\s+(que\s+j'en\s+fasse\s+)?une\s+fiche/i);
  assert.match(stage, /directement/);
  assert.match(stage, /simple question/);
  assert.match(stage, /ne la repropose pas/);
  assert.match(stage, /aucune issue ouverte ne traite déjà le sujet/);
  assert.match(stage, /select\(\.pull_request \| not\)/);
  assert.match(stage, /factory:question/);
  assert.match(stage, /sauf s'il la redemande/);
  assert.match(stage, /déjà proposé une sur ce sujet[^.]*en attente, ignorée ou refusée/);
});
