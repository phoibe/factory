// The open board loads first: the other projects' dots, the day's agent starts, the gap with production, « Déclarer
// stable » and « Terminé » wait for its cards. Fired all at once, these lists (about 1 MB a page on a real project) shared
// the connection with the board, which took 8 to 20 s to show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

test('à l\'ouverture du panneau, les cartes du projet ouvert arrivent avant tout le reste', async () => {
  const deploy = { deployments: [{ id: 1, sha: 'a', environment: 'Production' }], statuses: { 1: [{ state: 'success' }] }, compare: { commits: [] }, pulls: [] };
  await withPanel({
    repos: ['o/r', 'o/alpha'], issues: [issue(1, 'Carte r', ['factory:feature', 'factory:queued'])],
    repoIssues: { 'o/alpha': [issue(50, 'Carte alpha', ['factory:feature', 'factory:queued'])] },
    homepages: { 'o/r': 'https://r.example' }, deploy,
    // The board's open cards take a while: nothing heavy may start meanwhile.
    slowReads: [[/\/repos\/o\/r\/issues\?state=open/, 1500]],
  }, async ({ page, url }) => {
    const sent = [];
    let before = null; // what was asked until the board's cards came back
    page.on('request', (r) => { if (r.url().startsWith('https://api.github.com/')) sent.push(r.url().replace('https://api.github.com', '')); });
    page.on('response', (r) => { if (!before && r.url().includes('/repos/o/r/issues?state=open')) before = [...sent]; });
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte r' }).waitFor({ timeout: 10000 });
    assert.ok(before.some((p) => p.startsWith('/repos/o/r/issues?state=open')), 'the board asked for its cards');
    const heavy = [/^\/repos\/o\/alpha\/issues/, /\/compare\/stable\.\.\.main/, /^\/repos\/o\/r\/pulls\?state=closed/, /^\/repos\/o\/r\/issues\?state=closed/, /^\/repos\/o\/r\/deployments/];
    for (const p of before) for (const h of heavy) assert.doesNotMatch(p, h, `${p} was asked before the board's cards`);
    // Then everything else comes: the other project's dot, « Terminé ».
    await page.locator('#projects .project-item[data-repo="o/alpha"] [class*="pdot-"]').waitFor({ timeout: 15000 });
    await page.locator('.lane-done .count').waitFor({ timeout: 10000 });
    assert.ok(sent.some((p) => /^\/repos\/o\/r\/pulls\?state=closed/.test(p)), '« Terminé » was read after the cards');
  });
});
