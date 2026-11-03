import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planChecks, summary } from '../scripts/checks.mjs';

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
