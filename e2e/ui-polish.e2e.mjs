// Journeys of the « Amélioration UI » button (issue #462), replayed at each delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const created = (writes) => writes.filter((w) => w.method === 'POST' && w.path === '/repos/o/r/issues');

test('le menu du tableau montre « Amélioration UI » à côté de « Review générale »', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Amélioration UI' }).waitFor();
    assert.equal(await page.locator('#general-review + #ui-polish').count(), 1);
  });
});

test('sur téléphone, « Amélioration UI » est dans « Plus », juste après « Review générale »', async () => {
  await withPanel({ viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#more summary').click();
    await page.getByRole('button', { name: 'Amélioration UI' }).waitFor();
    const items = (await page.locator('#more-menu > a, #more-menu > button:not([hidden])').allTextContents()).map((t) => t.trim());
    assert.equal(items[items.indexOf('Review générale') + 1], 'Amélioration UI');
  });
});

test('un clic affiche la confirmation, « Annuler » ne crée rien', async () => {
  await withPanel({}, async ({ page, writes, url }) => {
    await page.goto(url);
    let asked = null;
    page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
    await page.getByRole('button', { name: 'Amélioration UI' }).click();
    await page.waitForTimeout(500);
    assert.equal(asked, 'Lancer une amélioration de l\'interface ?');
    assert.equal(created(writes).length, 0);
  });
});

test('après confirmation, une carte « Amélioration UI » est créée et démarre seule', async () => {
  await withPanel({}, async ({ page, writes, url }) => {
    await page.goto(url);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Amélioration UI' }).click();
    for (let i = 0; i < 20 && !created(writes).length; i++) await page.waitForTimeout(250);
    const [card] = created(writes);
    assert.equal(card?.body.title, 'Amélioration UI de l\'appli');
    assert.deepEqual(card?.body.labels, ['factory:ui-polish']);
  });
});

test('la carte en construction s\'affiche comme « Amélioration UI »', async () => {
  await withPanel({ issues: [issue(9, 'Amélioration UI de l\'appli', ['factory:ui-polish', 'factory:building', 'factory:running'])] }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket .kind', { hasText: 'Amélioration UI' }).first().waitFor();
  });
});
