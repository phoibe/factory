// Journeys of issue #397: opening another project never shows, even for a moment, the state of the one left:
// its « En direct » line (lost connection, « à jour à l'instant ») or its « En ligne : … » line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const pick = (page, name) => page.locator('#projects .project-item', { hasText: name }).click();
const status = (page) => page.locator('.live .live-text');
const alpha = { repos: ['o/r', 'o/alpha'], repoIssues: { 'o/alpha': [issue(50, 'Carte alpha', ['factory:feature', 'factory:queued'])] } };
const sheet = '# Stack technique\n\n## Mise en production\n- **Manuelle** — `git push prod main vX.Y.Z` depuis votre poste\n';

test('je quitte un projet dont la connexion est perdue : le projet ouvert ne dit pas « Connexion à GitHub perdue »', async () => {
  const failing = new Set();
  const slowRepos = {};
  await withPanel({ ...alpha, failing, slowRepos, etag: true }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await status(page).filter({ hasText: 'à jour' }).waitFor({ timeout: 10000 });
    // The project list has read alpha's cards: it opens at once from them, then its own reads are slow.
    await page.locator('#projects .project-item[data-repo="o/alpha"] [class*="pdot-"]').waitFor({ timeout: 15000 });
    slowRepos['o/alpha'] = 3000;
    failing.add('/repos/o/r/issues');
    await status(page).filter({ hasText: 'Connexion à GitHub perdue' }).waitFor({ timeout: 15000 });
    await pick(page, 'alpha');
    await page.locator('#project-name', { hasText: 'alpha' }).waitFor();
    assert.doesNotMatch(await status(page).textContent(), /perdue/);
    assert.equal(await page.locator('.live.down').count(), 0);
  });
});

test('j\'ouvre un projet lent juste après un autre : il ne dit pas « à jour à l\'instant » avant d\'avoir été lu', async () => {
  const slowRepos = {};
  await withPanel({ ...alpha, issues: [issue(1, 'Carte r', ['factory:feature', 'factory:queued'])], slowRepos, etag: true }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await page.locator('#projects .project-item[data-repo="o/alpha"] [class*="pdot-"]').waitFor({ timeout: 15000 });
    slowRepos['o/alpha'] = 5000;
    await status(page).filter({ hasText: "à jour à l'instant" }).waitFor({ timeout: 10000 });
    await pick(page, 'alpha');
    await page.locator('.ticket', { hasText: 'Carte alpha' }).waitFor();
    assert.equal(await status(page).textContent(), 'En direct · mise à jour…');
    assert.equal(await page.locator('.live.pending').count(), 1, 'a grey dot, not the green one, until it is read');
    await status(page).filter({ hasText: "à jour à l'instant" }).waitFor({ timeout: 10000 });
  });
});

test('j\'ouvre un projet pendant que la ligne « En ligne » de l\'autre se lit encore : la sienne arrive tout de suite', async () => {
  const deploy = { deployments: [{ id: 1, sha: 'a', environment: 'Production' }], statuses: { 1: [{ state: 'success' }] }, compare: { commits: [] }, pulls: [] };
  await withPanel({ ...alpha, homepages: { 'o/r': 'https://r.example' }, deploy, slowReads: [[/\/repos\/o\/alpha\/deployments/, 8000]] }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/alpha'));
    const started = page.waitForRequest(/\/repos\/o\/alpha\/deployments/);
    await page.goto(url);
    await page.locator('#project-name', { hasText: 'alpha' }).waitFor();
    await started;
    await pick(page, 'r');
    // Far before the next refresh (8 s): the read of the project left must not swallow this one's.
    await page.locator('#prod-gap', { hasText: 'En ligne : à jour' }).waitFor({ timeout: 4000 });
  });
});

test('la ligne « En ligne » tient compte du mode de mise en production lu dans la fiche stack, même s\'il arrive pendant la lecture', async () => {
  // Without the sheet the site would look « à jour »; the sheet says production is manual: the version is unknown.
  const deploy = { deployments: [{ id: 1, sha: 'a', environment: 'Production' }], statuses: { 1: [{ state: 'success' }] }, compare: { commits: [] }, pulls: [] };
  await withPanel({ homepages: { 'o/r': 'https://r.example' }, files: { 'STACK.md': sheet }, deploy, slowReads: [[/\/repos\/o\/r\/deployments/, 1500]] }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#project-sub', { hasText: 'Mise en production externe' }).waitFor();
    await page.locator('#prod-gap', { hasText: 'En ligne : version inconnue' }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(2000);
    assert.equal(await page.locator('#prod-gap').textContent(), 'En ligne : version inconnue');
  });
});

test('je change de projet pendant que celui d\'avant attend une relecture de sa ligne « En ligne » : celle du projet ouvert n\'est pas perdue', async () => {
  // Both sheets say production is manual; each one arrives while its project's line is still being read.
  const deploy = { deployments: [{ id: 1, sha: 'a', environment: 'Production' }], statuses: { 1: [{ state: 'success' }] }, compare: { commits: [] }, pulls: [] };
  await withPanel({ ...alpha, homepages: { 'o/r': 'https://r.example', 'o/alpha': 'https://a.example' }, files: { 'STACK.md': sheet }, deploy,
    slowReads: [[/\/repos\/o\/alpha\/deployments/, 6000], [/\/repos\/o\/r\/deployments/, 1500]] }, async ({ page, url }) => {
    await page.route(/\/repos\/o\/alpha\/contents\/STACK\.md/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(sheet).toString('base64'), encoding: 'base64', sha: 's' }) }));
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/alpha'));
    await page.goto(url);
    await page.locator('#project-sub', { hasText: 'Mise en production externe' }).waitFor({ timeout: 5000 });
    await pick(page, 'r');
    await page.locator('#project-name', { hasText: /^r$/ }).waitFor();
    // r's own read (1.5 s) and its read again with the sheet's mode: far before the next refresh of the line.
    await page.locator('#prod-gap', { hasText: 'En ligne : version inconnue' }).waitFor({ timeout: 4500 });
  });
});
