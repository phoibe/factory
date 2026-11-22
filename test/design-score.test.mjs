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
  assert.match(md, /score n.est pas recalculé lors des retouches/, 'not recomputed on screenshot touch-ups');
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

test('the score line is scoped: only build, ui-polish and audit, and only after a design pass', () => {
  const md = read('design-pass.md');
  assert.match(md, /Seulement pour une feature\s+\(`build\.md`\), une amélioration UI \(`ui-polish\.md`\) ou une review générale \(`audit\.md`\)/);
  assert.match(md, /Sans passe design[^]{0,60}pas de ligne/);
  assert.match(md, /Score design : 30\/40 \(corrigé, sans nouvelle critique\)/);
  for (const f of ['build.md', 'audit.md']) assert.match(read(f), /s'il y a eu une passe design, la ligne/, f);
  for (const f of ['bugfix.md', 'acceptance-fix.md', 'visual-fix.md', 'skills-fix.md', 'foundation.md']) {
    assert.doesNotMatch(read(f), /Score design/, f);
  }
});
