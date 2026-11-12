// The automatic checks' time limit is a project setting (Pulsars: heavy suites queue on their server).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const savedRules = (writes) => {
  const put = writes.filter((w) => w.method === 'PUT' && w.path.endsWith('/contents/factory.config.json')).pop();
  return put && JSON.parse(Buffer.from(put.body.content, 'base64').toString('utf8'));
};

test('dans Paramètres, la durée maximale des contrôles vaut 30 minutes, et je la passe à 90', async () => {
  await withPanel({}, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Avancé', { exact: true }).click(); // issue #342: technical settings are folded
    const field = page.getByLabel('Durée maximale des contrôles (minutes)');
    assert.equal(await field.inputValue(), '30');
    await field.fill('90');
    await field.press('Tab');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés.', { exact: false }).waitFor({ timeout: 5000 });
    assert.equal(savedRules(writes).checksMinutes, 90);
  });
});

test('une durée hors de 5 à 180 minutes est refusée et l\'ancienne valeur revient', async () => {
  await withPanel({ config: { checksMinutes: 90 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Avancé', { exact: true }).click(); // issue #342: technical settings are folded
    const field = page.getByLabel('Durée maximale des contrôles (minutes)');
    assert.equal(await field.inputValue(), '90');
    await field.fill('500');
    await field.press('Tab');
    await page.getByText('Entre 5 et 180 minutes.').waitFor({ timeout: 5000 });
    assert.equal(await field.inputValue(), '90');
  });
});
