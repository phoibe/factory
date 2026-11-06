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
