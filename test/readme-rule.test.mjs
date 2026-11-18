// Issue #466: every project's README (« présentation ») is written in French, follows GitHub's recommended
// content, and is reviewed on each delivered feature. The rules live in the instructions synced to projects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a shared README guide is sent to every project', () => {
  assert.ok(existsSync(new URL('../agent/stages/readme.md', import.meta.url)));
});

test('the README guide asks for a short French README with the recommended parts, in order', () => {
  const g = read('agent/stages/readme.md');
  assert.match(g, /en français/);
  assert.match(g, /courte/i);
  const parts = ['## À quoi sert', '## Adresse', '## Ce que vous pouvez faire', '## Lancer', '## Licence'];
  let last = -1;
  for (const p of parts) {
    const i = g.indexOf(p);
    assert.ok(i > last, `${p} missing or out of order`);
    last = i;
  }
  assert.match(g, /capture[^\n]*page d'accueil/i);
});

test('the README guide never lets the agent add a licence, and leaves the factory itself alone', () => {
  const g = read('agent/stages/readme.md');
  assert.match(g, /n'ajoutes? jamais de licence/);
  assert.match(g, /`repo`[^\n]*`factory`/);
});

test('each delivered feature reviews the README in the same PR, without blocking it', () => {
  const b = read('agent/stages/build.md');
  assert.match(b, /\.factory\/stages\/readme\.md/);
  assert.match(b, /Présentation[\s\S]{0,600}ne bloque/);
});

test('a new project gets the French README from the start', () => {
  const f = read('agent/stages/foundation.md');
  assert.doesNotMatch(f, /README\.md` technique court \(en anglais\)/);
  assert.match(f, /\.factory\/stages\/readme\.md/);
});

test('the no-licence decision is recorded', () => {
  assert.match(read('docs/adr/0010-pas-de-licence-sans-accord.md'), /licence/);
});
