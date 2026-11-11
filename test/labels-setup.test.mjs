import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureLabels } from '../scripts/labels-setup.mjs';
import { LABEL_DEFS } from '../scripts/lib/labels.mjs';

test('a label missed by the first page (POST 422) is updated instead of failing the sync', async () => {
  const calls = [];
  const gh = { request: async (method, path, body) => {
    calls.push(`${method} ${path}`);
    if (method === 'GET') return []; // the label exists but is not in the page read
    if (method === 'POST') throw new Error(`POST ${path} -> 422 already_exists`);
    return null;
  } };
  await ensureLabels(gh);
  const name = encodeURIComponent(LABEL_DEFS[0][0]);
  assert.ok(calls.includes(`PATCH /repos/{repo}/labels/${name}`));
  assert.equal(calls.filter((c) => c.startsWith('PATCH')).length, LABEL_DEFS.length);
});

test('other create errors still fail', async () => {
  const gh = { request: async (m) => { if (m === 'GET') return []; throw new Error('POST x -> 500 boom'); } };
  await assert.rejects(ensureLabels(gh), /500/);
});
