import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortProjects, projectDot, blockedNumbers, othersDot, nextDots, DOT_LABELS } from '../panel/projects.mjs';

const issue = (number, labels, extra = {}) => ({ number, labels, ...extra });
const p = (name) => ({ repo: { name, full_name: `o/${name}` } });

test('les projets sont rangés par ordre alphabétique, sans tenir compte des majuscules ni des accents', () => {
  assert.deepEqual(sortProjects([p('zeta'), p('été'), p('Alpha'), p('beta')]).map((x) => x.repo.name), ['Alpha', 'beta', 'été', 'zeta']);
});

test('sortProjects ne modifie pas la liste reçue', () => {
  const list = [p('b'), p('a')];
  sortProjects(list);
  assert.equal(list[0].repo.name, 'b');
});

test('aucune demande : pas de point', () => {
  assert.equal(projectDot([]), null);
});

test('une demande bloquée qui attend le propriétaire donne un point rouge, même avec une spec à valider', () => {
  assert.equal(projectDot([issue(1, ['factory:feature', 'factory:spec-review']), issue(2, ['factory:feature', 'factory:blocked'])]), 'blocked');
});

test('une spec ou des captures à valider donnent un point bleu', () => {
  assert.equal(projectDot([issue(1, ['factory:feature', 'factory:spec-review']), issue(3, ['factory:feature', 'factory:building', 'factory:running'])]), 'yours');
  assert.equal(projectDot([issue(4, ['factory:visual-review'], { pull_request: {} })]), 'yours');
});

test('un agent qui travaille ou une file d\'attente donnent un point gris', () => {
  assert.equal(projectDot([issue(3, ['factory:feature', 'factory:building', 'factory:running'])]), 'working');
  assert.equal(projectDot([issue(5, ['factory:feature', 'factory:queued'])]), 'working');
  assert.equal(projectDot([issue(6, ['factory:checks'], { pull_request: {} })]), 'working');
});

test('une demande bloquée sur laquelle un agent travaille compte en gris', () => {
  assert.equal(projectDot([issue(2, ['factory:feature', 'factory:blocked', 'factory:running'])]), 'working');
});

test('une demande qui attend seulement la fusion d\'une autre (« Attend #… ») compte en gris', () => {
  assert.equal(projectDot([issue(2, ['factory:feature', 'factory:blocked'])], new Map([[2, [12]]])), 'working');
});

test('les idées à trier ne donnent aucun point', () => {
  assert.equal(projectDot([issue(7, ['factory:feature'])]), null);
});

test('blockedNumbers liste les demandes bloquées sans agent au travail', () => {
  assert.deepEqual(blockedNumbers([issue(1, ['factory:blocked']), issue(2, ['factory:blocked', 'factory:running']), issue(3, ['factory:spec-review'])]), [1]);
});

test('le point sur le nom du projet ne tient compte que des autres projets, rouge avant bleu, jamais gris', () => {
  const dots = new Map([['o/a', 'blocked'], ['o/b', 'yours'], ['o/c', 'working']]);
  assert.equal(othersDot(dots, 'o/a'), 'yours');
  assert.equal(othersDot(dots, 'o/b'), 'blocked');
  assert.equal(othersDot(new Map([['o/a', 'blocked'], ['o/c', 'working']]), 'o/a'), null);
});

test('un projet pour lequel GitHub n\'a pas répondu garde son dernier point connu', () => {
  const prev = new Map([['o/a', 'blocked'], ['o/b', 'yours']]);
  const next = nextDots(prev, new Map([['o/a', undefined], ['o/b', null], ['o/c', 'working']]));
  assert.deepEqual([...next], [['o/a', 'blocked'], ['o/b', null], ['o/c', 'working']]);
});

test('chaque point a sa légende', () => {
  assert.deepEqual(DOT_LABELS, { blocked: 'Bloqué', yours: 'À vous de jouer', working: 'En cours' });
});
