// Switching project clears the old project's board at once (issue #319).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const repos = ['o/r', 'o/alpha', 'o/delta'];
const issues = [issue(1, 'Carte du projet r', ['factory:feature', 'factory:queued'])];
const repoIssues = {
  'o/alpha': [issue(2, 'Carte du projet alpha', ['factory:feature', 'factory:queued'])],
  'o/delta': [issue(3, 'Carte du projet delta', ['factory:feature', 'factory:queued'])],
};
const openR = (page) => page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
const pick = (page, name) => page.locator('#projects .project-item', { hasText: name }).click();
// Records every card shown on the board after this call (even for a fraction of a second); the ones already there are not counted.
const watchTitles = (page) => page.evaluate(() => {
  window.__seen = new Set();
  const note = () => document.querySelectorAll('#board .ticket').forEach((t) => window.__seen.add(t.textContent));
  new MutationObserver(note).observe(document.getElementById('board'), { childList: true, subtree: true, characterData: true });
});
const seen = (page) => page.evaluate(() => [...window.__seen].join(' | '));

test('au clic sur un autre projet, les cartes grises apparaissent tout de suite, en même temps que le nouveau nom, puis les vraies cartes du nouveau projet', async () => {
  await withPanel({ repos, issues, repoIssues, slowRepos: { 'o/delta': 1500 }, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await pick(page, 'delta');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'delta');
    const now = await page.evaluate(() => ({ skeleton: !!document.querySelector('#board .skeleton'), old: document.getElementById('board').textContent.includes('Carte du projet r') }));
    assert.deepEqual(now, { skeleton: true, old: false });
    await page.locator('.ticket', { hasText: 'Carte du projet delta' }).waitFor();
  });
});

test('pendant le chargement, aucune carte ni aucun compteur de l\'ancien projet n\'est visible', async () => {
  await withPanel({ repos, issues, repoIssues, slowRepos: { 'o/delta': 1500 }, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    const before = await page.locator('#issues-link').textContent();
    assert.match(before, /\d/, `count shown for r: ${before}`);
    await watchTitles(page);
    await pick(page, 'delta');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'delta');
    assert.doesNotMatch(await page.locator('#issues-link').textContent(), /\d/, 'no count from r');
    await page.locator('.ticket', { hasText: 'Carte du projet delta' }).waitFor();
    assert.doesNotMatch(await seen(page), /projet r/);
  });
});

test('en cliquant très vite sur trois projets à la suite, le nom et les cartes sont ceux du dernier projet cliqué, et ne changent plus ensuite', async () => {
  await withPanel({ repos, issues, repoIssues, slowRepos: { 'o/delta': 1200 }, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await pick(page, 'delta');
    await page.waitForTimeout(200);
    await watchTitles(page);
    await pick(page, 'alpha');
    await page.locator('.ticket', { hasText: 'Carte du projet alpha' }).waitFor();
    await page.waitForTimeout(2500); // delta's slow answers would come in meanwhile
    assert.equal(await page.locator('#project-name').textContent(), 'alpha');
    assert.deepEqual(await page.locator('#board .ticket').allTextContents().then((t) => t.map((x) => /projet (\w+)/.exec(x)?.[1])), ['alpha']);
    assert.doesNotMatch(await seen(page), /projet (delta|r)\b/);
  });
});

test('en revenant au premier projet, ses cartes s\'affichent correctement, comme avant', async () => {
  await withPanel({ repos, issues, repoIssues, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await pick(page, 'alpha');
    await page.locator('.ticket', { hasText: 'Carte du projet alpha' }).waitFor();
    await pick(page, 'r');
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    assert.equal(await page.locator('#board .ticket').count(), 1);
  });
});

test('une réponse tardive d\'un projet quitté ne change pas le menu du projet en cours', async () => {
  await withPanel({ repos, issues, repoIssues, slowRepos: { 'o/delta': 1500 }, framedRepos: ['o/delta'], viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await pick(page, 'delta');
    await pick(page, 'alpha');
    await page.locator('.ticket', { hasText: 'Carte du projet alpha' }).waitFor();
    await page.waitForTimeout(2500); // delta's answers (already framed) come in meanwhile
    assert.equal(await page.locator('#new-project').textContent(), 'Cadrer le projet');
  });
});

test('si le projet quitté ne répond plus, le nouveau projet n\'affiche pas « Connexion perdue »', async () => {
  const failing = new Set(['/repos/o/alpha/issues']);
  await withPanel({ repos, issues, repoIssues, failing, slowRepos: { 'o/alpha': 1500, 'o/r': 3000 }, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/alpha'));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'alpha');
    await pick(page, 'r');
    await page.waitForTimeout(2000); // alpha's request fails meanwhile
    assert.doesNotMatch(await page.locator('#board').textContent(), /Connexion perdue/);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor({ timeout: 15000 });
  });
});

test('sur un projet en « mise en production sur mon accord », changer de projet pendant sa vérification ne ramène pas son compteur', async () => {
  await withPanel({ repos, issues, repoIssues, config: { production: 'approval' }, slowReads: [[/labels=factory%3Aawaiting-production/, 2000]], slowRepos: { 'o/alpha': 3000 }, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'r');
    await page.waitForTimeout(500); // r's refresh now waits for its « mise en production » list
    await pick(page, 'alpha');
    await page.waitForTimeout(2500);
    assert.equal(await page.locator('#project-name').textContent(), 'alpha');
    assert.doesNotMatch(await page.locator('#issues-link').textContent(), /\d/, 'no count from r');
    assert.doesNotMatch(await page.locator('#board').textContent(), /projet r\b/);
  });
});
