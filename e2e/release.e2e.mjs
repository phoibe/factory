// Journeys of issue #294: production on the owner's approval, with the « Mise en production » button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const approval = { production: 'approval' };
const pending = [
  issue(11, 'Ajout du mode sombre', ['factory:awaiting-production'], { state: 'closed', pull_request: { merged_at: '2026-11-08T10:00:00Z' } }),
  issue(12, 'Correction du menu', ['factory:awaiting-production'], { state: 'closed', pull_request: { merged_at: '2026-11-08T11:00:00Z' } }),
];
const button = (page) => page.locator('#release');

test('dans les paramètres d\'un projet, le choix « Mise en production » existe et vaut « automatique » par défaut', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.getByRole('group', { name: 'Mise en production' }).waitFor();
    assert.equal(await page.locator('#production-auto').isChecked(), true);
    assert.equal(await page.locator('#production-approval').isChecked(), false);
  });
});

test('sur un projet « automatique », le haut de la page est inchangé : pas de bouton « Mise en production »', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#new-feature').waitFor();
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    assert.equal(await button(page).isVisible(), false);
  });
});

test('sur un projet « sur mon accord » sans rien en attente, le bouton est à côté de « Nouvelle fonctionnalité », grisé, avec « Rien en attente »', async () => {
  await withPanel({ config: approval }, async ({ page, url, writes }) => {
    await page.goto(url);
    await button(page).waitFor();
    assert.equal((await button(page).textContent()).trim(), 'Mise en production');
    assert.equal(await button(page).getAttribute('aria-disabled'), 'true');
    assert.equal(await button(page).getAttribute('title'), 'Rien en attente');
    const next = await page.evaluate(() => document.getElementById('new-feature').nextElementSibling?.id);
    assert.equal(next, 'release');
    // Playwright waits forever on an aria-disabled button; a finger or a mouse still taps it.
    await button(page).click({ force: true });
    await page.locator('#toast', { hasText: 'Rien en attente' }).waitFor();
    assert.equal(await page.locator('#release-dialog').isVisible(), false);
    assert.equal(writes.length, 0);
  });
});

test('sur téléphone, le bouton reste visible en haut à côté de « Plus », pas dans le menu', async () => {
  await withPanel({ config: approval, awaiting: pending, viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    await button(page).waitFor();
    assert.equal(await button(page).isVisible(), true);
    assert.equal(await page.evaluate(() => document.getElementById('more-menu').contains(document.getElementById('release'))), false);
  });
});

test('avec deux modifications validées en attente, le bouton affiche « Mise en production (2) »', async () => {
  await withPanel({ config: approval, awaiting: pending }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).waitFor();
  });
});

test('le clic ouvre la confirmation avec les deux titres ; « Annuler » ne change rien', async () => {
  await withPanel({ config: approval, awaiting: pending }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Mettre en production ces 2 modifications ?' });
    await dialog.waitFor();
    await dialog.getByText('Ajout du mode sombre').waitFor();
    await dialog.getByText('Correction du menu').waitFor();
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(writes.length, 0);
    await page.getByRole('button', { name: 'Mise en production (2)' }).waitFor();
  });
});

test('« Confirmer » demande la mise en production des deux modifications, puis le bouton redevient grisé', async () => {
  await withPanel({ config: approval, awaiting: pending }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
    await page.getByText(/Mise en production lancée/).waitFor();
    const sent = writes.find((w) => w.method === 'POST' && w.path === '/repos/o/r/issues');
    assert.deepEqual(sent.body.labels, ['factory:production']);
    assert.match(sent.body.body, /Ajout du mode sombre/);
    assert.equal(await button(page).getAttribute('aria-disabled'), 'true');
  });
});

test('passer un projet « sur mon accord » crée la branche « preprod » où les modifications attendront', async () => {
  await withPanel({ branches: { main: 'm1' } }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.locator('#production-approval').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés. Ils s\'appliquent dans une minute environ.').waitFor({ timeout: 5000 });
    const ref = writes.find((w) => w.path === '/repos/o/r/git/refs');
    assert.deepEqual(ref?.body, { ref: 'refs/heads/preprod', sha: 'm1' });
    await button(page).waitFor();
  });
});

test('repasser le projet en « automatique » avec une modification en attente l\'envoie en ligne aussitôt', async () => {
  await withPanel({ config: approval, awaiting: pending.slice(0, 1) }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (1)' }).waitFor();
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.locator('#production-auto').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Paramètres enregistrés. 1 modification mise en ligne.').waitFor({ timeout: 5000 });
    const sent = writes.find((w) => w.method === 'POST' && w.path === '/repos/o/r/issues');
    assert.deepEqual(sent?.body.labels, ['factory:production']);
    assert.equal(await button(page).isVisible(), false);
  });
});

test('si l\'envoi échoue, la fenêtre reste ouverte et dit « L\'envoi a échoué. Réessayez. »', async () => {
  await withPanel({ config: approval, awaiting: pending, forbidden: new Set(['/repos/o/r/issues']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Confirmer' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'L\'envoi a échoué. Réessayez.' }).waitFor();
    assert.equal(await dialog.isVisible(), true);
  });
});

// The stack sheet says how the project goes to production: « Manuelle » (a merge deploys nothing) is shown by itself.
const manualSheet = { files: { 'STACK.md': '# Stack technique\n\n## Mise en production\n- **Manuelle** — `git push prod main vX.Y.Z` depuis votre poste, après la publication d\'une version\n' } };

test('sans mode choisi, une fiche stack « Manuelle » : « Mise en production externe » sous le nom du projet, sans bouton', async () => {
  await withPanel({ ...manualSheet, awaiting: pending }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#project-sub', { hasText: 'Mise en production externe' }).waitFor();
    assert.equal(await button(page).isVisible(), false);
  });
});

test('sans mode choisi, une fiche stack « Manuelle » : « Externe » est coché, proposé par la fiche, et je peux en changer', async () => {
  await withPanel(manualSheet, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.locator('#project-sub', { hasText: 'Mise en production externe' }).waitFor();
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    const group = page.getByRole('group', { name: 'Mise en production' });
    await group.getByText('Proposé par la fiche stack.').waitFor();
    assert.equal(await page.locator('#production-external').isChecked(), true);
    await page.locator('#production-auto').check();
    assert.equal(await page.locator('#production-auto').isChecked(), true);
    assert.equal(await group.getByText('Proposé par la fiche stack.').count(), 0);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.locator('#toast', { hasText: 'Paramètres enregistrés' }).waitFor();
    const saved = writes.map((w) => w.body?.content).filter(Boolean).map((c) => JSON.parse(Buffer.from(c, 'base64').toString('utf8')));
    assert.equal(saved.at(-1)?.production, 'auto');
    assert.doesNotMatch(await page.locator('#project-sub').textContent(), /externe/);
  });
});

test('« Externe » choisi dans les paramètres : la mention apparaît même sans fiche stack', async () => {
  await withPanel({ config: { production: 'external' } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#project-sub', { hasText: 'Mise en production externe' }).waitFor();
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    assert.equal(await page.locator('#production-external').isChecked(), true);
    assert.equal(await page.getByText('Proposé par la fiche stack.').count(), 0);
  });
});

test('une fiche stack « Automatique », ou sans cette partie : rien ne change en haut de la page', async () => {
  for (const files of [{ 'STACK.md': '# Stack technique\n\n## Mise en production\n- **Automatique** — Vercel publie chaque merge\n' }, {}]) {
    await withPanel({ files }, async ({ page, url }) => {
      await page.goto(url);
      await page.locator('#new-feature').waitFor();
      await page.waitForTimeout(300);
      assert.doesNotMatch(await page.locator('#project-sub').textContent(), /externe/);
    });
  }
});

// Pulsar alignment: a project whose CHANGELOG has a « Non publié » section gives its version number at the click.
const changelog = { 'docs/CHANGELOG.md': '# Changelog\n\n## [Non publié]\n\n- Ajout du mode sombre\n\n## [0.17.0] - 2026-11-01\n\n- Avant\n' };

test('un projet versionné : la fenêtre demande le numéro de version, et la demande le porte', async () => {
  await withPanel({ config: approval, awaiting: pending, files: changelog }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).click();
    const dialog = page.getByRole('dialog');
    const field = dialog.getByRole('textbox', { name: 'Numéro de version' });
    await field.waitFor();
    await dialog.getByText('Dernière version : 0.17.0', { exact: true }).waitFor();
    await field.fill('0.18.0');
    await dialog.getByRole('button', { name: 'Confirmer' }).click();
    await page.getByText(/Mise en production lancée/).waitFor();
    const sent = writes.find((w) => w.method === 'POST' && w.path === '/repos/o/r/issues');
    assert.equal(sent.body.title, 'Mise en production : version 0.18.0');
    assert.match(sent.body.body, /^Version : 0\.18\.0$/m);
  });
});

test('sur téléphone, le champ ouvre le clavier ordinaire, et des virgules tapées valent des points', async () => {
  await withPanel({ config: approval, awaiting: pending, files: changelog }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).click();
    const dialog = page.getByRole('dialog');
    const field = dialog.getByRole('textbox', { name: 'Numéro de version' });
    await field.waitFor();
    assert.equal(await field.getAttribute('inputmode'), null, 'pas de pavé numérique : il n\'a que la virgule');
    await field.fill('0,18,0');
    await dialog.getByRole('button', { name: 'Confirmer' }).click();
    await page.getByText(/Mise en production lancée/).waitFor();
    const sent = writes.find((w) => w.method === 'POST' && w.path === '/repos/o/r/issues');
    assert.equal(sent.body.title, 'Mise en production : version 0.18.0');
  });
});

test('un numéro absent ou inférieur à la dernière version n\'envoie rien, et la fenêtre dit pourquoi', async () => {
  await withPanel({ config: approval, awaiting: pending, files: changelog }, async ({ page, url, writes }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Numéro de version' }).waitFor();
    await dialog.getByRole('button', { name: 'Confirmer' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Indiquez le numéro de version.' }).waitFor();
    await dialog.getByRole('textbox', { name: 'Numéro de version' }).fill('0.16.0');
    await dialog.getByRole('button', { name: 'Confirmer' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'pas supérieur à la dernière version (0.17.0)' }).waitFor();
    assert.equal(writes.filter((w) => w.method === 'POST').length, 0);
  });
});

test('un projet sans CHANGELOG versionné : pas de numéro demandé', async () => {
  await withPanel({ config: approval, awaiting: pending }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).waitFor();
    assert.equal(await page.locator('#release-version').isVisible(), false);
  });
});
