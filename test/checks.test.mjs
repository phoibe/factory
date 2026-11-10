import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planChecks, summary, isFactoryRepo, browserSetup } from '../scripts/checks.mjs';

const all = { typecheck: true, lint: true, test: true, build: true, a11y: true, audit: true };

test('enabled checks map to npm scripts, audit is built in', () => {
  const plan = planChecks(all, { scripts: { typecheck: 'tsc', lint: 'eslint .', test: 'vitest', build: 'next build', 'test:a11y': 'pw' } });
  assert.deepEqual(plan.map((p) => p.run.join(' ')), ['npm run typecheck', 'npm run lint', 'npm run test', 'npm run build', 'npm run test:a11y', 'npm audit --omit=dev --audit-level=high']);
});

test('a missing script is reported, a disabled check is skipped', () => {
  const plan = planChecks({ ...all, lint: false }, { scripts: { typecheck: 'tsc' } });
  assert.equal(plan.find((p) => p.id === 'lint'), undefined);
  assert.equal(plan.find((p) => p.id === 'test').missing, true);
});

test('summary is in French', () => {
  assert.match(summary([{ label: 'Tests', status: 'missing', script: 'test' }]), /script npm « test » absent/);
});

test('the factory repository is recognised as having no app but its own tests', () => {
  assert.equal(isFactoryRepo(new URL('..', import.meta.url).pathname), true);
  assert.equal(isFactoryRepo('/nonexistent-dir'), false);
});

test('the browser is downloaded alone; system packages only when it cannot start (they cost minutes)', () => {
  const plan = browserSetup({ devDependencies: { playwright: '1.56.1' } });
  assert.deepEqual(plan.install, ['npx', 'playwright', 'install', 'chromium']);
  assert.deepEqual(plan.deps, ['npx', 'playwright', 'install-deps', 'chromium']);
  assert.equal(plan.install.includes('--with-deps'), false);
  assert.match(plan.probe.join(' '), /import\('playwright'\)/);
  assert.match(browserSetup({ devDependencies: { '@playwright/test': '1.56.1' } }).probe.join(' '), /@playwright\/test/);
  assert.equal(browserSetup({ dependencies: { react: '19' } }), null);
});

test('user journeys (test:e2e) run when present; a project without them yet is not turned red', () => {
  const pkg = { scripts: { typecheck: 'tsc', lint: 'l', test: 't', build: 'b', 'test:a11y': 'a' } };
  const missing = planChecks({ ...all, e2e: true }, pkg).find((p) => p.id === 'e2e');
  assert.equal(missing.skipped, true);
  assert.match(summary([{ label: 'Parcours', status: 'skipped', script: 'test:e2e' }]), /pas encore de tests/);
  const present = planChecks({ ...all, e2e: true }, { scripts: { ...pkg.scripts, 'test:e2e': 'playwright test' } }).find((p) => p.id === 'e2e');
  assert.deepEqual(present.run, ['npm', 'run', 'test:e2e']);
});

test('a download that fails on the network is an outage, a test that mentions the network is not', async () => {
  const { isOutage } = await import('../scripts/checks.mjs');
  assert.equal(isOutage('install', 1, 'npm error code ECONNRESET'), true);
  assert.equal(isOutage('browser', 1, 'Error: Download failed: server returned code 503'), true);
  assert.equal(isOutage('audit', 1, 'npm error code E503 Service Unavailable'), true);
  assert.equal(isOutage('install', 1, 'npm error code ERESOLVE'), false);
  assert.equal(isOutage('install', 0, 'npm warn ECONNRESET, retrying'), false);
  assert.equal(isOutage('test', 1, 'connect ECONNREFUSED 127.0.0.1:3000'), false);
});

test('extra checks: only the enabled ones, run by bash at the root of the project', async () => {
  const { planExtraChecks } = await import('../scripts/checks.mjs');
  assert.deepEqual(planExtraChecks({}), []);
  const plan = planExtraChecks({ extraChecks: [{ label: 'A', command: './a.sh --x', enabled: true }, { label: 'B', command: 'b', enabled: false }] });
  assert.deepEqual(plan, [{ id: 'extra', label: 'A', run: ['bash', '-c', './a.sh --x'] }]);
});

test('extra checks run after the usual ones: a red one turns the checks red, a switched off one never runs', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const script = new URL('../scripts/checks.mjs', import.meta.url).pathname;
  const runWith = (extraChecks) => {
    const dir = mkdtempSync(join(tmpdir(), 'extra-checks-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', private: true, scripts: { lint: 'touch lint-ran' } }));
    const off = { typecheck: false, lint: true, test: false, build: false, a11y: false, e2e: false, audit: false };
    writeFileSync(join(dir, 'rules.json'), JSON.stringify({ checks: off, extraChecks }));
    const out = join(dir, 'summary.md');
    const r = spawnSync(process.execPath, [script, dir, '--config', join(dir, 'rules.json')], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: out, GITHUB_OUTPUT: '' } });
    return { status: r.status, summary: readFileSync(out, 'utf8'), dir, existsSync };
  };
  const green = runWith([{ label: 'Suite du projet', command: 'test -f lint-ran && touch extra-ran' }, { label: 'Coupé', command: 'touch off-ran', enabled: false }]);
  assert.equal(green.status, 0, green.summary);
  assert.equal(green.existsSync(join(green.dir, 'extra-ran')), true);
  assert.equal(green.existsSync(join(green.dir, 'off-ran')), false);
  assert.match(green.summary, /\| Suite du projet \| ✅/);
  assert.doesNotMatch(green.summary, /Coupé/);
  const red = runWith([{ label: 'Scan', command: 'exit 3' }]);
  assert.equal(red.status, 1);
  assert.match(red.summary, /\| Scan \| ❌/);
});

test('a check that can only run on the project machine (exit 75) waits for it, unless something else is red', async () => {
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { verdict } = await import('../scripts/checks.mjs');
  assert.equal(verdict([{ status: 'pass' }, { status: 'elsewhere' }]), 'server');
  assert.equal(verdict([{ status: 'fail' }, { status: 'elsewhere' }]), 'fail');
  assert.equal(verdict([{ status: 'pass' }, { status: 'skipped' }]), 'pass');
  const script = new URL('../scripts/checks.mjs', import.meta.url).pathname;
  const runWith = (lint, extra) => {
    const dir = mkdtempSync(join(tmpdir(), 'elsewhere-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', private: true, scripts: { lint } }));
    const off = { typecheck: false, lint: true, test: false, build: false, a11y: false, e2e: false, audit: false };
    writeFileSync(join(dir, 'rules.json'), JSON.stringify({ checks: off, extraChecks: [{ label: 'Images', command: extra }] }));
    const out = join(dir, 'out.txt');
    writeFileSync(out, '');
    const r = spawnSync(process.execPath, [script, dir, '--config', join(dir, 'rules.json')], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: join(dir, 's.md'), GITHUB_OUTPUT: out } });
    return { status: r.status, output: readFileSync(out, 'utf8'), summary: readFileSync(join(dir, 's.md'), 'utf8') };
  };
  const away = runWith('exit 75', 'exit 75');
  assert.equal(away.status, 1);
  assert.match(away.output, /transient=server/);
  assert.match(away.summary, /serveur du projet déconnecté/);
  const red = runWith('exit 1', 'exit 75');
  assert.equal(red.status, 1);
  assert.doesNotMatch(red.output, /transient/);
});
