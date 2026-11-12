// Journeys of issue #342: the technical settings are folded under « Avancé ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';
import { repoKey } from '../panel/machine.mjs';

const openSettings = async (page, url) => {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Paramètres' }).click();
  await page.getByRole('group', { name: 'Étapes' }).waitFor();
};
const advanced = (page) => page.locator('details.advanced');
const savedRules = (writes) => {
  const put = writes.filter((w) => w.method === 'PUT' && w.path.endsWith('/contents/factory.config.json')).pop();
  return put && JSON.parse(Buffer.from(put.body.content, 'base64').toString('utf8'));
};

test('en ouvrant « Paramètres », je vois les cinq choix et un bloc « Avancé » replié avec sa ligne de résumé', async () => {
  await withPanel({}, async ({ page, url }) => {
    await openSettings(page, url);
    const legends = (await page.locator('#rules > .rules-section > fieldset > legend').allTextContents()).map((t) => t.trim());
    assert.deepEqual(legends, ['Mise en production', 'Site en ligne', 'Étapes', 'Demandes en parallèle']);
    assert.equal(await page.getByRole('checkbox', { name: 'Prendre une demande ouverte quand une place se libère' }).isVisible(), true);
    assert.equal(await page.getByLabel('Fonctionnalités construites en même temps').isVisible(), true);
    assert.equal(await advanced(page).evaluate((d) => d.open), false);
    assert.match(await advanced(page).locator(':scope > summary').innerText(), /Avancé[\s\S]*Serveur de dev · \d+ contrôles? sur 7 · /);
    assert.equal(await page.getByRole('group', { name: 'Moteur des agents' }).isVisible(), false);
  });
});

test('la case « En attente de vos réponses, au plus » a gardé son nom et sa place', async () => {
  await withPanel({ config: { autoPick: true } }, async ({ page, url }) => {
    await openSettings(page, url);
    const field = page.getByLabel('En attente de vos réponses, au plus');
    assert.equal(await field.isVisible(), true);
    assert.equal(await page.locator('.sub-setting #maxQuestions').count(), 1);
    assert.equal(await page.locator('#autoPick ~ div .sub-setting #maxQuestions').count(), 1);
  });
});

test('en ouvrant « Avancé », je retrouve la machine des tâches, le moteur des agents, les contrôles et les savoir-faire', async () => {
  await withPanel({}, async ({ page, url }) => {
    await openSettings(page, url);
    await page.getByText('Avancé', { exact: true }).click();
    for (const name of ['Machine des tâches', 'Moteur des agents', 'Contrôles automatiques', 'Contrôles supplémentaires', 'Machine des tâches par défaut']) {
      assert.equal(await page.getByRole('group', { name, exact: true }).isVisible(), true, name);
    }
    assert.ok(await advanced(page).getByRole('group', { name: /^Savoir-faire : / }).count() > 0);
  });
});

test('je change un réglage dans « Avancé », je le replie, j\'enregistre : le changement est bien enregistré', async () => {
  await withPanel({}, async ({ page, url, writes }) => {
    await openSettings(page, url);
    await page.getByText('Avancé', { exact: true }).click();
    await page.locator('#check-lint').click();
    assert.equal(await advanced(page).evaluate((d) => d.open), true, 'a change does not fold it back');
    await page.getByText('Avancé', { exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés.', { exact: false }).waitFor({ timeout: 5000 });
    assert.equal(savedRules(writes).checks.lint, false);
  });
});

test('je laisse « Avancé » ouvert, je recharge la page : il est toujours ouvert', async () => {
  await withPanel({}, async ({ page, url }) => {
    await openSettings(page, url);
    await page.getByText('Avancé', { exact: true }).click();
    await page.reload();
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByRole('group', { name: 'Moteur des agents' }).waitFor();
    assert.equal(await advanced(page).evaluate((d) => d.open), true);
  });
});

test('une alerte de machine s\'affiche au-dessus de « Avancé », même replié', async () => {
  const H = await repoKey(1);
  await withPanel({ factoryFiles: { 'status.json': { key: 'ok', projects: { [H]: { reason: 'offline' } } } } }, async ({ page, url }) => {
    await openSettings(page, url);
    const alert = page.getByText('Serveur de dev : hors ligne, GitHub en secours.');
    await alert.waitFor();
    assert.equal(await alert.count(), 1, 'shown once');
    assert.equal(await page.locator('.machine-alert + details.advanced').count(), 1);
  });
});

test('quand tout va bien, aucune alerte de machine au-dessus de « Avancé »', async () => {
  const H = await repoKey(1);
  await withPanel({ factoryFiles: { 'status.json': { key: 'ok', projects: { [H]: { reason: 'online' } } } } }, async ({ page, url }) => {
    await openSettings(page, url);
    await advanced(page).waitFor();
    assert.equal(await page.locator('.machine-alert').count(), 0);
  });
});
