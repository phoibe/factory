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
    await page.getByText('Réglages généraux enregistrés', { exact: false }).waitFor({ timeout: 5000 });
    const put = writes.find((w) => w.method === 'PUT' && w.path === '/repos/phoibe/factory/contents/settings.json');
    assert.equal(put.body.branch, 'factory-runners');
    assert.deepEqual(decode(put), { machine: 'github', labels: ['self-hosted'], models: {} });
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

// Review #556, finding 6: the banner's round reads the check again (every 15 minutes); « Paramètres » was rebuilt
// from the saved settings, losing what the owner was typing and the focus.
test('une nouvelle lecture du contrôle garde ce que je tape dans « Adresse du site » et le focus', async () => {
  const factoryFiles = { 'status.json': { key: 'ok', checkedAt: new Date(Date.now() - 60_000).toISOString(), projects: { [H]: { machine: 'dev-server', reason: 'online' } } } };
  await withPanel({ factoryFiles }, async ({ page, url, reads }) => {
    // The banner's 15-minute round, fired on demand.
    await page.addInitScript(() => {
      const real = window.setTimeout;
      window.setTimeout = (fn, ms, ...rest) => { if (ms === 15 * 60_000) window.runnerRound = fn; return real(fn, ms, ...rest); };
    });
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    const field = page.getByLabel('Adresse du site');
    await field.click();
    await field.pressSequentially('https://exemple.fr');
    const round = async () => {
      const before = reads.filter((r) => r.endsWith('/contents/status.json')).length;
      await page.evaluate(() => window.runnerRound());
      for (let i = 0; i < 100 && reads.filter((r) => r.endsWith('/contents/status.json')).length === before; i++) await page.waitForTimeout(50);
      await page.waitForTimeout(500);
    };
    factoryFiles['status.json'] = { ...factoryFiles['status.json'], checkedAt: new Date().toISOString() };
    await round();
    assert.equal(await field.inputValue(), 'https://exemple.fr');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'site-url');
    // A real change waits until the owner leaves the form, then shows at once.
    factoryFiles['status.json'] = { ...factoryFiles['status.json'], projects: { [H]: { machine: 'dev-server', reason: 'offline' } } };
    await round();
    assert.equal(await field.inputValue(), 'https://exemple.fr');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'site-url');
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Avancé', { exact: true }).click();
    await page.getByText('Serveur de dev : hors ligne, GitHub en secours.').waitFor({ timeout: 2000 });
  });
});

// Review #556, round 2, finding 2: the owner opened « Avancé » to read the line (the focus is on its summary), then
// left the form without typing. The change that came meanwhile must show, not wait for another one.
const roundOnDemand = () => { const real = window.setTimeout; window.setTimeout = (fn, ms, ...rest) => { if (ms === 15 * 60_000) window.runnerRound = fn; return real(fn, ms, ...rest); }; };
const roundOf = (page, reads) => async () => {
  const before = reads.filter((r) => r.endsWith('/contents/status.json')).length;
  await page.evaluate(() => window.runnerRound());
  for (let i = 0; i < 100 && reads.filter((r) => r.endsWith('/contents/status.json')).length === before; i++) await page.waitForTimeout(50);
  await page.waitForTimeout(500);
};
test('le serveur de dev passe hors ligne pendant que je lis « Avancé » : la ligne le dit dès que je quitte le formulaire', async () => {
  const factoryFiles = { 'status.json': { key: 'ok', checkedAt: new Date(Date.now() - 60_000).toISOString(), projects: { [H]: { machine: 'dev-server', reason: 'online' } } } };
  await withPanel({ factoryFiles }, async ({ page, url, reads }) => {
    await page.addInitScript(roundOnDemand);
    await open(page, url);
    await page.getByText('Serveur de dev : en ligne.').waitFor();
    factoryFiles['status.json'] = { ...factoryFiles['status.json'], projects: { [H]: { machine: 'dev-server', reason: 'offline' } } };
    const round = roundOf(page, reads);
    await round();
    await round(); // a second round finds nothing new in the file
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Serveur de dev : hors ligne, GitHub en secours.').waitFor({ timeout: 2000 });
  });
});

// Only the time of the check changes, but the line depends on it: a recent check that does not list this private
// project says so, with its orange box.
test('un contrôle récent qui ne voit pas le projet change la ligne même si seule son heure a changé', async () => {
  const factoryFiles = { 'status.json': { key: 'ok', checkedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(), projects: {} } };
  await withPanel({ factoryFiles }, async ({ page, url, reads }) => {
    await page.addInitScript(roundOnDemand);
    await open(page, url);
    await page.getByText('Serveur de dev : réglage pris en compte au prochain contrôle', { exact: false }).waitFor();
    await page.getByRole('tab', { name: 'Paramètres' }).click(); // the focus is out of the form
    factoryFiles['status.json'] = { ...factoryFiles['status.json'], checkedAt: new Date().toISOString() };
    await roundOf(page, reads)();
    await page.locator('#rules .runner-alert').getByText("Ce projet n'est pas vu par le serveur de dev", { exact: false }).waitFor({ timeout: 2000 });
  });
});
