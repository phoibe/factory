// Issue #572: what keeps the « Recharger » button of the new-version banner from reloading, and what it says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reloadBlocker } from '../panel/lib.mjs';

const none = { settings: false, message: false, answering: false, unsent: false };

test('nothing in progress: the page may reload', () => {
  assert.equal(reloadBlocker(none), null);
});

test('unsaved settings ask to save first', () => {
  assert.equal(reloadBlocker({ ...none, settings: true }), 'Enregistrez d\'abord vos réglages, puis rechargez.');
});

test('a message being written ask to send or clear it first', () => {
  assert.equal(reloadBlocker({ ...none, message: true }), 'Envoyez ou effacez d\'abord votre message, puis rechargez.');
});

test('an answer still arriving asks to wait for its end', () => {
  assert.equal(reloadBlocker({ ...none, answering: true }), 'Attendez la fin de la réponse de l\'agent, puis rechargez.');
});

test('messages left unsent ask to resend or edit them first (issue #580)', () => {
  assert.equal(reloadBlocker({ ...none, unsent: true }), 'Renvoyez ou modifiez d\'abord vos messages non envoyés, puis rechargez.');
});

test('unsent messages come last: an answer on its way must end before « Renvoyer » works', () => {
  assert.match(reloadBlocker({ ...none, answering: true, unsent: true }), /^Attendez/);
  assert.match(reloadBlocker({ ...none, message: true, unsent: true }), /^Envoyez/);
});

test('settings come first, then the message, then the answer', () => {
  assert.match(reloadBlocker({ settings: true, message: true, answering: true }), /^Enregistrez/);
  assert.match(reloadBlocker({ settings: false, message: true, answering: true }), /^Envoyez/);
});
