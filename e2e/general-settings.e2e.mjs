// Journeys of issue #544: the « Réglages généraux » page (models of the agents, machine of the tasks).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';
import { MODEL_FAMILIES, familyLabel } from '../scripts/lib/models.mjs';

const decode = (w) => JSON.parse(Buffer.from(w.body.content, 'base64').toString('utf8'));
const openPage = async (page, url) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Réglages généraux' }).click();
  await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
};
const labelOf = (id) => familyLabel(MODEL_FAMILIES.find((f) => f.id === id));
const roles = ['Plans et organisation', 'Écriture du code', 'Revue', 'Tâches simples'];
const chosen = (page) => Promise.all(roles.map((r) => page.getByRole('combobox', { name: r }).evaluate((s) => s.selectedOptions[0].textContent)));

test('la barre du haut montre Réglages généraux avant Se déconnecter et le retour ramène au projet', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    const labels = (await page.locator('#nav [data-menu]').allTextContents()).map((t) => t.trim());
    assert.equal(labels.at(-1), 'Se déconnecter');
    assert.equal(labels.at(-2), 'Réglages généraux');
    await page.locator('#general-open').click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    assert.equal(await page.locator('.project-head').isVisible(), false);
    assert.equal(await page.locator('#general-open').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('tab', { name: 'Paramètres' }).isVisible(), false);
    await page.getByRole('button', { name: '← Retour au projet' }).click();
    assert.equal(await page.locator('.project-head').isVisible(), true);
    assert.equal(await page.getByRole('tab', { name: 'Paramètres' }).getAttribute('aria-selected'), 'true', 'the project is as it was');
    assert.equal(await page.getByRole('heading', { name: 'Réglages généraux' }).count(), 0);
  });
});

test('la page montre Fable, Opus, Fable, Sonnet par défaut avec leur version et la machine des tâches', async () => {
  await withPanel({}, async ({ page, url }) => {
    await openPage(page, url);
    assert.deepEqual(await chosen(page), ['fable', 'opus', 'fable', 'sonnet'].map(labelOf));
    assert.equal(await page.getByRole('combobox', { name: 'Écriture du code' }).locator('option').count(), MODEL_FAMILIES.length);
    await page.getByText('Prépare les questions et la fiche de chaque demande, écrit les plans et organise le développement.').waitFor();
    await page.getByText(/L’agent qui pilote chaque lancement garde le modèle de la routine du projet sur claude\.ai/).waitFor();
    await page.getByRole('group', { name: 'Modèles' }).waitFor();
    const machine = page.getByRole('group', { name: 'Machine des tâches' });
    assert.equal(await machine.getByRole('radio', { name: 'Serveur de dev' }).isChecked(), true);
    await machine.getByRole('radio', { name: 'Machines GitHub' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
  });
});

test('un modèle changé est enregistré avec la machine et les autres réglages gardés', async () => {
  await withPanel({ factoryFiles: { 'settings.json': { machine: 'dev-server', labels: ['self-hosted'] } } }, async ({ page, url, writes }) => {
    await openPage(page, url);
    await page.getByRole('combobox', { name: 'Écriture du code' }).selectOption('sonnet');
    await page.getByRole('radio', { name: 'Machines GitHub' }).check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Réglages généraux enregistrés : ils servent dès le prochain lancement.', { exact: false }).waitFor({ timeout: 5000 });
    const puts = writes.filter((w) => w.method === 'PUT' && w.path === '/repos/phoibe/factory/contents/settings.json');
    assert.equal(puts.length, 1);
    assert.equal(puts[0].body.branch, 'factory-runners');
    assert.deepEqual(decode(puts[0]), { machine: 'github', labels: ['self-hosted'], models: { code: 'sonnet' } });
    assert.ok(writes.some((w) => w.method === 'POST' && w.path === '/repos/phoibe/factory/actions/workflows/runners.yml/dispatches'));
    assert.ok(!writes.some((w) => w.path === '/repos/o/r/contents/factory.config.json'), 'the project rules did not change');
  });
});

test('un modèle seul changé n\'attend pas le contrôle des machines', async () => {
  await withPanel({ factoryFiles: { 'settings.json': { machine: 'dev-server' } } }, async ({ page, url, writes }) => {
    await openPage(page, url);
    await page.getByRole('combobox', { name: 'Revue' }).selectOption('opus');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Réglages généraux enregistrés', { exact: false }).waitFor({ timeout: 5000 });
    assert.ok(!writes.some((w) => w.path.endsWith('/runners.yml/dispatches')));
  });
});

test('les choix enregistrés s\'affichent au retour sur la page', async () => {
  await withPanel({ factoryFiles: { 'settings.json': { machine: 'github', models: { plan: 'opus', code: 'haiku', review: 'sonnet', simple: 'fable' } } } }, async ({ page, url }) => {
    await openPage(page, url);
    const saved = ['opus', 'haiku', 'sonnet', 'fable'].map(labelOf);
    assert.deepEqual(await chosen(page), saved);
    assert.equal(await page.getByRole('radio', { name: 'Machines GitHub' }).isChecked(), true);
    await page.getByRole('button', { name: '← Retour au projet' }).click();
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    assert.deepEqual(await chosen(page), saved);
  });
});

test('l\'onglet Paramètres n\'a plus Tous les projets et son lien ouvre la page', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Avancé', { exact: true }).click();
    await page.getByRole('group', { name: 'Machine des tâches', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Tous les projets' }).count(), 0);
    assert.equal(await page.getByRole('group', { name: 'Machine des tâches par défaut' }).count(), 0);
    await page.getByRole('radio', { name: /Comme le réglage de tous les projets/ }).waitFor();
    await page.getByRole('button', { name: 'Changer le réglage de tous les projets' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
  });
});

test('sur téléphone la page tient sur une colonne', async () => {
  await withPanel({ viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    await page.getByText('Plus', { exact: true }).click();
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth,
      selects: [...document.querySelectorAll('#general-view select')].map((s) => Math.round(s.getBoundingClientRect().right)) }));
    assert.ok(m.scroll <= m.width, `horizontal scroll: ${m.scroll} > ${m.width}`);
    assert.ok(m.selects.length === 4 && m.selects.every((r) => r <= m.width), JSON.stringify(m));
  });
});

test('un choix non enregistré reste là quand je reviens sur la page', async () => {
  await withPanel({}, async ({ page, url }) => {
    await openPage(page, url);
    await page.getByRole('combobox', { name: 'Revue' }).selectOption('haiku');
    await page.getByRole('button', { name: '← Retour au projet' }).click();
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Revue' }).inputValue(), 'haiku');
    await page.getByText('Modifications non enregistrées').waitFor();
    // Clicking the top button while on the page keeps it too.
    await page.getByRole('button', { name: 'Réglages généraux', exact: true }).click();
    assert.equal(await page.getByRole('combobox', { name: 'Revue' }).inputValue(), 'haiku');
  });
});

test('un réglage qui ne se lit pas n\'est pas remplacé par les valeurs par défaut', async () => {
  for (const factoryFiles of [{ 'settings.json': 'pas du json {' }, null]) {
    await withPanel(factoryFiles ? { factoryFiles } : { failing: new Set(['/repos/phoibe/factory/contents/settings.json']) }, async ({ page, url }) => {
      await openPage(page, url);
      await page.getByText('Impossible de lire les réglages actuels. Réessayez dans un instant.').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), true);
      for (const r of roles) assert.equal(await page.getByRole('combobox', { name: r }).isDisabled(), true, `${r} disabled`);
      for (const radio of await page.locator('#general input[type=radio]').all()) assert.equal(await radio.isDisabled(), true);
      assert.equal(await page.locator('#general').getByText('Tout est enregistré').count(), 0, 'nothing claims to be saved');
    });
  }
});

test('un réglage jamais créé (404) montre les valeurs par défaut sans erreur', async () => {
  await withPanel({}, async ({ page, url }) => {
    await openPage(page, url);
    assert.equal(await page.getByText('Impossible de lire les réglages actuels').count(), 0);
  });
});

test('le focus va sur le titre à l\'ouverture et revient au bouton du haut à la fermeture', async () => {
  await withPanel({}, async ({ page, url }) => {
    await openPage(page, url);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'general-title');
    await page.getByRole('button', { name: '← Retour au projet' }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'general-open');
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByText('Avancé', { exact: true }).click();
    await page.getByRole('button', { name: 'Changer le réglage de tous les projets' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    await page.getByRole('button', { name: '← Retour au projet' }).click();
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Changer le réglage de tous les projets');
  });
});

test('sur téléphone le focus revient sur « Plus » quand le bouton du haut est caché', async () => {
  await withPanel({ viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    assert.equal(await page.locator('#general-open').getAttribute('aria-pressed'), 'false', 'in the markup');
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    await page.getByText('Plus', { exact: true }).click();
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    await page.getByRole('button', { name: '← Retour au projet' }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.parentElement?.id), 'SUMMARY:more');
  });
});

// Review #556, finding 1: GitHub lets the browser keep the settings 60 s; the second save must send the sha the first
// one left, and the reopened page must show what was saved. (Playwright's routing bypasses the HTTP cache: the unit
// test in test/panel-machine.test.mjs pins the no-store read; this one guards the journey.)
test('deux enregistrements de suite passent et la page rouverte montre le dernier', async () => {
  await withPanel({}, async ({ page, url }) => {
    const file = { text: JSON.stringify({ machine: 'dev-server' }), n: 1 };
    const puts = [];
    await page.route('https://api.github.com/repos/phoibe/factory/contents/settings.json**', async (route) => {
      const req = route.request();
      const headers = { 'cache-control': 'private, max-age=60, s-maxage=60' };
      if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ content: Buffer.from(file.text).toString('base64'), encoding: 'base64', sha: `v${file.n}` }) });
      const body = req.postDataJSON();
      puts.push(body.sha);
      if (body.sha !== `v${file.n}`) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'sha mismatch' }) });
      file.text = Buffer.from(body.content, 'base64').toString('utf8');
      file.n += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: `v${file.n}` } }) });
    });
    await openPage(page, url);
    await page.getByRole('combobox', { name: 'Revue' }).selectOption('opus');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Réglages généraux enregistrés', { exact: false }).waitFor({ timeout: 5000 });
    await page.getByRole('combobox', { name: 'Revue' }).selectOption('haiku');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.waitForFunction(() => document.querySelector('#general')?.textContent.includes('Tout est enregistré'), null, { timeout: 5000 });
    assert.deepEqual(puts, ['v1', 'v2']);
    await page.getByRole('button', { name: '← Retour au projet' }).click();
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Revue' }).inputValue(), 'haiku');
  });
});
