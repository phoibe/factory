import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../panel/app.mjs', import.meta.url), 'utf8');
const fn = (name) => app.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\)[^]*?\\n\\}\\n`))?.[0] || '';

test('la remise à zéro de la session est écrite une seule fois et vide les caches et le suivi en direct', () => {
  const reset = fn('resetSession');
  assert.ok(reset, 'resetSession doit exister');
  for (const part of ['etags.clear()', 'boards.clear()', 'clearTimeout(live.timer)', 'clearInterval(live.tick)', 'TOKEN_KEY', 'READ_TOKEN_KEY']) assert.ok(reset.includes(part), part);
  assert.equal(app.split('boards.clear()').length - 1, 1, 'plus aucune copie de la remise à zéro');
});

test('jeton expiré, déconnexion et refus au démarrage passent tous par resetSession', () => {
  assert.match(fn('sessionExpired'), /resetSession\(\)/);
  assert.match(app, /\$\('logout'\)\.addEventListener\('click', \(\) => \{\s*resetSession\(\{ forget: true \}\)/);
  assert.match(fn('start'), /err\.status !== 401[^]*resetSession\(\)/);
});

test('le compteur des lancements du jour relit les événements avec leur ETag (un « 304 » ne coûte rien)', () => {
  const runs = fn('refreshRuns');
  assert.match(runs, /cachedGet\(`\/repos\/\$\{p\.repo\.full_name\}\/issues\/events/);
  assert.doesNotMatch(runs, /await api\(/);
});

test('se déconnecter efface aussi les noms de projets gardés ; un jeton expiré garde le projet ouvert et les réponses déjà lues', () => {
  const reset = fn('resetSession');
  assert.match(reset, /if \(forget\) for \(const k of sessionKeys\(store\.keys\(\)\)\) store\.del\(k\)/);
  assert.match(fn('sessionExpired'), /resetSession\(\);/);
});
