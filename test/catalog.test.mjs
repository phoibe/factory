import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'packs/catalog.json'), 'utf8'));

test('catalog has the three packs', () => {
  assert.deepEqual(catalog.packs.map((p) => p.id), ['superpowers', 'matt-pocock', 'impeccable']);
});

test('skill ids are unique across packs', () => {
  const ids = catalog.packs.flatMap((p) => p.skills.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('every skill path holds a SKILL.md and a description', () => {
  for (const p of catalog.packs) {
    for (const s of p.skills) {
      assert.ok(existsSync(join(root, s.path, 'SKILL.md')), s.path);
      assert.ok(s.description.length > 0, s.id);
    }
  }
});

test('expected defaults are enabled', () => {
  const on = catalog.packs.flatMap((p) => p.skills.filter((s) => s.defaultEnabled).map((s) => s.id));
  for (const id of ['grilling', 'grill-with-docs', 'domain-modeling', 'test-driven-development', 'impeccable', 'requesting-code-review']) {
    assert.ok(on.includes(id), id);
  }
  assert.ok(!on.includes('brainstorming'));
});
