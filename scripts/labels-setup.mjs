#!/usr/bin/env node
// Creates or updates the factory:* labels in the current repository (GITHUB_REPOSITORY, GITHUB_TOKEN).
import { fileURLToPath } from 'node:url';
import { LABEL_DEFS } from './lib/labels.mjs';
import { github } from './lib/github.mjs';

export async function ensureLabels(gh) {
  const existing = new Set(((await gh.request('GET', '/repos/{repo}/labels?per_page=100')) || []).map((l) => l.name));
  for (const [name, color, description] of LABEL_DEFS) {
    const update = () => gh.request('PATCH', `/repos/{repo}/labels/${encodeURIComponent(name)}`, { color, description });
    if (existing.has(name)) { await update(); continue; }
    // Past the first 100 labels the list misses some: creating an existing one answers 422, so update it instead.
    try { await gh.request('POST', '/repos/{repo}/labels', { name, color, description }); } catch (e) {
      if (!/\b422\b/.test(String(e.message || e))) throw e;
      await update();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await ensureLabels(github({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY }));
  console.log(`labels ok (${LABEL_DEFS.length})`);
}
