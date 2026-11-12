// Issue #342: the « Avancé » block of the settings, folded with a one-line summary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { advancedSummary, effectiveMachine, ADVANCED_KEY } from '../panel/settings.mjs';

test('the folded line names the machine, the checks on and the savoir-faire on', () => {
  assert.equal(advancedSummary({ machine: 'dev-server', checksOn: 7, checksTotal: 7, packsOn: 3 }),
    'Serveur de dev · 7 contrôles sur 7 · 3 savoir-faire activés');
});

test('singular and none', () => {
  assert.equal(advancedSummary({ machine: 'github', checksOn: 1, checksTotal: 7, packsOn: 1 }),
    'Machines GitHub · 1 contrôle sur 7 · 1 savoir-faire activé');
  assert.equal(advancedSummary({ machine: 'github', checksOn: 0, checksTotal: 7, packsOn: 0 }),
    'Machines GitHub · 0 contrôle sur 7 · aucun savoir-faire activé');
});

test('the machine actually used: public projects always on GitHub, « default » follows the general setting', () => {
  assert.equal(effectiveMachine({ isPrivate: false, project: 'dev-server', general: 'dev-server' }), 'github');
  assert.equal(effectiveMachine({ isPrivate: true, project: 'default', general: 'dev-server' }), 'dev-server');
  assert.equal(effectiveMachine({ isPrivate: true, project: undefined, general: 'github' }), 'github');
  assert.equal(effectiveMachine({ isPrivate: true, project: 'github', general: 'dev-server' }), 'github');
});

test('the open state is remembered under one key', () => {
  assert.equal(ADVANCED_KEY, 'factory.advanced');
});
