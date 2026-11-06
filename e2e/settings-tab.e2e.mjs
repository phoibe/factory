// Journeys of issue #250: the « Règles » tab is now called « Paramètres ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

test('le troisième onglet, après « Suivi » et « Discussion », s\'appelle « Paramètres »', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    const tabs = await page.getByRole('tab').allTextContents();
    assert.deepEqual(tabs.map((t) => t.trim()).slice(0, 3), ['Suivi', 'Discussion', 'Paramètres']);
  });
});

test('après un enregistrement, je vois « Paramètres enregistrés. Ils s\'appliquent dans une minute environ. »', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.locator('#stage-plan').click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés. Ils s\'appliquent dans une minute environ.').waitFor({ timeout: 5000 });
  });
});

test('le mot « Règles » n\'apparaît plus nulle part dans le panneau', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    assert.doesNotMatch(await page.locator('body').innerText(), /Règles/);
  });
});
