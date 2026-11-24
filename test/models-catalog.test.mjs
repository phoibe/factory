import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseModelIds, updateCatalog } from '../scripts/lib/models.mjs';

const TEXT = 'ids: claude-opus-5-5, claude-opus-4-8, claude-sonnet-5-5-20260101, claude-mythos-1-0, claude-3-5-sonnet-20241022, claude-3-opus';
// A fixed catalog, never the live scripts/lib/models.mjs: a real monthly bump must not break these tests.
const source = `// fixture
// catalog:start
export const MODEL_FAMILIES = [
  { id: 'fable', name: 'Fable', version: '5.2' },
  { id: 'opus', name: 'Opus', version: '5.5' },
  { id: 'sonnet', name: 'Sonnet', version: '5.5' },
  { id: 'haiku', name: 'Haiku', version: '5.5' },
];
// catalog:end
export const AFTER = true;
`;
const byId = (found) => Object.fromEntries(found.map((f) => [f.id, f.version]));

test('parseModelIds keeps the latest version per family and ignores legacy ids', () => {
  const found = byId(parseModelIds(TEXT));
  assert.deepEqual(found, { opus: '5.5', sonnet: '5.5', mythos: '1.0' });
});

test('parseModelIds compares versions numerically', () => {
  assert.equal(byId(parseModelIds('claude-opus-5-2 claude-opus-5-5 claude-opus-4-8')).opus, '5.5');
  assert.equal(byId(parseModelIds('claude-opus-5-5 claude-opus-6')).opus, '6');
  assert.equal(byId(parseModelIds('claude-opus-4-8 claude-opus-4-10')).opus, '4.10');
  assert.deepEqual(parseModelIds('nothing here, claude-3-opus'), []);
});

test('updateCatalog adds a family, bumps a newer one, never downgrades nor removes', async () => {
  const next = updateCatalog(source, parseModelIds(`${TEXT} claude-haiku-4-5 claude-fable-5-3`));
  const dir = mkdtempSync(join(tmpdir(), 'models-'));
  const file = join(dir, 'models.mjs');
  writeFileSync(file, next);
  const mod = await import(pathToFileURL(file).href);
  const by = Object.fromEntries(mod.MODEL_FAMILIES.map((f) => [f.id, f]));
  assert.equal(by.mythos.name, 'Mythos');
  assert.equal(by.mythos.version, '1.0');
  assert.equal(mod.MODEL_FAMILIES.at(-1).id, 'mythos');
  assert.equal(by.fable.version, '5.3', 'bumped');
  assert.equal(by.haiku.version, '5.5', 'not downgraded');
  assert.equal(by.opus.version, '5.5');
  assert.ok(by.sonnet && by.haiku && by.fable, 'none removed');
  assert.equal(next.slice(0, next.indexOf('// catalog:start')), source.slice(0, source.indexOf('// catalog:start')));
  assert.equal(next.slice(next.indexOf('// catalog:end')), source.slice(source.indexOf('// catalog:end')));
});

test('the CLI writes the file only when something changed, and survives a network failure', async () => {
  const { updateModels } = await import('../scripts/models.mjs');
  const file = join(mkdtempSync(join(tmpdir(), 'models-cli-')), 'models.mjs');
  writeFileSync(file, source);
  const logs = [];
  const page = (text) => async () => ({ ok: true, text: async () => text });
  assert.equal(await updateModels({ fetchImpl: async () => { throw new Error('offline'); }, file, log: (l) => logs.push(l) }), false);
  assert.equal(readFileSync(file, 'utf8'), source);
  assert.equal(await updateModels({ fetchImpl: page('claude-opus-5-5'), file, log: (l) => logs.push(l) }), false);
  assert.equal(await updateModels({ fetchImpl: page('claude-mythos-1-0 claude-opus-6'), file, log: (l) => logs.push(l) }), true);
  assert.match(readFileSync(file, 'utf8'), /id: 'mythos', name: 'Mythos', version: '1.0'/);
  assert.ok(logs.some((l) => /added mythos 1.0/.test(l)) && logs.some((l) => /opus 5\.5 -> 6/.test(l)));
});

test('a new family needs a minor version or a date; a known one accepts a bare major', () => {
  assert.deepEqual(parseModelIds('claude-max-5 claude-code-2'), []);
  assert.equal(byId(parseModelIds('claude-mythos-1-20260101')).mythos, '1');
  assert.equal(byId(parseModelIds('claude-mythos-1-0')).mythos, '1.0');
  assert.equal(byId(parseModelIds('claude-opus-6')).opus, '6');
});

test('updateCatalog returns the same text when nothing changed', () => {
  assert.equal(updateCatalog(source, parseModelIds('claude-opus-5-5 claude-haiku-4-5')), source);
  assert.equal(updateCatalog(source, []), source);
});
