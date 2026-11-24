#!/usr/bin/env node
// Monthly catalog update (issue #544): reads the latest Claude model ids from Anthropic's documentation and rewrites
// the catalog of scripts/lib/models.mjs. Usage: node scripts/models.mjs --latest
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseModelIds, updateCatalog } from './lib/models.mjs';

export const SOURCES = [
  'https://platform.claude.com/docs/en/about-claude/models/overview',
  'https://docs.anthropic.com/en/docs/about-claude/models/overview',
];
const CATALOG = fileURLToPath(new URL('./lib/models.mjs', import.meta.url));

// Returns the summary lines printed; writes the file only when the catalog changed. Never throws on a network error.
// A source that does not answer within `timeoutMs` is given up for the next one.
export async function updateModels({ fetchImpl = fetch, file = CATALOG, log = console.log, timeoutMs = 30_000 } = {}) {
  let found = [];
  for (const url of SOURCES) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      found = parseModelIds(await res.text());
      if (found.length) break;
    } catch { /* next source */ }
  }
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--latest')) { console.log('Usage: node scripts/models.mjs --latest'); process.exit(0); }
  await updateModels();
}
