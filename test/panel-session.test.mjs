import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, fn, resets } from './panel-source.mjs';

test('la remise à zéro de la session est écrite une seule fois et vide les caches et le suivi en direct', () => {
  const reset = fn('resetSession');
  assert.ok(reset, 'resetSession doit exister');
  assert.equal(all.split('function resetSession(').length - 1, 1, 'une seule remise à zéro');
  assert.match(reset, /for \(const reset of resets\) reset\(\);/, 'elle lance ce que chaque écran a déclaré');
  const path = reset + resets.join('\n');
  for (const part of ['etags.clear()', 'boards.clear()', 'clearTimeout(live.timer)', 'clearInterval(live.tick)', 'store.del(TOKEN_KEY)', 'store.del(READ_TOKEN_KEY)']) assert.ok(path.includes(part), part);
  assert.equal(all.split('boards.clear()').length - 1, 1, 'plus aucune copie de la remise à zéro');
});

test('jeton expiré, déconnexion et refus au démarrage passent tous par resetSession', () => {
  assert.match(fn('sessionExpired'), /resetSession\(\)/);
  assert.match(all, /\$\('logout'\)\.addEventListener\('click', \(\) => \{\s*resetSession\(\{ forget: true \}\)/);
  assert.match(fn('start'), /err\.status !== 401[^]*resetSession\(\)/);
});

test('chaque lecture de GitHub renvoie à la connexion quand le jeton est refusé', () => {
  for (const name of ['api', 'cachedGet', 'chatGet', 'loadProjects']) assert.match(fn(name), /res\.status === 401\) sessionExpired\(\)/, name);
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
  const always = reset.replace(/if \(forget\)[^\n]*\n/, '') + resets.join('\n');
  assert.doesNotMatch(always, /PROJECT_KEY\)|SEEN_KEY|pendingKey|sessionKeys/, 'outside a logout, the stored project names stay');
});

test('un projet devenu introuvable ne bloque pas le compteur des lancements du jour', () => {
  assert.match(fn('refreshRuns'), /e\.status === 404\) return \{ data: \[\] \}/);
});
