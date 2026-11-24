// Journeys of issue #271: the machine of the factory jobs, dev server or GitHub's machines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';
import { repoKey } from '../panel/machine.mjs';

const H = await repoKey(1);
const open = async (page, url) => {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Paramètres' }).click();
  await page.getByText('Avancé', { exact: true }).click(); // issue #342: the machine is under « Avancé »
  await page.getByRole('group', { name: 'Machine des tâches', exact: true }).waitFor();
};
// The general machine moved to « Réglages généraux » (issue #544).
const openGeneral = async (page, url) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Réglages généraux' }).click();
  await page.getByRole('group', { name: 'Machine des tâches', exact: true }).waitFor();
};
const decode = (w) => JSON.parse(Buffer.from(w.body.content, 'base64').toString('utf8'));

test('le panneau montre le réglage général et le réglage de chaque projet', async () => {
  await withPanel({}, async ({ page, url }) => {
    await open(page, url);
    await page.getByRole('button', { name: 'Changer le réglage de tous les projets' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    assert.equal(await page.getByRole('group', { name: 'Machine des tâches', exact: true }).getByRole('radio', { name: 'Serveur de dev', exact: true }).isChecked(), true);
    await page.getByRole('button', { name: '← Retour au projet' }).click();
    assert.equal(await page.getByRole('radio', { name: /Comme le réglage de tous les projets/ }).isChecked(), true);
    await page.getByRole('radio', { name: 'Machines GitHub' }).first().waitFor();
  });
});

test('sans clé, le panneau affiche « clé d\'accès manquante »', async () => {
  await withPanel({ factoryFiles: { 'status.json': { key: 'missing', projects: {} } } }, async ({ page, url }) => {
    await open(page, url);
    await page.getByText("Serveur de dev : clé d'accès manquante.", { exact: false }).waitFor();
  });
});

test('avec la clé et le serveur allumé, le panneau affiche « en ligne »', async () => {
  await withPanel({ factoryFiles: { 'status.json': { key: 'ok', projects: { [H]: { reason: 'online' } } } } }, async ({ page, url }) => {
    await open(page, url);
    await page.getByText('Serveur de dev : en ligne.').waitFor();
  });
});

test('serveur éteint : le panneau affiche « hors ligne, GitHub en secours »', async () => {
  await withPanel({ factoryFiles: { 'status.json': { key: 'ok', projects: { [H]: { reason: 'offline' } } } } }, async ({ page, url }) => {
    await open(page, url);
    await page.getByText('Serveur de dev : hors ligne, GitHub en secours.').waitFor();
  });
});

test('un projet public tourne toujours sur GitHub', async () => {
  await withPanel({ publicRepos: ['o/r'], factoryFiles: { 'status.json': { key: 'ok', projects: {} } } }, async ({ page, url }) => {
    await open(page, url);
    await page.getByText(/Projet public : ses tâches tournent toujours sur les machines GitHub/).waitFor();
  });
});

test('je choisis les machines GitHub pour ce projet, et le contrôle est relancé', async () => {
  await withPanel({}, async ({ page, url, writes }) => {
    await open(page, url);
    await page.locator('#machine-project-github').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés.', { exact: false }).waitFor({ timeout: 5000 });
    const put = writes.find((w) => w.method === 'PUT' && w.path === '/repos/o/r/contents/factory.config.json');
    assert.equal(decode(put).machine, 'github');
    assert.ok(writes.some((w) => w.method === 'POST' && w.path === '/repos/phoibe/factory/actions/workflows/runners.yml/dispatches'));
    assert.ok(!writes.some((w) => w.path.endsWith('/settings.json')), 'the general setting did not change');
  });
});

test('je change le réglage général pour tous les projets', async () => {
  await withPanel({ factoryFiles: { 'settings.json': { machine: 'dev-server', labels: ['self-hosted'] } } }, async ({ page, url, writes }) => {
    await openGeneral(page, url);
    await page.locator('#machine-general-github').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés.', { exact: false }).waitFor({ timeout: 5000 });
    const put = writes.find((w) => w.method === 'PUT' && w.path === '/repos/phoibe/factory/contents/settings.json');
    assert.equal(put.body.branch, 'factory-runners');
    assert.deepEqual(decode(put), { machine: 'github', labels: ['self-hosted'], models: { plan: 'fable', code: 'opus', review: 'fable', simple: 'sonnet' } });
    assert.ok(!writes.some((w) => w.path === '/repos/o/r/contents/factory.config.json'), 'the project rules did not change');
  });
});

test('« Tous les projets » n\'est plus dans « Avancé » : un lien mène à la page des réglages généraux', async () => {
  await withPanel({}, async ({ page, url }) => {
    await open(page, url);
    const project = page.getByRole('region', { name: 'Ce projet : r' });
    await project.getByRole('group', { name: 'Site en ligne' }).waitFor();
    await project.getByRole('group', { name: 'Étapes' }).waitFor();
    await project.getByRole('group', { name: 'Moteur des agents' }).waitFor();
    await project.getByRole('radio', { name: /Comme le réglage de tous les projets/ }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Tous les projets' }).count(), 0);
    assert.equal(await page.getByRole('group', { name: 'Machine des tâches par défaut' }).count(), 0);
    assert.equal(await page.locator('.rules-section .savebar').count(), 0, 'one save button');
    await page.getByRole('button', { name: 'Changer le réglage de tous les projets' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    const machine = page.getByRole('group', { name: 'Machine des tâches', exact: true });
    await machine.getByRole('radio').first().waitFor();
    assert.equal(await machine.getByRole('radio').count(), 2);
  });
});
