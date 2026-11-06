import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smokeRoutes, routeUrl, isProtected, pageProblem, smoke, smokeUntil } from '../scripts/smoke.mjs';

test('the screens opened are « / » plus the listed ones', () => {
  assert.deepEqual(smokeRoutes('# écrans\n/connexion\n\n/planning # le planning\nnot-a-path\n/'), ['/', '/connexion', '/planning']);
  assert.deepEqual(smokeRoutes(''), ['/']);
});

test('screens open inside the site, even when it lives in a sub-folder (GitHub Pages)', () => {
  assert.equal(routeUrl('/', 'https://phoibe.github.io/factory/'), 'https://phoibe.github.io/factory/');
  assert.equal(routeUrl('/', 'https://phoibe.github.io/factory'), 'https://phoibe.github.io/factory/');
  assert.equal(routeUrl('/planning', 'https://phoibe.github.io/factory/'), 'https://phoibe.github.io/factory/planning');
  assert.equal(routeUrl('/connexion?x=1', 'https://app.example/'), 'https://app.example/connexion?x=1');
  assert.equal(routeUrl('/', 'https://app.example'), 'https://app.example/');
  assert.equal(routeUrl('/user:42', 'https://x.io/app/'), 'https://x.io/app/user:42');
  assert.equal(routeUrl('/p#h', 'https://x.io/a/b/?q=1#z'), 'https://x.io/a/b/p#h');
});

test('a version protected by its host is not a failure', () => {
  assert.equal(isProtected(401), true);
  assert.equal(isProtected(302, 'https://vercel.com/sso-api?url=x'), true);
  assert.equal(isProtected(200, 'https://app.example/'), false);
});

test('page problems are said in plain French', () => {
  assert.equal(pageProblem({ status: 200, text: 'Bonjour' }), null);
  assert.match(pageProblem({ status: 200, text: '  ' }), /vide/);
  assert.match(pageProblem({ status: 200, text: 'x', serverErrors: ['500 /api/slots'] }), /serveur.*500 \/api\/slots/);
  assert.match(pageProblem({ status: 200, text: 'x', errors: ['TypeError: x is undefined'] }), /erreur dans la page/);
  assert.match(pageProblem({ status: 404, text: 'x' }), /404/);
});

test('an address that does not answer fails; a protected one is skipped, before any install', async () => {
  const down = await smoke({ url: 'https://x.example', dir: '/nonexistent', fetchImpl: async () => { throw new Error('ENOTFOUND'); }, log: () => {} });
  assert.equal(down.result, 'failed');
  const prot = await smoke({ url: 'https://x.example', dir: '/nonexistent', fetchImpl: async () => ({ status: 401, headers: new Map() }), log: () => {} });
  assert.equal(prot.result, 'skipped');
  const noApp = await smoke({ url: 'https://x.example', dir: '/nonexistent', fetchImpl: async () => ({ status: 200, headers: new Map() }), log: () => {} });
  assert.equal(noApp.result, 'passed');
});

// Issue #227: a live site that does not answer well right after a delivery is often still being published.
test('the live site is checked again for about 5 minutes before a failure counts', async () => {
  let clock = 0;
  const seen = [];
  const results = [{ result: 'failed', detail: '/ : la page répond 404' }, { result: 'failed', detail: '/ : la page répond 404' }, { result: 'passed', detail: 'ok' }];
  const out = await smokeUntil({ check: async (attempt) => { seen.push(attempt); return results[attempt]; }, retryMs: 5 * 60_000, intervalMs: 60_000, sleep: async (ms) => { clock += ms; }, now: () => clock });
  assert.equal(out.result, 'passed');
  assert.deepEqual(seen, [0, 1, 2]);
});

test('a live site still broken after 5 minutes is a failure, said as such', async () => {
  let clock = 0;
  let calls = 0;
  const out = await smokeUntil({ check: async () => { calls++; clock += 20_000; return { result: 'failed', detail: '/ : la page répond 500' }; }, retryMs: 5 * 60_000, intervalMs: 60_000, sleep: async (ms) => { clock += ms; }, now: () => clock });
  assert.equal(out.result, 'failed');
  assert.match(out.detail, /la page répond 500 \(toujours après 5 min\)/);
  assert.ok(calls >= 4 && calls <= 6, `${calls} checks`);
  assert.ok(clock <= 5 * 60_000 + 80_000);
});

test('a skipped check is not retried', async () => {
  let calls = 0;
  const out = await smokeUntil({ check: async () => { calls++; return { result: 'skipped', detail: 'protégée' }; }, retryMs: 5 * 60_000, intervalMs: 60_000, sleep: async () => {}, now: () => 0 });
  assert.equal(out.result, 'skipped');
  assert.equal(calls, 1);
});

test('a later attempt installs the tools when the first one stopped before installing them', async () => {
  const { smokeAttempts } = await import('../scripts/smoke.mjs');
  const seen = [];
  const attempt = smokeAttempts({ url: 'u', dir: '.', run: async (opts) => { seen.push(opts.install); opts.onInstalled(); return { result: 'failed', detail: 'x' }; } });
  await attempt(0); await attempt(1);
  assert.deepEqual(seen, [true, false]);
  const again = smokeAttempts({ url: 'u', dir: '.', run: async (opts) => { seen.push(opts.install); return { result: 'failed', detail: "l'adresse ne répond pas" }; } });
  seen.length = 0;
  await again(0); await again(1);
  assert.deepEqual(seen, [true, true]);
});

test('the result is written even when its folder does not exist yet (fresh runner)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const out = join(mkdtempSync(join(tmpdir(), 'smoke-')), 'smoke', 'smoke.json');
  const run = spawnSync(process.execPath, [new URL('../scripts/smoke.mjs', import.meta.url).pathname, '--url', 'http://127.0.0.1:1/', '--out', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).result, 'failed');
});
