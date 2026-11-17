// Journeys of issue #398: a refused action is never shown as done, and errors speak French.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const idea = (n, title) => issue(n, title, ['factory:feature'], { body: '<!-- factory-agent -->\nIdée' });
const pending = [issue(11, 'Ajout du mode sombre', ['factory:awaiting-production'], { state: 'closed', pull_request: { merged_at: '2026-11-08T10:00:00Z' } })];
const visual = issue(10, 'Partager une recette', ['factory:feature', 'factory:visual-review'], { pull_request: { url: 'https://api.github.com/repos/o/r/pulls/10' }, html_url: 'https://github.com/o/r/pull/10' });
const ENGLISH = /Failed|fetch|Not Found|Bad credentials|null|undefined/;

test('GitHub refuse de garder une idée (jeton sans accès) : la carte revient avec la ligne rouge, rien n\'est dit gardé', async () => {
  await withPanel({ issues: [idea(5, 'Importer depuis un site')], missing: new Set(['/repos/o/r/issues/5/labels']), config: { autoPick: false } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: /Garder l'idée #5/ }).click();
    await page.waitForSelector('[data-idea="5"] .idea-error');
    assert.equal(await page.locator('[data-idea="5"] .idea-error').textContent(), 'GitHub a refusé : réessayez.');
    assert.doesNotMatch(await page.locator('#toast.show').textContent().catch(() => ''), /Idée gardée/);
  });
});

test('GitHub refuse la mise en production : la fenêtre dit que l\'envoi a échoué, jamais « Mise en production lancée »', async () => {
  await withPanel({ config: { production: 'approval' }, awaiting: pending, missing: new Set(['/repos/o/r/issues']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#release[aria-disabled="false"]').click();
    await page.locator('#release-confirm').click();
    await page.locator('#release-error:not([hidden])').waitFor();
    assert.equal(await page.locator('#release-error').textContent(), 'L\'envoi a échoué. Le jeton n\'a pas accès à ce projet\u00a0: créez-en un qui y a accès.');
    assert.equal(await page.locator('#release-dialog').evaluate((d) => d.open), true);
    assert.doesNotMatch(await page.locator('#toast').textContent(), /lancée/);
  });
});

test('la connexion tombe pendant l\'envoi d\'un « Ok » : message en français « Connexion perdue, réessayez. »', async () => {
  await withPanel({ issues: [visual], offline: new Set(['/repos/o/r/issues/10/comments']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="10"]').click();
    await page.waitForFunction(() => /Envoi impossible/.test(document.querySelector('#toast.show')?.textContent || ''), null, { timeout: 10_000 });
    const text = await page.locator('#toast').textContent();
    assert.equal(text, 'Envoi impossible. Connexion perdue, réessayez.');
    assert.doesNotMatch(text, ENGLISH);
  });
});

test('GitHub refuse l\'enregistrement des paramètres : message en français, sans texte anglais', async () => {
  await withPanel({ missing: new Set(['/repos/o/r/contents/factory.config.json']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Paramètres' }).click();
    await page.locator('#production-approval').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.waitForFunction(() => /Échec de l'enregistrement/.test(document.querySelector('#toast.show')?.textContent || ''), null, { timeout: 10_000 });
    const text = await page.locator('#toast').textContent();
    assert.equal(text, 'Échec de l\'enregistrement. Le jeton n\'a pas accès à ce projet\u00a0: créez-en un qui y a accès.');
  });
});
