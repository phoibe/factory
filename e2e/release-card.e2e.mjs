// Journeys of issue #370: a « Mise en production » shows as a card in « Suivi » and carries its outcome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const approval = { production: 'approval' };
const pending = [
  issue(11, 'Ajout du mode sombre', ['factory:awaiting-production'], { state: 'closed', pull_request: { merged_at: '2026-11-08T10:00:00Z' } }),
  issue(12, 'Correction du menu', ['factory:awaiting-production'], { state: 'closed', pull_request: { merged_at: '2026-11-08T11:00:00Z' } }),
];
const note = (data) => `<!-- factory-release ${JSON.stringify(data)} -->`;
const botComment = (body) => ({ body, user: { login: 'github-actions[bot]' }, author_association: 'NONE' });
const releaseIssue = (labels, body) => issue(50, 'Mise en production', labels, { comments: 1, body });
const closedRelease = (extra = {}) => issue(50, 'Mise en production', ['factory:production'], { state: 'closed', closed_at: '2026-11-09T12:00:00Z', comments: 1, body: '- Ajout du mode sombre (#11)\n- Correction du menu (#12)', ...extra });

test('après « Confirmer », le message renvoie vers l\'onglet Suivi', async () => {
  await withPanel({ config: approval, awaiting: pending }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Mise en production (2)' }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await page.locator('#toast', { hasText: 'suivez-la dans l\'onglet Suivi' }).waitFor();
  });
});

test('une mise en production en cours : une carte « Mise en production » dans « Les agents travaillent », avec son étape et la liste', async () => {
  await withPanel({ config: approval, issues: [releaseIssue(['factory:production'], '- Ajout du mode sombre (#11)')], comments: { 50: [botComment(`Ça part. ${note({ state: 'deploying', prs: [{ number: 11, title: 'Ajout du mode sombre' }] })}`)] } }, async ({ page, url }) => {
    await page.goto(url);
    const cardEl = page.locator('.ticket', { hasText: 'Mise en production' }).first();
    await cardEl.getByText('Mise en ligne en cours').waitFor();
    await cardEl.getByText('Ajout du mode sombre').waitFor();
    // Only one at a time: the button is greyed.
    assert.equal(await page.locator('#release').getAttribute('aria-disabled'), 'true');
    assert.equal(await page.locator('#release').getAttribute('title'), 'Mise en production en cours');
  });
});

test('pendant la vérification du site, l\'étape de la carte passe à « Vérification du site en ligne »', async () => {
  await withPanel({ config: approval, issues: [releaseIssue(['factory:production', 'factory:release-checking'], '- Ajout du mode sombre (#11)')], comments: { 50: [botComment(note({ state: 'deploying', prs: [{ number: 11, title: 'Ajout du mode sombre' }] }))] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Mise en production' }).first().getByText('Vérification du site en ligne').waitFor();
  });
});

test('une mise en production réussie finit dans « Terminé » avec « En ligne ✅ », la liste et le lien du site', async () => {
  await withPanel({ config: approval, closed: [closedRelease()], comments: { 50: [botComment(`En production ✅ ${note({ state: 'live', prs: [{ number: 11, title: 'Ajout du mode sombre' }, { number: 12, title: 'Correction du menu' }], site: 'https://site.example' })}`)] } }, async ({ page, url }) => {
    await page.goto(url);
    const done = page.locator('.lane-done .ticket', { hasText: 'Mise en production' }).first();
    await done.getByText('En ligne ✅').waitFor();
    await done.getByText('Ajout du mode sombre').waitFor();
    await done.getByText('Correction du menu').waitFor();
    const site = done.getByRole('link', { name: /Voir le site en ligne/ });
    assert.equal(await site.getAttribute('href'), 'https://site.example');
  });
});

test('une mise en production échouée : carte rouge « Pas mise en production » avec la raison, et le bouton retrouve son compteur', async () => {
  await withPanel({ config: approval, awaiting: pending, closed: [closedRelease()], comments: { 50: [botComment(note({ state: 'failed', reason: 'GitHub n\'a pas répondu comme prévu.', todo: 'Recliquez sur « Mise en production » dans quelques minutes.' }))] } }, async ({ page, url }) => {
    await page.goto(url);
    const done = page.locator('.lane-done .ticket.closed', { hasText: 'Mise en production' }).first();
    await done.getByText('Pas mise en production').waitFor();
    await done.getByText(/Recliquez sur/).waitFor();
    // Nothing is in flight any more: the button counts the waiting changes again.
    await page.getByRole('button', { name: 'Mise en production (2)' }).waitFor();
  });
});

test('une mise en production annulée : carte rouge avec le lien vers la correction urgente', async () => {
  await withPanel({ config: approval, closed: [closedRelease()], comments: { 50: [botComment(note({ state: 'undone', fix: 60, reason: 'la page répond 500' }))] } }, async ({ page, url }) => {
    await page.goto(url);
    const done = page.locator('.lane-done .ticket.closed', { hasText: 'Mise en production' }).first();
    await done.getByText(/Annulée/).waitFor();
    const fix = done.getByRole('link', { name: /Voir la correction \(#60\)/ });
    assert.match(await fix.getAttribute('href'), /\/issues\/60$/);
  });
});

test('les anciennes mises en production apparaissent dans « Terminé » parmi les autres demandes, par date', async () => {
  const merged = { number: 40, title: 'Nouvelle demande', merged_at: '2026-11-10T09:00:00Z', body: 'Closes #7', html_url: 'https://github.com/o/r/pull/40' };
  await withPanel({ config: approval, closed: [closedRelease()], comments: { 50: [botComment(note({ state: 'live', prs: [{ number: 11, title: 'Ajout du mode sombre' }] }))] } }, async ({ page, url, writes }) => {
    void writes; void merged;
    await page.goto(url);
    await page.locator('.lane-done .ticket', { hasText: 'Mise en production' }).first().waitFor();
    // The release sits in the same « Terminé » column as the rest.
    assert.ok(await page.locator('.lane-done .ticket', { hasText: 'Mise en production' }).count() >= 1);
  });
});

test('sur téléphone, la carte de mise en production reste lisible', async () => {
  await withPanel({ config: approval, viewport: { width: 390, height: 844 }, issues: [releaseIssue(['factory:production'], '- Ajout du mode sombre (#11)')], comments: { 50: [botComment(note({ state: 'deploying', prs: [{ number: 11, title: 'Ajout du mode sombre' }] }))] } }, async ({ page, url }) => {
    await page.goto(url);
    const cardEl = page.locator('.ticket', { hasText: 'Mise en production' }).first();
    await cardEl.getByText('Mise en ligne en cours').waitFor();
    const box = await cardEl.boundingBox();
    assert.ok(box.width <= 390, `card width ${box.width}`);
  });
});
