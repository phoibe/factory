import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, doneItems, doneAgo, columnFor, waitsForOwner, boardItems, toggleSkill, setPath, toBase64, fromBase64, tokenFromHash, phoneLink, previewFrom, focusComment, projectCandidates, sessionFrom, issuesUrl } from '../panel/lib.mjs';

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

test('issuesUrl points to the full list of open issues of the project', () => {
  assert.equal(issuesUrl('https://github.com/phoibe/habitudes'), 'https://github.com/phoibe/habitudes/issues');
  assert.equal(issuesUrl('https://github.com/phoibe/habitudes/'), 'https://github.com/phoibe/habitudes/issues');
});

test('projectCandidates skips archived repositories and templates', () => {
  const repos = [{ name: 'habitudes' }, { name: 'factory-template', is_template: true }, { name: 'old', archived: true }, { name: 'factory' }];
  assert.deepEqual(projectCandidates(repos).map((r) => r.name), ['habitudes', 'factory']);
});

test('sessionFrom reads the link to the agent session from the factory comment', () => {
  const note = { body: "<!-- factory-session -->\n<!-- factory-agent -->\nDernier lancement de l'agent : **Construction**, à 14:05. [Voir ce qu'il fait](https://claude.ai/code/session_01ABC)" };
  assert.equal(sessionFrom([{ body: 'ok' }, note]), 'https://claude.ai/code/session_01ABC');
  assert.equal(sessionFrom([{ body: 'ok' }]), null);
});

const pr = (number, merged_at, body = `Closes #${number - 100}`, title = `T${number}`) => ({ number, merged_at, body, title, html_url: `https://github.com/o/r/pull/${number}` });

test('« Terminé » is the last column and needs nothing from the owner', () => {
  assert.deepEqual(COLUMNS.at(-1), { id: 'done', title: 'Terminé' });
  assert.equal(columnFor(['factory:feature']), null);
});

test('doneItems keeps merged requests only, newest first, and opens the original issue', () => {
  const out = doneItems([
    pr(110, '2026-11-01T10:00:00Z'),
    pr(111, null), // closed without a merge
    pr(112, '2026-11-03T10:00:00Z', 'no link to a request'),
    pr(113, '2026-11-02T10:00:00Z', 'Résumé\n\nFixes #7'),
  ]);
  assert.deepEqual(out.map((d) => d.number), [113, 110]);
  assert.equal(out[0].issue, 7);
  assert.equal(out[0].url, 'https://github.com/o/r/issues/7');
});

test('doneItems keeps only the 10 most recent whatever their age', () => {
  const pulls = Array.from({ length: 14 }, (_, i) => pr(200 + i, new Date(Date.UTC(2025, 0, 1 + i)).toISOString()));
  const out = doneItems(pulls);
  assert.equal(out.length, 10);
  assert.equal(out[0].number, 213);
  assert.deepEqual(doneItems(null), []);
});

test('doneAgo speaks French', () => {
  const now = Date.parse('2026-11-04T15:00:00');
  assert.equal(doneAgo('2026-11-04T14:59:50', now), "à l'instant");
  assert.equal(doneAgo('2026-11-04T14:30:00', now), 'il y a 30 min');
  assert.equal(doneAgo('2026-11-04T12:30:00', now), 'il y a 2 h');
  assert.equal(doneAgo('2026-11-03T20:00:00', now), 'hier');
  assert.match(doneAgo('2026-11-03T08:00:00', Date.parse('2026-11-10T15:00:00')), /^le 3 nov/);
});
