import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnFor, waitsForOwner, boardItems, toggleSkill, setPath, toBase64, fromBase64, tokenFromHash, phoneLink, previewFrom, focusComment, projectCandidates } from '../panel/lib.mjs';

test('columnFor picks the most urgent state', () => {
  assert.equal(columnFor(['factory:feature', 'factory:grilling']), 'grilling');
  assert.equal(columnFor(['factory:building', 'factory:blocked']), 'blocked');
  assert.equal(columnFor(['factory:fixing']), 'checks');
  assert.equal(columnFor(['bug']), null);
});

test('waitsForOwner is false while an agent runs', () => {
  assert.equal(waitsForOwner(['factory:spec-review']), true);
  assert.equal(waitsForOwner(['factory:spec-review', 'factory:running']), false);
  assert.equal(waitsForOwner(['factory:building']), false);
});

test('an issue with an open PR in a later state shows once', () => {
  const items = [
    { number: 1, labels: ['factory:feature', 'factory:building'] },
    { number: 9, labels: ['factory:acceptance'], pull_request: {}, body: 'Closes #1' },
    { number: 2, labels: ['factory:feature', 'factory:grilling'] },
  ];
  assert.deepEqual(boardItems(items).map((i) => [i.number, i.column]), [[9, 'acceptance'], [2, 'grilling']]);
});

test('toggleSkill and setPath do not mutate the input', () => {
  const cfg = { maxParallel: 2, stages: { grilling: true }, skills: { sp: { enabled: true, skills: { tdd: true } } } };
  assert.equal(toggleSkill(cfg, 'sp', 'tdd', false).skills.sp.skills.tdd, false);
  assert.equal(setPath(cfg, 'stages.grilling', false).stages.grilling, false);
  assert.equal(cfg.stages.grilling, true);
});

test('base64 round-trips accents', () => {
  assert.equal(fromBase64(toBase64('Règles é ✅')), 'Règles é ✅');
});

test('a phone link carries the token in the fragment and is read back once', () => {
  const link = phoneLink('https://phoibe.github.io/factory/#old', 'github_pat_ABC_123');
  assert.equal(link, 'https://phoibe.github.io/factory/#jeton=github_pat_ABC_123');
  assert.equal(tokenFromHash(new URL(link).hash), 'github_pat_ABC_123');
  assert.equal(tokenFromHash('#autre'), null);
  assert.equal(tokenFromHash(''), null);
});

test('previewFrom finds the latest preview link of a PR', () => {
  const vercel = (url) => ({ user: { login: 'vercel[bot]' }, body: `| habitudes | ✅ Ready ([Inspect](https://vercel.com/x)) | [Visit Preview](${url}) |` });
  assert.equal(previewFrom([vercel('https://a.vercel.app'), vercel('https://b.vercel.app')]), 'https://b.vercel.app');
  assert.equal(previewFrom([{ user: { login: 'phoibe' }, body: 'Tu peux tester la nouvelle version ici : https://c.vercel.app\n\nVérifie' }]), 'https://c.vercel.app');
  assert.equal(previewFrom([{ user: { login: 'phoibe' }, body: '[Preview](https://evil.example)' }]), null);
  assert.equal(previewFrom([]), null);
});

test('focusComment opens the card on the latest message from a person or the agent, not a bot', () => {
  const c = (login, id, type = 'User') => ({ user: { login, type }, html_url: `https://github.com/o/r/issues/1#issuecomment-${id}` });
  assert.equal(focusComment([c('phoibe', 1), c('phoibe', 2), c('vercel[bot]', 3, 'Bot'), c('github-actions[bot]', 4, 'Bot')]), 'https://github.com/o/r/issues/1#issuecomment-2');
  assert.equal(focusComment([c('vercel[bot]', 3, 'Bot')]), null);
  assert.equal(focusComment([]), null);
});

test('projectCandidates skips archived repositories and templates', () => {
  const repos = [{ name: 'habitudes' }, { name: 'factory-template', is_template: true }, { name: 'old', archived: true }, { name: 'factory' }];
  assert.deepEqual(projectCandidates(repos).map((r) => r.name), ['habitudes', 'factory']);
});
