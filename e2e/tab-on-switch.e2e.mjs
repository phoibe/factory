// Switching project always opens the new project on « Suivi » (issue #475).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const repos = ['o/r', 'o/alpha'];
const issues = [issue(1, 'Carte du projet r', ['factory:feature', 'factory:queued'])];
const repoIssues = { 'o/alpha': [issue(2, 'Carte du projet alpha', ['factory:feature', 'factory:queued'])] };
const openR = (page) => page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
const pick = (page, name) => page.locator('#projects .project-item', { hasText: name }).click();
const selected = (page) => page.locator('.tabs [role=tab][aria-selected=true]').textContent().then((t) => t.trim());
const desktop = { width: 1280, height: 800 };

async function switchFrom(tab) {
  await withPanel({ repos, issues, repoIssues, viewport: desktop }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await pick(page, 'alpha');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'alpha');
    await page.locator('#board .ticket', { hasText: 'Carte du projet alpha' }).waitFor({ state: 'visible' });
    assert.match(await selected(page), /^Suivi/);
    assert.equal(await page.locator('#rules-panel').isHidden(), true);
    assert.equal(await page.locator('#chat').isHidden(), true);
  });
}

test('depuis l\'onglet « Paramètres », je choisis un autre projet : l\'onglet « Suivi » du nouveau projet s\'affiche', () => switchFrom('Paramètres'));

test('depuis l\'onglet « Agent », je choisis un autre projet : l\'onglet « Suivi » du nouveau projet s\'affiche', () => switchFrom('Agent'));

test('sur « Paramètres », je reclique sur le projet déjà ouvert : je reste sur « Paramètres »', async () => {
  await withPanel({ repos, issues, repoIssues, viewport: desktop }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await page.getByRole('tab', { name: 'Paramètres', exact: true }).click();
    await pick(page, 'r');
    await page.waitForTimeout(500);
    assert.match(await selected(page), /^Paramètres/);
    assert.equal(await page.locator('#rules-panel').isVisible(), true);
  });
});

test('sur téléphone, depuis « Paramètres », je choisis un autre projet dans la liste : l\'onglet « Suivi » s\'affiche', async () => {
  await withPanel({ repos, issues, repoIssues, viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await page.getByRole('tab', { name: 'Paramètres', exact: true }).click();
    await page.locator('#project-switch').click();
    await page.locator('#projects-dialog-list .project-item', { hasText: 'alpha' }).click();
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'alpha');
    assert.match(await selected(page), /^Suivi/);
    assert.equal(await page.locator('#rules-panel').isHidden(), true);
  });
});
