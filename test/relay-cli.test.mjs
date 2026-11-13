// Issue #401: the engine moved into scripts/relay/, but `node scripts/relay.mjs <command>` is what the workflows run.
// These tests run the real command line in a child process, with GitHub answered by a stub (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELAY = fileURLToPath(new URL('../scripts/relay.mjs', import.meta.url));
// GitHub as seen by an empty repository: no config file, no lock, nothing open. Writes succeed.
const STUB = `globalThis.fetch = async (url, init = {}) => {
  const method = init.method || 'GET';
  const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (method !== 'GET') return json(201, { sha: 'abc', id: 1 });
  if (/\\/contents\\/|\\/git\\/ref/.test(String(url))) return json(404, { message: 'Not Found' });
  return json(200, []);
};`;

function runRelay(command, event) {
  const dir = mkdtempSync(join(tmpdir(), 'relay-cli-'));
  writeFileSync(join(dir, 'stub.mjs'), STUB);
  writeFileSync(join(dir, 'event.json'), JSON.stringify(event));
  const out = join(dir, 'out.txt');
  writeFileSync(out, '');
  const r = spawnSync(process.execPath, ['--import', join(dir, 'stub.mjs'), RELAY, command], {
    encoding: 'utf8', timeout: 60_000,
    env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'o/r', GITHUB_REPOSITORY_OWNER: 'o', GITHUB_TOKEN: 't', GITHUB_EVENT_NAME: 'schedule', GITHUB_EVENT_PATH: join(dir, 'event.json'), GITHUB_OUTPUT: out },
  });
  return { ...r, outputs: readFileSync(out, 'utf8') };
}

test('the command line « decide » still handles an event from start to end', () => {
  const r = runRelay('decide', { repository: { owner: { login: 'o' } } });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /ReferenceError|is not defined/);
});
