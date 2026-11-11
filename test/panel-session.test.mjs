import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../panel/app.mjs', import.meta.url), 'utf8');
const fn = (name) => app.match(new RegExp(`(?:async )?function ${name}\\(\\)[^]*?\\n\\}\\n`))?.[0] || '';

test('la remise à zéro de la session est écrite une seule fois et vide les caches et le suivi en direct', () => {
  const reset = fn('resetSession');
  assert.ok(reset, 'resetSession doit exister');
  for (const part of ['etags.clear()', 'boards.clear()', 'clearTimeout(live.timer)', 'clearInterval(live.tick)', 'TOKEN_KEY']) assert.ok(reset.includes(part), part);
  assert.equal(app.split('boards.clear()').length - 1, 1, 'plus aucune copie de la remise à zéro');
});

test('jeton expiré, déconnexion et refus au démarrage passent tous par resetSession', () => {
  assert.match(fn('sessionExpired'), /resetSession\(\)/);
  assert.match(app, /\$\('logout'\)\.addEventListener\('click', \(\) => \{\s*resetSession\(\)/);
  assert.match(fn('start'), /err\.status !== 401[^]*resetSession\(\)/);
});
