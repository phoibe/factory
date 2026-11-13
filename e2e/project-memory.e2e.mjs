// The project list remembered on this device (issue #399): it shows at once, and an unchanged repository is not read again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const pushed = { 'o/r': '2026-11-01T10:00:00Z', 'o/alpha': '2026-11-01T09:00:00Z' };
const names = (page) => page.locator('#projects .project-item .pname').allTextContents();
const desk = { width: 1280, height: 800 };

test('à la seconde ouverture, la liste des projets s\'affiche tout de suite', async () => {
  const slowReads = [];
  await withPanel({ repos: ['o/r', 'o/alpha'], pushed, slowReads, viewport: desk }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#projects .project-item', { hasText: 'alpha' }).waitFor();
    slowReads.push([/\/user\/repos/, 8000]); // GitHub is slow to give the repository list this time
    await page.reload();
    await page.locator('#projects .project-item', { hasText: 'alpha' }).waitFor({ timeout: 3000 });
    assert.deepEqual(await names(page), ['alpha', 'r']);
  });
});

test('un dépôt qui n\'a rien reçu depuis la dernière visite n\'est pas relu', async () => {
  await withPanel({ repos: ['o/r', 'o/alpha'], pushed, viewport: desk }, async ({ page, url, reads }) => {
    await page.goto(url);
    await page.locator('#projects .project-item', { hasText: 'alpha' }).waitFor();
    reads.length = 0;
    await page.reload();
    await page.locator('#projects .project-item', { hasText: 'alpha' }).waitFor();
    await new Promise((r) => setTimeout(r, 1500)); // the background check of the list
    assert.ok(reads.includes('/user/repos'), 'the list is checked');
    assert.deepEqual(reads.filter((p) => p.endsWith('/contents/factory.config.json')), []);
  });
});

test('un projet créé depuis la dernière visite apparaît quelques secondes après l\'ouverture, sans recharger', async () => {
  const repos = ['o/r', 'o/alpha'];
  await withPanel({ repos, pushed, viewport: desk }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#projects .project-item', { hasText: 'alpha' }).waitFor();
    repos.push('o/nouveau');
    await page.reload();
    await page.locator('#projects .project-item', { hasText: 'nouveau' }).waitFor({ timeout: 5000 });
    assert.deepEqual(await names(page), ['alpha', 'nouveau', 'r']);
  });
});

test('un projet supprimé depuis la dernière visite disparaît de la liste, sans recharger', async () => {
  const repos = ['o/r', 'o/alpha'];
  await withPanel({ repos, pushed, viewport: desk }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#projects .project-item', { hasText: 'alpha' }).waitFor();
    repos.splice(1, 1);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#projects .project-item').length === 1, null, { timeout: 5000 });
    assert.deepEqual(await names(page), ['r']);
  });
});

test('des réglages changés ailleurs depuis la dernière visite n\'effacent pas le message en cours d\'écriture', async () => {
  const config = {}, configMeta = { sha: 's' }, slowReads = [], times = { ...pushed };
  await withPanel({ repos: ['o/r', 'o/alpha'], pushed: times, config, configMeta, slowReads, viewport: desk }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#projects .project-item', { hasText: 'alpha' }).waitFor();
    // Meanwhile, the settings were changed from another device.
    config.maxParallel = 4; configMeta.sha = 's2';
    times['o/r'] = times['o/alpha'] = '2026-11-02T10:00:00Z';
    slowReads.push([/\/user\/repos/, 1500]);
    await page.reload();
    await page.locator('#tab-chat').click();
    await page.locator('#chat-input').fill('Mon brouillon');
    await new Promise((r) => setTimeout(r, 3000));
    assert.equal(await page.locator('#chat-input').inputValue(), 'Mon brouillon');
  });
});

test('se déconnecter efface la liste des projets gardée sur l\'appareil', async () => {
  await withPanel({ repos: ['o/r', 'o/alpha'], pushed, viewport: desk }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#projects .project-item', { hasText: 'alpha' }).waitFor();
    await page.waitForFunction(() => localStorage.getItem('factory.projects'));
    await page.evaluate(() => document.getElementById('logout').click());
    assert.equal(await page.evaluate(() => localStorage.getItem('factory.projects')), null);
  });
});
