import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, onlineRunners, decideMachine, runsOnValue, stuckJobs, alertsFor, repoKey, DEFAULT_LABELS } from '../scripts/lib/runners.mjs';

const runner = (status, labels) => ({ status, labels: labels.map((name) => ({ name })) });

test('settings default to the dev server with the self-hosted label', () => {
  assert.deepEqual(readSettings(null), { machine: 'dev-server', labels: DEFAULT_LABELS });
  assert.deepEqual(readSettings({ machine: 'github', labels: ['self-hosted', 'factory'] }), { machine: 'github', labels: ['self-hosted', 'factory'] });
  assert.deepEqual(readSettings({ machine: 'moon', labels: [] }), { machine: 'dev-server', labels: DEFAULT_LABELS });
});

test('only online runners carrying every label count, labels compared without case', () => {
  const runners = [runner('online', ['Self-Hosted', 'Linux']), runner('offline', ['self-hosted']), runner('online', ['linux'])];
  assert.equal(onlineRunners(runners, ['self-hosted']), 1);
  assert.equal(onlineRunners(runners, ['self-hosted', 'factory']), 0);
  assert.equal(onlineRunners([], ['self-hosted']), 0);
});

test('a public project always runs on GitHub', () => {
  assert.deepEqual(decideMachine({ isPrivate: false, project: 'dev-server', general: 'dev-server', key: 'ok', online: 2 }), { machine: 'github', reason: 'public' });
});

test('the project setting wins over the general one', () => {
  assert.deepEqual(decideMachine({ isPrivate: true, project: 'github', general: 'dev-server', key: 'ok', online: 2 }), { machine: 'github', reason: 'setting' });
  assert.deepEqual(decideMachine({ isPrivate: true, project: 'default', general: 'github', key: 'ok', online: 2 }), { machine: 'github', reason: 'setting' });
  assert.equal(decideMachine({ isPrivate: true, project: 'dev-server', general: 'github', key: 'ok', online: 1 }).machine, 'dev-server');
});

test('without the key, or with the server offline, a private project runs on GitHub', () => {
  assert.deepEqual(decideMachine({ isPrivate: true, project: 'default', general: 'dev-server', key: 'missing', online: 2 }), { machine: 'github', reason: 'no-key' });
  assert.deepEqual(decideMachine({ isPrivate: true, project: 'default', general: 'dev-server', key: 'ok', online: 0 }), { machine: 'github', reason: 'offline' });
  assert.deepEqual(decideMachine({ isPrivate: true, project: 'default', general: 'dev-server', key: 'ok', online: 1 }), { machine: 'dev-server', reason: 'online' });
});

test('the runs-on value is the labels as JSON', () => {
  assert.equal(runsOnValue(['self-hosted', 'linux']), '["self-hosted","linux"]');
});

test('stuck jobs are the unfinished ones waiting for a self-hosted runner', () => {
  const jobs = [
    { id: 1, status: 'queued', labels: ['self-hosted'] },
    { id: 2, status: 'in_progress', labels: ['Self-Hosted', 'linux'] },
    { id: 3, status: 'queued', labels: ['ubuntu-24.04'] },
    { id: 4, status: 'completed', labels: ['self-hosted'] },
    { id: 5, status: 'waiting', labels: ['self-hosted'] },
  ];
  assert.deepEqual(stuckJobs(jobs).map((j) => j.id), [1, 2, 5]);
  assert.deepEqual(stuckJobs([{ id: 6, status: 'queued', labels: ['Factory', 'linux'] }, { id: 7, status: 'queued', labels: ['linux'] }], ['factory', 'linux']).map((j) => j.id), [6]);
});

test('alerts only on a switch between online and offline, never at the first check', () => {
  const p = (reason) => ({ name: 'mon-projet', reason });
  assert.deepEqual(alertsFor(null, { key: 'ok', projects: { a: p('offline') } }), []);
  assert.deepEqual(alertsFor({ key: 'ok', projects: { a: p('online') } }, { key: 'ok', projects: { a: p('online') } }), []);
  const down = alertsFor({ key: 'ok', projects: { a: p('online') } }, { key: 'ok', projects: { a: p('offline') } });
  assert.equal(down.length, 1);
  assert.match(down[0], /mon-projet/);
  assert.match(down[0], /hors ligne/);
  assert.match(down[0], /GitHub/);
  const up = alertsFor({ key: 'ok', projects: { a: p('offline') } }, { key: 'ok', projects: { a: p('online') } });
  assert.match(up[0], /de nouveau en ligne/);
  // A project switched by its setting is not an outage.
  assert.deepEqual(alertsFor({ key: 'ok', projects: { a: p('online') } }, { key: 'ok', projects: { a: p('setting') } }), []);
});

test('a key that stops working is announced once', () => {
  const lost = alertsFor({ key: 'ok', projects: {} }, { key: 'refused', projects: {} });
  assert.equal(lost.length, 1);
  assert.match(lost[0], /clé d'accès/);
  assert.deepEqual(alertsFor({ key: 'refused', projects: {} }, { key: 'refused', projects: {} }), []);
  assert.deepEqual(alertsFor(null, { key: 'missing', projects: {} }), []);
});

test('a key about to expire is announced once', () => {
  const now = Date.parse('2026-11-06T00:00:00Z');
  const soon = alertsFor({ key: 'ok', projects: {} }, { key: 'ok', keyExpires: '2026-11-10T00:00:00Z', projects: {} }, now);
  assert.equal(soon.length, 1);
  assert.match(soon[0], /expire/);
  assert.deepEqual(alertsFor({ key: 'ok', keyExpires: '2026-11-10T00:00:00Z', expiryAlerted: true, projects: {} }, { key: 'ok', keyExpires: '2026-11-10T00:00:00Z', projects: {} }, now), []);
  assert.deepEqual(alertsFor({ key: 'ok', projects: {} }, { key: 'ok', keyExpires: '2027-11-10T00:00:00Z', projects: {} }, now), []);
});

test('a project is known by a hash, never by its name', async () => {
  const k = await repoKey('pierre/secret');
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.equal(k, await repoKey('pierre/secret'));
  assert.notEqual(k, await repoKey('pierre/other'));
});
