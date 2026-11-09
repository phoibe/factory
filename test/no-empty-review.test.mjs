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

for (const stage of ['build.md', 'bugfix.md', 'acceptance-fix.md']) {
  test(`${stage}: no « captures à valider » when no screen changed`, () => {
    assert.match(read(stage), /aucun écran n'a changé[^\n]*\n?[^\n]*`factory:checks` seul/i);
  });
}

test('after a retouch that brings every screen back, the card leaves « captures à valider »', () => {
  const s = read('visual-fix.md');
  assert.match(s, /factory-shots-unchanged/);
  assert.match(s, /retire `factory:visual-review`/);
});
