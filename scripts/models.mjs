#!/usr/bin/env node
// Monthly catalog update (issue #544): reads the latest Claude model ids from Anthropic's documentation and rewrites
// the catalog of scripts/lib/models.mjs; then reads the public prices (issue #628) and rewrites the table of
// scripts/lib/prices.mjs. Usage: node scripts/models.mjs --latest
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseModelIds, updateCatalog } from './lib/models.mjs';
import { parsePrices, updatePrices as updatePriceTable } from './lib/prices.mjs';

export const SOURCES = [
  'https://platform.claude.com/docs/en/about-claude/models/overview',
  'https://docs.anthropic.com/en/docs/about-claude/models/overview',
];
export const PRICE_SOURCES = [
  'https://platform.claude.com/docs/en/about-claude/pricing',
  'https://docs.anthropic.com/en/docs/about-claude/pricing',
];
const CATALOG = fileURLToPath(new URL('./lib/models.mjs', import.meta.url));
const PRICE_TABLE = fileURLToPath(new URL('./lib/prices.mjs', import.meta.url));

// What `parse` finds in the first source that answers with something; [] when none does. Never throws.
// A source that does not answer within `timeoutMs` is given up for the next one.
async function readFirst(sources, parse, { fetchImpl, timeoutMs }) {
  for (const url of sources) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      const found = parse(await res.text());
      if (found.length) return found;
    } catch { /* next source */ }
  }
  return [];
}

// Returns true when the catalog changed (the file is written only then). Never throws on a network error.
export async function updateModels({ fetchImpl = fetch, file = CATALOG, log = console.log, timeoutMs = 30_000 } = {}) {
  const found = await readFirst(SOURCES, parseModelIds, { fetchImpl, timeoutMs });
  if (!found.length) { log('Models: no model id found, catalog left as is.'); return false; }
  const source = readFileSync(file, 'utf8');
  const next = updateCatalog(source, found);
  if (next === source) { log('Models: catalog already up to date.'); return false; }
  writeFileSync(file, next);
  const before = new Map([...source.matchAll(/id: '([^']+)', name: '[^']*', version: '([^']+)'/g)].map((m) => [m[1], m[2]]));
  for (const f of found) {
    if (!before.has(f.id)) log(`Models: added ${f.id} ${f.version}`);
    else if (before.get(f.id) !== f.version && next.includes(`id: '${f.id}', name: '${f.id[0].toUpperCase()}${f.id.slice(1)}', version: '${f.version}'`)) log(`Models: ${f.id} ${before.get(f.id)} -> ${f.version}`);
  }
  return true;
}

const short = (model) => model.replace(/^claude-/, '');
const triple = (p) => `${p.input}/${p.output}/${p.cacheRead}`;

// Returns true when the price table changed (the file is written only then). Never throws on a network error.
export async function updatePrices({ fetchImpl = fetch, file = PRICE_TABLE, log = console.log, timeoutMs = 30_000, today = new Date().toISOString().slice(0, 10) } = {}) {
  const found = await readFirst(PRICE_SOURCES, parsePrices, { fetchImpl, timeoutMs });
  if (!found.length) { log('Prices: no price found, table left as is.'); return false; }
  const source = readFileSync(file, 'utf8');
  const next = updatePriceTable(source, found, today);
  if (next === source) { log('Prices: table already up to date.'); return false; }
  writeFileSync(file, next);
  const line = /model: '([^']+)', input: ([\d.]+), output: ([\d.]+), cacheRead: ([\d.]+)/g;
  const before = new Map([...source.matchAll(line)].map((m) => [m[1], { input: +m[2], output: +m[3], cacheRead: +m[4] }]));
  for (const f of found) {
    const was = before.get(f.model);
    if (!was) log(`Prices: added ${short(f.model)} ${triple(f)}`);
    else if (triple(was) !== triple(f)) log(`Prices: ${short(f.model)} ${triple(was)} -> ${triple(f)}`);
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--latest')) { console.log('Usage: node scripts/models.mjs --latest'); process.exit(0); }
  await updateModels();
  await updatePrices();
}
