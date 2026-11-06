import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smokeRoutes, isProtected, pageProblem, smoke } from '../scripts/smoke.mjs';

test('the screens opened are « / » plus the listed ones', () => {
  assert.deepEqual(smokeRoutes('# écrans\n/connexion\n\n/planning # le planning\nnot-a-path\n/'), ['/', '/connexion', '/planning']);
  assert.deepEqual(smokeRoutes(''), ['/']);
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
