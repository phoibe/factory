// Messages that could not be sent stay in their conversation (issue #580): the pure rules behind them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IMAGES, UNSENT_TITLE, TOKEN_REFUSED, UNSENT_AWAY, unsentKey, failureKind, unsentBox, mergeDraft, toastBottom,
} from '../panel/chat.mjs';

const pic = () => ({ file: {}, url: 'blob:n' });
const [f1, f2, f3, f4, f5] = [pic(), pic(), pic(), pic(), pic()];
const texts = (list) => list.map((m) => m.text);

test('a conversation not created yet is « new »', () => {
  assert.equal(unsentKey(null), 'new');
  assert.equal(unsentKey(undefined), 'new');
  assert.equal(unsentKey('new'), 'new');
  assert.equal(unsentKey(7), 7);
  assert.equal(unsentKey('c1'), 'c1');
});

test('the mention depends on how far the message went', () => {
  assert.equal(failureKind({ reached: false }), 'unsent');
  assert.equal(failureKind({ reached: true }), 'unanswered');
  assert.equal(failureKind({ reached: true, readToken: true }), 'unsent');
  assert.deepEqual(UNSENT_TITLE, { unsent: 'Non envoyé', unanswered: "L'agent n'a pas pu répondre" });
  assert.equal(TOKEN_REFUSED, 'Le jeton de lecture a été refusé.');
  assert.equal(UNSENT_AWAY, 'Message non envoyé. Retrouvez-le dans sa conversation.');
});

test('each conversation keeps its unsent messages in the order written', () => {
  const box = unsentBox();
  const failure = { kind: 'unsent', reason: 'Connexion perdue, réessayez.' };
  box.add(7, { text: 'A' }, failure);
  const b = box.add(7, { text: 'B', files: [f1] }, failure);
  box.add('new', { text: 'C' }, failure);
  assert.deepEqual(texts(box.shown(7)), ['A', 'B']);
  assert.deepEqual(box.shown(8), []);
  assert.equal(box.size, 3);
  assert.equal(box.get(7, b).files[0], f1);
  assert.equal(box.get(7, 999), null);
  const [first] = box.shown(7);
  assert.equal(first.kind, 'unsent');
  assert.equal(first.reason, 'Connexion perdue, réessayez.');
  assert.equal('withImages' in first, false); // a resend always takes the message's own images
  assert.deepEqual(first.files, []);
});

test('a message being resent is hidden, then comes back at its place with the new reason', () => {
  const box = unsentBox();
  const failure = { kind: 'unsent', reason: 'Connexion perdue, réessayez.' };
  const a = box.add(7, { text: 'A' }, failure);
  box.add(7, { text: 'B' }, failure);
  assert.equal(box.retry(7, a).text, 'A');
  assert.deepEqual(texts(box.shown(7)), ['B']);
  assert.equal(box.size, 2);
  box.fail(7, a, { kind: 'unanswered', reason: 'Panne.' });
  assert.deepEqual(box.shown(7).map((m) => [m.text, m.kind, m.reason]), [['A', 'unanswered', 'Panne.'], ['B', 'unsent', 'Connexion perdue, réessayez.']]);
  assert.equal(box.retry(7, 999), null);
});

test('a message taken back is forgotten, and a new conversation\'s messages follow it', () => {
  const box = unsentBox();
  const failure = { kind: 'unsent', reason: 'x' };
  const a = box.add(7, { text: 'A' }, failure);
  box.add('new', { text: 'C' }, failure);
  assert.equal(box.remove(7, a).text, 'A');
  assert.equal(box.remove(7, a), null);
  box.add('c1', { text: 'D' }, failure);
  box.rekey('new', 'c1');
  assert.deepEqual(box.shown('new'), []);
  assert.deepEqual(texts(box.shown('c1')), ['D', 'C']);
  const other = unsentBox();
  other.add('new', { text: 'C' }, failure);
  other.rekey('new', 'c1');
  assert.deepEqual(texts(other.shown('c1')), ['C']);
});

test('taking a message back never erases the draft', () => {
  assert.equal(MAX_IMAGES, 4);
  assert.deepEqual(mergeDraft({ text: '', files: [] }, { text: 'Bonjour', files: [f1] }), { text: 'Bonjour', files: [f1], dropped: 0 });
  assert.deepEqual(mergeDraft({ text: 'Déjà écrit  \n', files: [f1, f2, f3] }, { text: 'Repris', files: [f4, f5] }),
    { text: 'Déjà écrit\nRepris', files: [f1, f2, f3, f4], dropped: 1 });
  assert.equal(mergeDraft({ text: 'Déjà écrit', files: [] }, { text: '', files: [f1] }).text, 'Déjà écrit');
  assert.equal(mergeDraft({ text: '   ', files: [] }, { text: 'Repris', files: [] }).text, 'Repris');
});

test('the toast sits 12 px above the composer, never lower than 24 px', () => {
  assert.equal(toastBottom(844, 780), 76);
  assert.equal(toastBottom(800, 559), 253);
  assert.equal(toastBottom(800, 715.4), 97);
  assert.equal(toastBottom(800, 790), 24);
});
