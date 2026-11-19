import { test } from 'node:test';
import assert from 'node:assert/strict';
import { machineLine, repoKey } from '../panel/machine.mjs';

const status = (projects, key = 'ok') => ({ key, projects });
const base = { isPrivate: true, general: 'dev-server', project: 'default', hash: 'h' };

test('a public project always says GitHub', () => {
  assert.match(machineLine({ ...base, isPrivate: false, status: status({}) }).text, /Projet public.*machines GitHub/);
});

test('a project set to GitHub says so, whatever the server', () => {
  assert.match(machineLine({ ...base, project: 'github', status: status({ h: { reason: 'online' } }) }).text, /machines GitHub, comme demandé/);
  assert.match(machineLine({ ...base, general: 'github', status: null }).text, /machines GitHub, comme demandé/);
});

test('never checked yet', () => {
  assert.equal(machineLine({ ...base, status: null }).text, 'Serveur de dev : pas encore vérifié, machines GitHub en attendant.');
});

test('without the key, the panel says the key is missing', () => {
  const l = machineLine({ ...base, status: status({}, 'missing') });
  assert.equal(l.text, "Serveur de dev : clé d'accès manquante. Les tâches tournent sur les machines GitHub.");
  assert.equal(l.tone, 'warn');
  const refused = machineLine({ ...base, status: status({}, 'refused') });
  assert.match(refused.text, /clé d'accès manquante/);
  assert.match(refused.text, /Plus de secours automatique/);
});

test('online, offline with GitHub as backup', () => {
  assert.deepEqual(machineLine({ ...base, status: status({ h: { reason: 'online' } }) }), { text: 'Serveur de dev : en ligne.', tone: 'ok' });
  assert.deepEqual(machineLine({ ...base, status: status({ h: { reason: 'offline' } }) }), { text: 'Serveur de dev : hors ligne, GitHub en secours.', tone: 'warn' });
});

test('a switch that failed says it is retried', () => {
  assert.match(machineLine({ ...base, status: status({ h: { reason: 'online', error: true } }) }).text, /pas pu se faire.*prochain contrôle/);
});

test('a setting changed since the last check is applied at the next one', () => {
  assert.match(machineLine({ ...base, status: status({ h: { reason: 'setting' } }) }).text, /15 minutes au plus/);
  assert.match(machineLine({ ...base, status: status({}) }).text, /15 minutes au plus/);
});

test('the hash is the one the factory writes', async () => {
  const { repoKey: fromScripts } = await import('../scripts/lib/runners.mjs');
  assert.equal(await repoKey(123), await fromScripts('123'));
});

test('no key while the project was left on the server: the backup is off', () => {
  assert.match(machineLine({ ...base, status: status({ h: { machine: 'dev-server', reason: 'online', stale: true } }, 'missing') }).text, /Plus de secours automatique/);
});

// ---- Issue #504: a private project the dev server's key does not see ----------------------------------------------
import { forgottenProjects, runnerAlertText, RUNNER_KEYS_URL } from '../panel/machine.mjs';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const checked = (projects, extra = {}) => ({ key: 'ok', checkedAt: '2026-11-19T11:50:00Z', projects, ...extra });
const p = (name, extra = {}) => ({ name, hash: `h-${name}`, isPrivate: true, created: '2026-11-01T00:00:00Z', project: 'default', ...extra });

test('a private project on the dev server, missing from a check made after its creation, is forgotten', () => {
  assert.deepEqual(forgottenProjects({ status: checked({ 'h-seen': { reason: 'online' } }), general: 'dev-server', projects: [p('seen'), p('pulsar')], now: NOW }), ['pulsar']);
});

test('public projects and projects set to GitHub are never forgotten', () => {
  const projects = [p('pub', { isPrivate: false }), p('gh', { project: 'github' }), p('all-gh')];
  assert.deepEqual(forgottenProjects({ status: checked({}), general: 'dev-server', projects: projects.slice(0, 2), now: NOW }), []);
  assert.deepEqual(forgottenProjects({ status: checked({}), general: 'github', projects: [projects[2]], now: NOW }), []);
  assert.deepEqual(forgottenProjects({ status: checked({}), general: 'github', projects: [p('own', { project: 'dev-server' })], now: NOW }), ['own']);
});

test('a project created after the last check is not forgotten yet', () => {
  assert.deepEqual(forgottenProjects({ status: checked({}), general: 'dev-server', projects: [p('new', { created: '2026-11-19T11:55:00Z' })], now: NOW }), []);
  assert.deepEqual(forgottenProjects({ status: checked({}), general: 'dev-server', projects: [p('unknown', { created: null })], now: NOW }), []);
});

test('no recent check, no check at all, or a key problem: the usual alerts speak instead', () => {
  const projects = [p('pulsar')];
  assert.deepEqual(forgottenProjects({ status: checked({}, { checkedAt: '2026-11-19T08:00:00Z' }), general: 'dev-server', projects, now: NOW }), []);
  assert.deepEqual(forgottenProjects({ status: { key: 'ok', projects: {} }, general: 'dev-server', projects, now: NOW }), []);
  assert.deepEqual(forgottenProjects({ status: null, general: 'dev-server', projects, now: NOW }), []);
  assert.deepEqual(forgottenProjects({ status: checked({}, { key: 'refused' }), general: 'dev-server', projects, now: NOW }), []);
});

test('the banner names every forgotten project', () => {
  assert.equal(runnerAlertText(['pulsar']), "pulsar n'est pas vu par le serveur de dev : ses tâches consomment vos minutes GitHub.");
  assert.equal(runnerAlertText(['a', 'b', 'c']), "a, b et c ne sont pas vus par le serveur de dev : leurs tâches consomment vos minutes GitHub.");
  assert.equal(RUNNER_KEYS_URL, 'https://github.com/settings/personal-access-tokens');
});

test('the settings line warns instead of « pris en compte au prochain contrôle » once a later check missed the project', () => {
  const line = machineLine({ ...base, status: checked({}), created: '2026-11-01T00:00:00Z', now: NOW });
  assert.equal(line.tone, 'warn');
  assert.equal(line.keys, true);
  assert.equal(line.text, "Ce projet n'est pas vu par le serveur de dev : ses tâches consomment vos minutes GitHub.");
  const fresh = machineLine({ ...base, status: checked({}), created: '2026-11-19T11:55:00Z', now: NOW });
  assert.match(fresh.text, /pris en compte au prochain contrôle/);
});

test('an unknown machine value follows the general setting, like the dev server check (review of #504)', () => {
  assert.deepEqual(forgottenProjects({ status: checked({}), general: 'github', projects: [p('typo', { project: 'Github' })], now: NOW }), []);
  assert.match(machineLine({ ...base, project: 'Github', general: 'github', status: checked({}), created: '2026-11-01T00:00:00Z', now: NOW }).text, /comme demandé/);
});
