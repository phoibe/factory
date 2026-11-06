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
  assert.equal(machineLine({ ...base, status: null }).text, 'Serveur de dev : pas encore vérifié. Les tâches tournent sur les machines GitHub en attendant.');
});

test('without the key, the panel says the key is missing', () => {
  const l = machineLine({ ...base, status: status({}, 'missing') });
  assert.equal(l.text, "Serveur de dev : clé d'accès manquante. Les tâches tournent sur les machines GitHub.");
  assert.equal(l.tone, 'warn');
  assert.match(machineLine({ ...base, status: status({}, 'refused') }).text, /clé d'accès manquante/);
});

test('online, offline with GitHub as backup', () => {
  assert.deepEqual(machineLine({ ...base, status: status({ h: { reason: 'online' } }) }), { text: 'Serveur de dev : en ligne.', tone: 'ok' });
  assert.deepEqual(machineLine({ ...base, status: status({ h: { reason: 'offline' } }) }), { text: 'Serveur de dev : hors ligne, GitHub en secours.', tone: 'warn' });
});

test('a setting changed since the last check is applied at the next one', () => {
  assert.match(machineLine({ ...base, status: status({ h: { reason: 'setting' } }) }).text, /15 minutes au plus/);
  assert.match(machineLine({ ...base, status: status({}) }).text, /15 minutes au plus/);
});

test('the hash is the one the factory writes', async () => {
  const { repoKey: fromScripts } = await import('../scripts/lib/runners.mjs');
  assert.equal(await repoKey('Pierre/App'), await fromScripts('pierre/app'));
});
