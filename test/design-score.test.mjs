// Issue #530: the design score must reach the request itself (the issue), not only the PR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../agent/stages/${f}`, import.meta.url), 'utf8');

test('design-pass.md puts the score line in the closing message of the request', () => {
  const md = read('design-pass.md');
  assert.match(md, /Score design : 24\/40 → 32\/40/, 'first → last format');
  assert.match(md, /Score design : 34\/40, rien à corriger/, 'nothing-to-fix format');
  assert.match(md, /message[^.]{0,80}lien de la PR/, 'goes into the message carrying the PR link');
  assert.match(md, /pas recalculé/, 'not recomputed on screenshot touch-ups');
});

test('every stage with a design pass adds the score to its final issue message', () => {
  for (const f of ['build.md', 'ui-polish.md', 'audit.md']) {
    assert.match(read(f), /court message avec le lien de la PR[^]{0,80}Score design/, `${f}: final message lacks the score line`);
  }
});

test('ui-polish closing without anything to fix gives the score', () => {
  const md = read('ui-polish.md');
  assert.match(md, /rien n'a changé[^]{0,300}Score design : <score>\/40, rien à corriger/);
});
