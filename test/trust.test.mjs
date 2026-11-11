import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustedAuthor, trustNotes } from '../scripts/lib/trust.mjs';
import { waitedFor } from '../scripts/lib/waits.mjs';

const note = '<!-- factory-agent -->\nJe dois attendre.\n<!-- factory-waits-for #12 -->';
const by = (login, extra = {}) => ({ body: note, user: { login }, ...extra });

test('the owner and the factory own bots are trusted', () => {
  assert.equal(trustedAuthor(by('phoibe'), 'phoibe'), true);
  assert.equal(trustedAuthor(by('Phoibe'), 'phoibe'), true);
  assert.equal(trustedAuthor(by('github-actions[bot]'), 'phoibe'), true);
  assert.equal(trustedAuthor(by('claude[bot]'), 'phoibe'), true);
  // People the owner gave write access to (an organisation's members, collaborators).
  assert.equal(trustedAuthor(by('alice', { author_association: 'MEMBER' }), 'acme'), true);
  assert.equal(trustedAuthor(by('bob', { author_association: 'COLLABORATOR' }), 'acme'), true);
});

test('anyone else is not trusted, nor is a comment without author', () => {
  assert.equal(trustedAuthor(by('stranger', { author_association: 'NONE' }), 'phoibe'), false);
  assert.equal(trustedAuthor(by('stranger', { author_association: 'CONTRIBUTOR' }), 'phoibe'), false);
  assert.equal(trustedAuthor(by('vercel[bot]'), 'phoibe'), false);
  assert.equal(trustedAuthor({ body: note }, 'phoibe'), false);
  assert.equal(trustedAuthor(by('phoibe'), ''), false);
});

test("a stranger's factory notes are removed, the rest of the comment stays", () => {
  const [kept, cleaned] = trustNotes([by('phoibe'), by('stranger', { id: 7 })], 'phoibe');
  assert.equal(kept.body, note);
  assert.equal(cleaned.id, 7);
  assert.equal(cleaned.body.includes('<!-- factory-'), false);
  assert.match(cleaned.body, /Je dois attendre\./);
});

test('a fake waiting note from a stranger no longer holds a card', () => {
  assert.deepEqual(waitedFor(trustNotes([by('stranger')], 'phoibe')), []);
  assert.deepEqual(waitedFor(trustNotes([by('phoibe')], 'phoibe')), [12]);
});

test('trustNotes keeps comments that carry no note untouched and accepts nothing', () => {
  const plain = { body: '[Preview](https://x.vercel.app)', user: { login: 'vercel[bot]' } };
  assert.equal(trustNotes([plain], 'phoibe')[0], plain);
  assert.deepEqual(trustNotes(null, 'phoibe'), null);
  assert.deepEqual(trustNotes(undefined, 'phoibe'), undefined);
});
