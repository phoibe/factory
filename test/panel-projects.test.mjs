import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortProjects, projectDot, blockedNumbers, othersDot, nextDots, DOT_LABELS, slimRepo, configCheck, readProjectsCache, writeProjectsCache, tokenTag } from '../panel/projects.mjs';

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

test('quand GitHub limite les appels, la vérification des autres projets attend ce qu\'il demande (5 min au plus)', async () => {
  const { dotsDelay } = await import('../panel/projects.mjs');
  assert.equal(dotsDelay(), 30_000);
  assert.equal(dotsDelay(10_000), 30_000);
  assert.equal(dotsDelay(120_000), 120_000);
  assert.equal(dotsDelay(3_600_000), 300_000);
});

// Issue #399: the project list is remembered on this device, and an unchanged repository is not read again.

const repo = (name, pushed = '2026-11-01T10:00:00Z', extra = {}) => ({ id: 1, name, full_name: `o/${name}`, html_url: `https://github.com/o/${name}`, homepage: '', private: true, default_branch: 'main', archived: false, is_template: false, pushed_at: pushed, owner: { login: 'o' }, description: 'long', ...extra });

test('seuls les champs utiles d\'un dépôt sont gardés en mémoire', () => {
  const slim = slimRepo(repo('a'));
  assert.deepEqual(Object.keys(slim).sort(), ['archived', 'default_branch', 'full_name', 'homepage', 'html_url', 'id', 'is_template', 'name', 'private', 'pushed_at']);
});

test('un dépôt sans nouvel envoi depuis la dernière lecture n\'est pas relu', () => {
  const known = new Map([['o/a', { pushed: '2026-11-01T10:00:00Z', etag: '"x"', file: { content: 'e30=', sha: 's' } }]]);
  assert.deepEqual(configCheck(repo('a'), known), { skip: true, etag: '"x"', file: { content: 'e30=', sha: 's' } });
});

test('un dépôt sans fichier de réglages et sans nouvel envoi n\'est pas relu non plus', () => {
  const known = new Map([['o/a', { pushed: '2026-11-01T10:00:00Z', etag: null, file: null }]]);
  assert.equal(configCheck(repo('a'), known).skip, true);
});

test('un dépôt qui a reçu un envoi est relu avec la dernière étiquette (réponse gratuite si rien n\'a changé)', () => {
  const known = new Map([['o/a', { pushed: '2026-11-01T10:00:00Z', etag: '"x"', file: { content: 'e30=', sha: 's' } }]]);
  assert.deepEqual(configCheck(repo('a', '2026-11-02T10:00:00Z'), known), { skip: false, etag: '"x"', file: { content: 'e30=', sha: 's' } });
});

test('un dépôt inconnu, ou sans date d\'envoi, est toujours relu', () => {
  assert.deepEqual(configCheck(repo('b'), new Map()), { skip: false, etag: null, file: null });
  const known = new Map([['o/a', { pushed: undefined, etag: '"x"', file: null }]]);
  assert.equal(configCheck(repo('a', undefined), known).skip, false);
});

test('la mémoire relue rend la liste des projets et ce qui est connu de chaque dépôt', () => {
  const projects = [{ repo: repo('a'), file: { content: 'e30=', sha: 's', path: 'factory.config.json' } }];
  const known = new Map([['o/a', { pushed: '2026-11-01T10:00:00Z', etag: '"x"', file: { content: 'e30=', sha: 's' } }], ['o/b', { pushed: 'p', etag: null, file: null }]]);
  const back = readProjectsCache(writeProjectsCache('tag1', projects, known), 'tag1');
  assert.equal(back.projects.length, 1);
  assert.equal(back.projects[0].repo.full_name, 'o/a');
  assert.equal(back.projects[0].repo.description, undefined);
  assert.deepEqual(back.projects[0].file, { content: 'e30=', sha: 's' });
  assert.deepEqual(back.known.get('o/b'), { pushed: 'p', etag: null, file: null });
});

test('la mémoire d\'un autre compte, abîmée ou absente n\'est jamais utilisée', () => {
  const text = writeProjectsCache('tag1', [{ repo: repo('a'), file: { content: 'e30=', sha: 's' } }], new Map());
  assert.equal(readProjectsCache(text, 'tag2'), null);
  assert.equal(readProjectsCache('{oops', 'tag1'), null);
  assert.equal(readProjectsCache(null, 'tag1'), null);
  assert.equal(readProjectsCache(JSON.stringify({ v: 1, tag: 'tag1' }), 'tag1'), null);
});

test('l\'étiquette du compte distingue deux jetons sans contenir le jeton', async () => {
  const a = await tokenTag('ghp_secret1');
  assert.equal(a, await tokenTag('ghp_secret1'));
  assert.notEqual(a, await tokenTag('ghp_secret2'));
  assert.ok(!a.includes('secret'));
});
