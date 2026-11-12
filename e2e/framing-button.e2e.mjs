// Journeys of issue #354: the « Cadrer le projet » / « Revoir le cadrage » button leaves the « Plus » menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

async function menuItems(page) {
  await page.locator('#more summary').click();
  await page.getByRole('button', { name: 'Review générale' }).waitFor();
  await page.waitForTimeout(500); // the « already framed » answer has come in
  return (await page.locator('#more-menu > a, #more-menu > button:not([hidden])').allTextContents()).map((t) => t.trim());
}

test('sur un projet déjà cadré, le menu « Plus » n\'a pas de « Revoir le cadrage »', async () => {
  await withPanel({ framedRepos: ['o/r'], viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    const items = await menuItems(page);
    assert.ok(!items.includes('Revoir le cadrage'), items.join(', '));
    assert.equal(await page.getByText('Revoir le cadrage').count(), 0);
  });
});

test('sur un projet pas encore cadré, le menu « Plus » n\'a pas de « Cadrer le projet »', async () => {
  await withPanel({ viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    const items = await menuItems(page);
    assert.ok(!items.includes('Cadrer le projet'), items.join(', '));
    assert.equal(await page.getByText('Cadrer le projet').count(), 0);
  });
});

test('les autres boutons du menu « Plus » restent, dans le même ordre', async () => {
  await withPanel({ viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    const items = await menuItems(page);
    assert.deepEqual(items.slice(0, 3), ['Signaler un bug', 'Review générale', 'Stack technique']);
  });
});
