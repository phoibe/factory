// Journeys of issue #430: a finished « Mise en production » folds its list of changes behind « N modifications ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const approval = { production: 'approval' };
const note = (data) => `<!-- factory-release ${JSON.stringify(data)} -->`;
const botComment = (body) => ({ body, user: { login: 'github-actions[bot]' }, author_association: 'NONE' });
const titles = ['Capital max alloué', 'Réserve automatique', 'Review générale', 'Historique en clair', 'Sauvegarde hors site', 'Tableaux au téléphone', 'Quota d\'ordres', 'Sommaire à portée', 'Rafraîchir sans relancer'];
const prs = titles.map((title, i) => ({ number: 100 + i, title }));
const closedRelease = issue(50, 'Mise en production', ['factory:production'], { state: 'closed', closed_at: '2026-11-09T12:00:00Z', comments: 1, body: '' });
const liveNote = (list) => ({ 50: [botComment(note({ state: 'live', version: '0.19.0', prs: list, site: 'https://site.example' }))] });
const doneCard = (page) => page.locator('.lane-done .ticket', { hasText: 'Mise en production' }).first();

test('la carte « Mise en production » terminée affiche « 9 modifications » sans la liste', async () => {
  await withPanel({ config: approval, closed: [closedRelease], comments: liveNote(prs) }, async ({ page, url }) => {
    await page.goto(url);
    const done = doneCard(page);
    await done.getByText('En ligne ✅').waitFor();
    await done.getByText('9 modifications').waitFor();
    assert.equal(await done.getByText('Capital max alloué').isVisible(), false);
    await done.getByText('Version 0.19.0').waitFor();
    await done.getByRole('link', { name: /Voir le site en ligne/ }).waitFor();
  });
});

test('cliquer sur « 9 modifications » déplie la liste, un second clic la replie', async () => {
  await withPanel({ config: approval, closed: [closedRelease], comments: liveNote(prs) }, async ({ page, url }) => {
    await page.goto(url);
    const done = doneCard(page);
    const toggle = done.getByText('9 modifications');
    await toggle.click();
    for (const t of titles) await done.getByText(t).waitFor();
    await toggle.click();
    await done.getByText('Capital max alloué').waitFor({ state: 'hidden' });
  });
});

test('une seule modification : le lien dit « 1 modification » et la liste est repliée', async () => {
  await withPanel({ config: approval, closed: [closedRelease], comments: liveNote(prs.slice(0, 1)) }, async ({ page, url }) => {
    await page.goto(url);
    const done = doneCard(page);
    await done.getByText('1 modification', { exact: true }).waitFor();
    assert.equal(await done.getByText('Capital max alloué').isVisible(), false);
  });
});

test('au clavier, Tab puis Entrée déplie la liste', async () => {
  await withPanel({ config: approval, closed: [closedRelease], comments: liveNote(prs) }, async ({ page, url }) => {
    await page.goto(url);
    const done = doneCard(page);
    await done.getByText('9 modifications').waitFor();
    await done.getByRole('link', { name: 'Mise en production' }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), '9 modifications');
    await page.keyboard.press('Enter');
    await done.getByText('Capital max alloué').waitFor();
  });
});

test('la carte repliée garde la même hauteur avec 1 ou 9 modifications', async () => {
  const height = async (list) => {
    let h;
    await withPanel({ config: approval, viewport: { width: 390, height: 844 }, closed: [closedRelease], comments: liveNote(list) }, async ({ page, url }) => {
      await page.goto(url);
      await doneCard(page).locator('summary').waitFor();
      h = (await doneCard(page).boundingBox()).height;
    });
    return h;
  };
  const [one, nine] = [await height(prs.slice(0, 1)), await height(prs)];
  assert.ok(Math.abs(nine - one) <= 1, `1 modification: ${one}px, 9 modifications: ${nine}px`);
});

test('une carte ouverte reste ouverte quand le tableau se redessine (changement de projet aller-retour)', async () => {
  await withPanel({ config: approval, repos: ['o/r', 'o/alpha'], closed: [closedRelease], comments: liveNote(prs), repoIssues: { 'o/alpha': [issue(70, 'Carte alpha', ['factory:feature', 'factory:queued'])] } }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await doneCard(page).getByText('9 modifications').click();
    await doneCard(page).getByText('Capital max alloué').waitFor();
    await page.locator('#projects .project-item', { hasText: 'alpha' }).click();
    await page.locator('.ticket', { hasText: 'Carte alpha' }).waitFor();
    await page.locator('#projects .project-item[data-repo="o/r"]').click();
    await doneCard(page).getByText('9 modifications').waitFor();
    await doneCard(page).getByText('Capital max alloué').waitFor({ timeout: 3000 });
  });
});

test('« Voir le site en ligne » se clique sans ouvrir la carte GitHub à la place', async () => {
  await withPanel({ config: approval, closed: [closedRelease], comments: liveNote(prs) }, async ({ page, url }) => {
    await page.goto(url);
    // trial: Playwright checks that nothing else (the card's own link) would catch the click.
    await doneCard(page).getByRole('link', { name: /Voir le site en ligne/ }).click({ trial: true, timeout: 5000 });
  });
});
