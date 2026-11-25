// After any return to the login page, the project that opens at the next login shows « Suivi » (issue #590).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const issues = [issue(1, 'Carte du projet r', ['factory:feature', 'factory:queued'])];
const selected = (page) => page.locator('.tabs [role=tab][aria-selected=true]').textContent().then((t) => t.trim());
const desktop = { width: 1280, height: 800 };

async function login(page) {
  await page.locator('#login').waitFor({ state: 'visible' });
  await page.locator('#token').fill('test');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.locator('#project-view').waitFor({ state: 'visible' });
  await page.locator('#board .ticket', { hasText: 'Carte du projet r' }).waitFor({ state: 'attached' });
}

async function onBoard(page) {
  assert.match(await selected(page), /^Suivi/);
  assert.equal(await page.locator('#board').isVisible(), true);
  assert.equal(await page.locator('#chat').isHidden(), true);
  assert.equal(await page.locator('#rules-panel').isHidden(), true);
}

async function logoutFrom(tab) {
  await withPanel({ issues, viewport: desktop }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.evaluate(() => document.getElementById('logout').click());
    await login(page);
    await onBoard(page);
  });
}

test('après « Se déconnecter » depuis l\'onglet « Agent », la reconnexion ouvre le projet sur « Suivi »', () => logoutFrom('Agent'));

test('après « Se déconnecter » depuis l\'onglet « Paramètres », la reconnexion ouvre le projet sur « Suivi »', () => logoutFrom('Paramètres'));

test('jeton refusé depuis « Paramètres », puis nouveau jeton collé : le même projet s\'ouvre sur « Suivi »', async () => {
  await withPanel({ issues, viewport: desktop }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte du projet r' }).waitFor();
    await page.getByRole('tab', { name: 'Paramètres', exact: true }).click();
    // GitHub now refuses the token: the next read sends the owner back to the login page.
    const refuse = (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Bad credentials' }) });
    await page.route('https://api.github.com/**', refuse);
    await page.locator('#projects .project-item', { hasText: 'r' }).click();
    await page.locator('#login').waitFor({ state: 'visible' });
    assert.match(await page.locator('#login-error').textContent(), /refusé/);
    await page.unroute('https://api.github.com/**', refuse);
    await login(page);
    assert.equal(await page.locator('#project-name').textContent(), 'r');
    await onBoard(page);
  });
});
