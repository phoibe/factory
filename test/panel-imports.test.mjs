// Two specifiers for one panel module load it twice (two copies of its state): every import must use the same one.
// The sources carry no `?v=` any more (issue #561): scripts/stamp-panel.mjs adds the build to every address at publish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const dir = new URL('../panel/', import.meta.url);

async function specifiers() {
  const found = new Map(); // module → Map(specifier → [files])
  const add = (spec, file) => {
    const name = spec.replace(/^\.\//, '').split('?')[0];
    if (!found.has(name)) found.set(name, new Map());
    const by = found.get(name);
    by.set(spec.replace(/^\.\//, ''), [...(by.get(spec.replace(/^\.\//, '')) || []), file]);
  };
  for (const file of await readdir(dir)) {
    if (!/\.(mjs|html)$/.test(file)) continue;
    const text = await readFile(new URL(file, dir), 'utf8');
    for (const m of text.matchAll(/\bfrom\s+'(\.\/[^']+)'/g)) add(m[1], file);
    for (const m of text.matchAll(/\bimport\(\s*'(\.\/[^']+)'\s*\)/g)) add(m[1], file);
    for (const m of text.matchAll(/<script[^>]*\bsrc="([^"]+\.mjs[^"]*)"/g)) add(m[1], file);
  }
  return found;
}

test('every import of a panel module uses the same specifier', async () => {
  const found = await specifiers();
  assert.ok(found.size > 10, 'the scan finds the panel imports');
  const mixed = [...found].filter(([, by]) => by.size > 1)
    .map(([name, by]) => `${name}: ${[...by].map(([spec, files]) => `${spec} (${files.join(', ')})`).join(' / ')}`);
  assert.deepEqual(mixed, []);
});
