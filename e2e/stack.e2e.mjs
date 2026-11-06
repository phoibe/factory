// Journeys of the « Stack technique » button (issue #242), replayed at each delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withPanel, issue } from './fixture.mjs';

const SHEET = readFileSync(new URL('../STACK.md', import.meta.url), 'utf8');
const withSheet = { files: { 'STACK.md': SHEET }, fileDates: { 'STACK.md': '2026-11-06T15:00:00Z' } };

test('le bouton « Stack technique » est en haut, à côté de « Review générale »', async () => {
  await withPanel(withSheet, async ({ page, url }) => {
    await page.goto(url);
    const button = page.getByRole('button', { name: 'Stack technique' });
    await button.waitFor();
    assert.equal(await page.locator('#general-review + #stack-open').count(), 1);
  });
});

test('sur téléphone, le bouton « Stack technique » est dans « Plus »', async () => {
  await withPanel({ ...withSheet, viewport: { width: 390, height: 800 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForSelector('#project-view:not([hidden])');
    assert.equal(await page.locator('#more-menu #stack-open').count(), 1);
    await page.locator('#more summary').click();
    await page.getByRole('button', { name: 'Stack technique' }).click();
    await page.waitForSelector('#stack[open]');
  });
});

test('un clic ouvre la fiche tout de suite, « Fermer » la referme et je retrouve le suivi', async () => {
  await withPanel({ ...withSheet, issues: [issue(1, 'Partager une recette', ['factory:feature', 'factory:spec-review'])] }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Stack technique' }).click();
    await page.waitForSelector('#stack[open] #stack-body h3');
    await page.getByRole('button', { name: 'Fermer' }).click();
    assert.equal(await page.locator('#stack[open]').count(), 0);
    assert.ok(await page.locator('button.go[data-go="1"]').isVisible());
  });
});

test('la fiche de la factory montre ses parties dans l\'ordre, avec « Mise à jour le … » en haut', async () => {
  await withPanel(withSheet, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Stack technique' }).click();
    await page.waitForSelector('#stack[open] #stack-body h3');
    assert.equal(await page.locator('#stack-date').textContent(), 'Mise à jour le 6 novembre 2026');
    assert.deepEqual(await page.locator('#stack-body h3').allTextContents(), ['Interface', 'Moteur / serveur', 'Autres services', 'Données', 'Bibliothèques', 'Services nécessaires']);
    const text = await page.locator('#stack-body').textContent();
    for (const name of ['GitHub Pages', 'GitHub Actions', 'FastAPI 0.115', 'Modal', 'Playwright 1', 'axe-core 4']) assert.ok(text.includes(name), name);
  });
});

test('sans fiche, je vois « Pas encore de fiche » et « Établir la fiche » lance l\'agent', async () => {
  await withPanel({}, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Stack technique' }).click();
    await page.getByText('Pas encore de fiche').waitFor();
    await page.getByRole('button', { name: 'Établir la fiche' }).click();
    for (let i = 0; i < 20 && !writes.some((w) => w.path === '/repos/o/r/issues'); i++) await page.waitForTimeout(250);
    const created = writes.find((w) => w.method === 'POST' && w.path === '/repos/o/r/issues');
    assert.deepEqual(created?.body.labels, ['factory:stack']);
  });
});

test('une fiche déjà demandée n\'est pas redemandée : la fenêtre dit qu\'elle arrive', async () => {
  await withPanel({ issues: [issue(7, 'Établir la fiche stack technique', ['factory:stack', 'factory:building', 'factory:running'])] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Stack technique' }).click();
    await page.getByText(/en cours de rédaction/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Établir la fiche' }).count(), 0);
    assert.equal(writes.filter((w) => w.path === '/repos/o/r/issues').length, 0);
  });
});
