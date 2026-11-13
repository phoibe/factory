// Journeys of issue #369: the production gap under the project's name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const site = { homepages: { 'o/r': 'https://r.example' } };
const pr = (number, title, sha, mergedAt, closes) => ({ number, title, merge_commit_sha: sha, merged_at: mergedAt, head: { ref: `claude/issue-${closes}-x` }, body: `Closes #${closes}` });
const pulls = [pr(112, 'Correction du menu', 's2', '2026-11-08T11:00:00Z', 12), pr(111, 'Ajout du mode sombre', 's1', '2026-11-08T10:00:00Z', 11)];
const live = (statuses2 = null) => ({
  deployments: [{ id: 1, sha: 'a', environment: 'Production' }, ...(statuses2 ? [{ id: 2, sha: 'b', environment: 'Production' }] : [])],
  statuses: { 1: [{ state: 'success' }], ...(statuses2 ? { 2: statuses2 } : {}) },
  pulls,
});
const line = (page) => page.locator('#prod-gap');

test('un projet à jour affiche « En ligne : à jour »', async () => {
  await withPanel({ ...site, deploy: { ...live(), compare: { commits: [] } } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#prod-gap', { hasText: 'En ligne : à jour' }).waitFor();
  });
});

test('juste après une validation, on voit « publication en cours… » pendant que l\'hébergeur publie', async () => {
  await withPanel({ ...site, deploy: { ...live([{ state: 'in_progress' }]), compare: { commits: [{ sha: 's2' }] } } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#prod-gap', { hasText: 'En ligne : publication en cours…' }).waitFor();
  });
});

test('sur un projet « sur accord » avec 2 modifications en attente, le texte dit « 2 modifications d\'écart » et la liste montre titres, dates et liens', async () => {
  const awaiting = [issue(111, 'Ajout du mode sombre', ['factory:awaiting-production'], { state: 'closed', pull_request: { merged_at: '2026-11-08T10:00:00Z' } })];
  await withPanel({ ...site, config: { production: 'approval' }, awaiting, branches: { preprod: 'p' }, deploy: { ...live(), compare: { commits: [{ sha: 's1' }, { sha: 's2' }, { sha: 'chore' }] } } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#prod-gap', { hasText: 'En ligne : 2 modifications d\'écart' }).click();
    const dialog = page.getByRole('dialog', { name: 'Pas encore en ligne' });
    await dialog.waitFor();
    const items = dialog.locator('#gap-list li');
    assert.equal(await items.count(), 2);
    assert.match(await items.nth(0).textContent(), /Ajout du mode sombre/);
    assert.match(await items.nth(0).textContent(), /8 nov/);
    assert.match(await items.nth(1).textContent(), /Correction du menu/);
    assert.equal(await items.nth(0).locator('a').getAttribute('href'), 'https://github.com/o/r/issues/11');
  });
});

test('une publication en échec s\'affiche en couleur d\'alerte avec l\'écart', async () => {
  await withPanel({ ...site, deploy: { ...live([{ state: 'failure' }]), compare: { commits: [{ sha: 's2' }] } } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#prod-gap', { hasText: 'En ligne : 1 modification d\'écart · la dernière publication a échoué' }).waitFor();
    assert.match(await line(page).getAttribute('class'), /failed/);
  });
});

test('un projet en mise en ligne externe affiche « version inconnue », avec son explication au toucher', async () => {
  await withPanel({ ...site, config: { production: 'external' }, deploy: { deployments: [] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#prod-gap', { hasText: 'En ligne : version inconnue' }).click();
    const dialog = page.getByRole('dialog', { name: 'Version en ligne inconnue' });
    await dialog.getByText(/hors de la factory/).waitFor();
  });
});

test('un projet sans site n\'affiche rien', async () => {
  await withPanel({ deploy: { deployments: [] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#new-feature').waitFor();
    await page.waitForTimeout(500);
    assert.equal(await line(page).isVisible(), false);
  });
});

test('sur téléphone, l\'écart reste visible sous le nom du projet', async () => {
  await withPanel({ ...site, viewport: { width: 390, height: 844 }, deploy: { ...live(), compare: { commits: [] } } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#prod-gap', { hasText: 'En ligne : à jour' }).waitFor({ state: 'visible' });
  });
});
