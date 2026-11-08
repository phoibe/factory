import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, doneItems, doneView, olderNote, doneAgo, columnFor, waitsForOwner, boardItems, toggleSkill, setPath, toBase64, fromBase64, tokenFromHash, phoneLink, previewFrom, focusComment, projectCandidates, sessionFrom, issuesUrl, chatServerUrl, allPages, mergeConfig, openIssueCount, issuesLinkText } from '../panel/lib.mjs';

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
  assert.equal(previewFrom([{ user: { login: 'phoibe' }, author_association: 'OWNER', body: 'Tu peux tester la nouvelle version ici : https://c.vercel.app\n\nVérifie' }]), 'https://c.vercel.app');
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
  const note = { user: { login: 'github-actions[bot]' }, body: "<!-- factory-session -->\n<!-- factory-agent -->\nDernier lancement de l'agent : **Construction**, à 14:05. [Voir ce qu'il fait](https://claude.ai/code/session_01ABC)" };
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

test('doneItems keeps every merged request, newest first', () => {
  const pulls = Array.from({ length: 14 }, (_, i) => pr(200 + i, new Date(Date.UTC(2025, 0, 1 + i)).toISOString()));
  const out = doneItems(pulls);
  assert.equal(out.length, 14);
  assert.equal(out[0].number, 213);
  assert.deepEqual(doneItems(null), []);
});

// Issue #203: a request the agent closed by itself shows in « Terminé » with its reason.
test('doneItems adds agent-closed requests with their reason, newest first with merged ones', () => {
  const closedIssue = (number, closedAt, label, extra = {}) => ({ number, title: `Demande ${number}`, closed_at: closedAt, html_url: `https://github.com/o/r/issues/${number}`, labels: [{ name: 'factory:feature' }, ...(label ? [{ name: label }] : [])], ...extra });
  const out = doneItems([pr(110, '2026-11-02T10:00:00Z')], [
    closedIssue(5, '2026-11-03T10:00:00Z', 'factory:already-done'),
    closedIssue(6, '2026-11-01T10:00:00Z', 'factory:duplicate'),
    closedIssue(7, '2026-11-04T10:00:00Z', 'factory:obsolete'),
    closedIssue(8, '2026-11-05T10:00:00Z', null), // abandoned by the owner: not shown
    closedIssue(9, '2026-11-05T10:00:00Z', 'factory:obsolete', { pull_request: {} }), // a PR, not a request
  ]);
  assert.deepEqual(out.map((d) => [d.issue, d.reason]), [[7, 'Obsolète'], [5, 'Déjà réglée'], [10, null], [6, 'En double']]);
  assert.equal(out[0].url, 'https://github.com/o/r/issues/7');
  assert.equal(out[0].mergedAt, '2026-11-04T10:00:00Z');
  assert.equal(out[0].title, 'Demande 7');
});

test('doneView shows at most 9 items and counts the hidden older ones', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ number: i }));
  assert.deepEqual([doneView(mk(14)).shown.length, doneView(mk(14)).hidden], [9, 5]);
  assert.deepEqual([doneView(mk(10)).shown.length, doneView(mk(10)).hidden], [9, 1]);
  assert.deepEqual([doneView(mk(9)).shown.length, doneView(mk(9)).hidden], [9, 0]);
  assert.deepEqual([doneView(mk(3)).shown.length, doneView(mk(3)).hidden], [3, 0]);
  assert.equal(doneView(mk(14)).shown[0].number, 0);
});

test('olderNote words the hidden count, singular and plural', () => {
  assert.equal(olderNote(0), '');
  assert.equal(olderNote(1), '+ 1 plus ancienne non affichée');
  assert.equal(olderNote(5), '+ 5 plus anciennes non affichées');
});

test('doneAgo speaks French', () => {
  const now = Date.parse('2026-11-04T15:00:00');
  assert.equal(doneAgo('2026-11-04T14:59:50', now), "à l'instant");
  assert.equal(doneAgo('2026-11-04T14:30:00', now), 'il y a 30 min');
  assert.equal(doneAgo('2026-11-04T12:30:00', now), 'il y a 2 h');
  assert.equal(doneAgo('2026-11-03T20:00:00', now), 'hier');
  assert.match(doneAgo('2026-11-03T08:00:00', Date.parse('2026-11-10T15:00:00')), /^le 3 nov/);
});

test('previewFrom and sessionFrom ignore links planted by a stranger on a public project', () => {
  const planted = { user: { login: 'stranger' }, author_association: 'NONE', body: 'Tu peux tester la nouvelle version ici : https://evil.example' };
  assert.equal(previewFrom([planted]), null);
  assert.equal(previewFrom([{ user: { login: 'github-actions[bot]' }, body: 'Tu peux tester la nouvelle version ici : https://ok.vercel.app' }, planted]), 'https://ok.vercel.app');
  const body = '<!-- factory-session -->\nVoir [ici](https://claude.ai/code/session_1)';
  assert.equal(sessionFrom([{ user: { login: 'stranger' }, body }]), null);
  assert.equal(sessionFrom([{ user: { login: 'github-actions[bot]' }, body }]), 'https://claude.ai/code/session_1');
});

test('chatServerUrl only accepts a Modal address or localhost', () => {
  assert.equal(chatServerUrl('https://me--factory-chat-web.modal.run'), 'https://me--factory-chat-web.modal.run');
  assert.equal(chatServerUrl('http://localhost:8000'), 'http://localhost:8000');
  for (const bad of ['https://evil.example', 'https://x.modal.run.evil.example', 'https://evil.example/.modal.run', 'http://x.modal.run', '', null]) assert.equal(chatServerUrl(bad), null);
});

test('allPages reads every page of a list', async () => {
  const pages = [Array(100).fill(1), Array(100).fill(2), Array(5).fill(3)];
  assert.equal((await allPages(async (p) => pages[p - 1])).length, 205);
  assert.equal((await allPages(async () => Array(100).fill(1), 3)).length, 300);
});

test('mergeConfig keeps changes made elsewhere and applies only the local ones', () => {
  const base = { maxParallel: 2, stages: { tdd: true, plan: true }, siteUrl: '' };
  const mine = { ...base, stages: { tdd: false, plan: true } };
  const theirs = { ...base, maxParallel: 5, stages: { tdd: true, plan: false } };
  assert.deepEqual(mergeConfig(base, mine, theirs), { maxParallel: 5, stages: { tdd: false, plan: false }, siteUrl: '' });
  assert.deepEqual(mergeConfig(base, base, theirs), theirs);
});

test('tabTitle shows the number of waiting cards, and nothing at zero', async () => {
  const { tabTitle } = await import('../panel/lib.mjs');
  assert.equal(tabTitle(2), '(2) Factory');
  assert.equal(tabTitle(0), 'Factory');
});

test('toBase64 handles large content without overflowing the stack', () => {
  const big = 'é'.repeat(300000);
  assert.equal(fromBase64(toBase64(big)), big);
});

test('a pull request closing several issues hides and finishes all of them', () => {
  const items = [
    { number: 1, labels: ['factory:feature', 'factory:building'] },
    { number: 2, labels: ['factory:feature', 'factory:building'] },
    { number: 9, labels: ['factory:acceptance'], pull_request: {}, body: 'Closes #1, closes #2' },
  ];
  assert.deepEqual(boardItems(items).map((i) => i.number), [9]);
  const done = doneItems([{ number: 5, merged_at: '2026-01-01T00:00:00Z', body: 'Closes #1, closes #2', title: 'T', html_url: 'https://github.com/o/r/pull/5' }]);
  assert.deepEqual(done.map((d) => d.issue), [1, 2]);
});

test('openIssueCount counts issues, not pull requests', () => {
  assert.equal(openIssueCount([{ number: 1 }, { number: 2, pull_request: {} }, { number: 3 }]), 2);
  assert.equal(openIssueCount([]), 0);
  assert.equal(openIssueCount(null), null);
  assert.equal(issuesLinkText(7), 'Voir les demandes sur GitHub (7)');
  assert.equal(issuesLinkText(0), 'Voir les demandes sur GitHub (0)');
  assert.equal(issuesLinkText(null), 'Voir les demandes sur GitHub');
});

test('ideas to sort: what the agent proposed, not kept, not started; the owner\'s own requests never', async () => {
  const { ideaItems } = await import('../panel/lib.mjs');
  const A = '<!-- factory-agent -->\nRepéré pendant la review';
  const items = [
    { number: 1, body: A, labels: ['factory:feature'] },
    { number: 2, body: A, labels: ['factory:feature', 'factory:kept'] },
    { number: 3, body: A, labels: ['factory:feature', 'factory:grilling'] },
    { number: 4, body: 'Ma demande', labels: ['factory:feature'] },
    { number: 5, body: A, labels: ['factory:bug'] },
    { number: 6, body: A, labels: ['factory:feature'], pull_request: {} },
    { number: 7, body: A, labels: ['factory:question'] },
    { number: 8, body: A, labels: ['factory:feature', 'factory:running'] },
  ];
  assert.deepEqual(ideaItems(items).map((i) => i.number), [1, 5]);
});

test('an idea written by a stranger on a public project is not an idea to sort', async () => {
  const { ideaItems } = await import('../panel/lib.mjs');
  const idea = (number, author_association) => ({ number, body: '<!-- factory-agent -->\nIdée', labels: ['factory:feature'], author_association, user: { login: 'x' } });
  assert.deepEqual(ideaItems([idea(1, 'NONE'), idea(2, 'OWNER')]).map((i) => i.number), [2]);
});

test('ideasToShow hides the ideas being sorted and forgets those GitHub no longer lists', async () => {
  const { ideasToShow } = await import('../panel/lib.mjs');
  const ideas = [{ number: 5 }, { number: 6 }, { number: 7 }];
  // 6 and 8 are on their way to GitHub, 9 was sorted and GitHub already dropped it, 7 was sorted but GitHub still lists it.
  const sorting = new Map([[6, 'sending'], [8, 'sending'], [7, 'sent'], [9, 'sent']]);
  const { shown, settled } = ideasToShow(ideas, sorting);
  assert.deepEqual(shown.map((i) => i.number), [5]);
  assert.deepEqual(settled, [9]);
  assert.deepEqual(ideasToShow(ideas, new Map()).shown, ideas);
});

test('deliveredIssue reads the first « Closes #n » of a PR', async () => {
  const { deliveredIssue } = await import('../panel/lib.mjs');
  assert.equal(deliveredIssue({ body: 'Résumé\n\nCloses #12, closes #13' }), 12);
  assert.equal(deliveredIssue({ body: 'see #4' }), null);
});

test('the « Mise en production » button shows how many changes wait, and is greyed with « Rien en attente » when none (#294)', async () => {
  const { releaseButton } = await import('../panel/lib.mjs');
  assert.deepEqual(releaseButton([]), { text: 'Mise en production', disabled: true, hint: 'Rien en attente' });
  assert.deepEqual(releaseButton([{}, {}, {}]), { text: 'Mise en production (3)', disabled: false, hint: '3 modifications en attente' });
  assert.deepEqual(releaseButton([{}]), { text: 'Mise en production (1)', disabled: false, hint: '1 modification en attente' });
});
