// Issue #401: the engine moved into scripts/relay/, but `node scripts/relay.mjs <command>` is what the workflows run.
// These tests run the real command line in a child process, with GitHub answered by a stub (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
  try { return { ...r, outputs: readFileSync(out, 'utf8') }; } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('the command line « decide » still handles an event from start to end', () => {
  const r = runRelay('decide', { repository: { owner: { login: 'o' } } });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /ReferenceError|is not defined/);
});

// A checks run's duration is measured when its report arrives, not once the report got the queue lock (up to 13 min
// later): a run replaced after 1 min must not pass for one stopped at a short time limit (5 min in Paramètres).
test('the checks report measures the run before waiting for the queue lock', () => {
  const src = readFileSync(RELAY, 'utf8');
  const at = src.indexOf('const reportAt = ');
  const call = src.indexOf('withLock(gh.queueLock, () => relay.report(');
  assert.ok(at > 0 && call > at, 'the time is taken before the lock');
  assert.match(src.slice(call, src.indexOf('\n', call)), /now: reportAt/);
});

test('the checks report takes the end of the checks job when GitHub gives it', () => {
  const src = readFileSync(RELAY, 'utf8');
  assert.match(src, /const reportAt = checksEndedAt\(await gh\.runJobs\(process\.env\.GITHUB_RUN_ID\)\.catch\(\(\) => \[\]\)\) \?\? Date\.now\(\);/);
});

test('each relay run ends by printing its GitHub reads, free answers and reserve (issue #491)', () => {
  const r = runRelay('decide', { repository: { owner: { login: 'o' } } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /GitHub usage: \d+ counted reads, \d+ free \(304\), \d+ writes, reserve/);
  assert.match(r.stdout, /\n {2}\d+ GET \/repos\/\{repo\}\//);
});

// A decide, release or report run that waited too long for the queue lock ends on the step the tick re-runs (it
// writes the `ratelimited` output), instead of failing for good with its event lost.
test('a run that waited too long for the queue lock is re-run by the tick, only for the commands that can be', async () => {
  const { retriedLater } = await import('../scripts/relay.mjs');
  const { withLock } = await import('../scripts/lib/lock.mjs');
  let t = 0;
  const store = { acquire: async () => false, ageMs: async () => 10, release: async () => {} };
  const e = await withLock(store, async () => {}, { waitMs: 5000, pollMs: 1000, sleep: async (ms) => { t += ms; }, now: () => t }).catch((x) => x);
  for (const command of ['decide', 'release', 'report']) assert.equal(retriedLater(command, e), true, command);
  assert.equal(retriedLater('prod-report', e), false);
  assert.equal(retriedLater('decide', new Error('a bug')), false);
});
