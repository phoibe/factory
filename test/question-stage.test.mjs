import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../agent/stages/question.md', import.meta.url), 'utf8');

test('the question stage creates a ticket only on an explicit action of the owner', () => {
  assert.match(stage, /\*\*jamais\*\* une issue de toi-même/);
  assert.match(stage, /Voulez-vous\s+que\s+j'en\s+fasse\s+une\s+fiche\s+\?/);
  assert.match(stage, /Une\s+seule\s+fois/);
  assert.match(stage, /Créez une issue/);
  assert.doesNotMatch(stage, /Crée une issue/);
  assert.doesNotMatch(stage, /Une demande floue \? Crée quand même/);
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
