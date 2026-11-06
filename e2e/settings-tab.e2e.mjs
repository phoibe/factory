// Journeys of issue #250: the « Règles » tab is now called « Paramètres ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

test('le troisième onglet, après « Suivi » et « Agent », s\'appelle « Paramètres »', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    const tabs = await page.getByRole('tab').allTextContents();
    assert.deepEqual(tabs.map((t) => t.trim()).slice(0, 3), ['Suivi', 'Agent', 'Paramètres']);
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

test('sur téléphone, le message « Paramètres enregistrés » se lit en entier, au-dessus de la barre d\'enregistrement', async () => {
  await withPanel({ viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.locator('#stage-plan').click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.locator('#toast.show').waitFor();
    const hidden = await page.evaluate(() => {
      const toast = document.getElementById('toast');
      toast.style.pointerEvents = 'auto'; // elementFromPoint skips pointer-events: none
      const r = toast.getBoundingClientRect();
      const points = [[r.left + 8, r.top + 8], [r.right - 8, r.bottom - 8], [r.left + r.width / 2, r.bottom - 8]];
      return points.filter(([x, y]) => !toast.contains(document.elementFromPoint(x, y))).length;
    });
    assert.equal(hidden, 0, 'part of the toast is covered');
  });
});
