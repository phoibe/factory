// Journeys of issue #504: a private project the dev server's key does not see is announced in the panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';
import { repoKey } from '../panel/machine.mjs';

const [H1, H2] = [await repoKey(1), await repoKey(2)];
const recent = () => new Date(Date.now() - 5 * 60_000).toISOString();
// The dev server's last check, a few minutes ago, saw only the projects whose key is given.
const checked = (...seen) => ({ 'status.json': { key: 'ok', checkedAt: recent(), projects: Object.fromEntries(seen.map((h) => [h, { machine: 'dev-server', reason: 'online' }])) } });
const banner = (page) => page.locator('#runner-alert');

test('le bandeau orange nomme le projet oublié, et son bouton ouvre la page des clés GitHub', async () => {
  await withPanel({ repos: ['o/r', 'o/pulsar'], factoryFiles: checked(H1) }, async ({ page, url }) => {
    await page.goto(url);
    await banner(page).getByText("pulsar n'est pas vu par le serveur de dev : ses tâches consomment vos minutes GitHub.").waitFor();
    const link = banner(page).getByRole('link', { name: /Ajouter à la clé factory runners/ });
    assert.equal(await link.getAttribute('href'), 'https://github.com/settings/personal-access-tokens');
    await banner(page).getByText('Cliquez sur factory runners, cochez le projet, puis enregistrez.').waitFor();
  });
});

test('plusieurs projets oubliés : un seul bandeau qui les nomme tous', async () => {
  await withPanel({ repos: ['o/r', 'o/pulsar'], factoryFiles: checked() }, async ({ page, url }) => {
    await page.goto(url);
    await banner(page).getByText(/r et pulsar ne sont pas vus par le serveur de dev/).waitFor();
    assert.equal(await page.locator('#runner-alert').count(), 1);
  });
});

test("l'onglet du projet concerné porte le signal orange", async () => {
  await withPanel({ repos: ['o/r', 'o/pulsar'], factoryFiles: checked(H1) }, async ({ page, url }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(url);
    const list = page.locator('#projects-list');
    await list.locator('[data-repo="o/pulsar"]').getByRole('img', { name: 'Pas vu par le serveur de dev' }).waitFor();
    assert.equal(await list.locator('[data-repo="o/r"] .pwarn').count(), 0);
  });
});

test("les réglages du projet affichent l'avertissement à la place de « pris en compte au prochain contrôle »", async () => {
  await withPanel({ factoryFiles: checked() }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    const rules = page.locator('#rules');
    await rules.getByText("Serveur de dev : ce projet n'est pas vu par le serveur de dev", { exact: false }).waitFor();
    await rules.getByRole('link', { name: /Ajouter à la clé factory runners/ }).waitFor();
    assert.equal(await rules.getByText(/pris en compte au prochain contrôle/).count(), 0);
  });
});

test('un projet public, ou réglé « machines GitHub », ne fait apparaître aucun bandeau', async () => {
  await withPanel({ repos: ['o/r', 'o/pub'], publicRepos: ['o/pub'], config: { machine: 'github' }, factoryFiles: checked() }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).waitFor();
    await page.waitForTimeout(800);
    assert.equal(await banner(page).isHidden(), true);
  });
});

test('un projet coché dans la clé (présent dans le contrôle) ne fait apparaître aucun bandeau', async () => {
  await withPanel({ repos: ['o/r', 'o/pulsar'], factoryFiles: checked(H1, H2) }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).waitFor();
    await page.waitForTimeout(800);
    assert.equal(await banner(page).isHidden(), true);
  });
});

test("un projet tout neuf, créé après le dernier contrôle, n'est pas encore signalé", async () => {
  await withPanel({ repos: ['o/r', 'o/neuf'], created: { 'o/neuf': new Date().toISOString() }, factoryFiles: checked(H1) }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).waitFor();
    await page.waitForTimeout(800);
    assert.equal(await banner(page).isHidden(), true);
  });
});
