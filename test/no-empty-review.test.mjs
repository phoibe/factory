import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../agent/stages/${f}`, import.meta.url), 'utf8');

test('the screenshots stage never asks to validate when no screen changed', () => {
  const s = read('screenshots.md');
  assert.match(s, /factory-shots-unchanged/);
  assert.match(s, /ne\s+demande\s+rien/);
  assert.match(s, /pas\s+`factory:visual-review`/);
  assert.match(s, /revérifie/);
});

// Issue #455: the agent never puts the card in « Captures à valider » itself; the factory does, once it posted the
// captures. So no screen changed (nothing posted) never asks for a validation either.
for (const stage of ['build.md', 'bugfix.md', 'acceptance-fix.md', 'audit.md', 'skills-fix.md', 'foundation.md']) {
  test(`${stage}: no « captures à valider » when no screen changed`, () => {
    const s = read(stage).replace(/\s+/g, ' ');
    assert.match(s, /pose elle-même `factory:visual-review`|jamais `factory:visual-review` toi-même|met elle-même la carte en « Captures à valider »/i);
    assert.doesNotMatch(s, /mets (les labels )?`factory:visual-review`|`factory:visual-review` (puis|et) `factory:checks`/i);
  });
}

test('after a retouch that brings every screen back, the card leaves « captures à valider »', () => {
  const s = read('visual-fix.md');
  assert.match(s, /factory-shots-unchanged/);
  assert.match(s, /retire `factory:visual-review`/);
});
