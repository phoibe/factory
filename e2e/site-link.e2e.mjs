// The site link on the project page only ever opens a web address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

test('une adresse de site qui n\'est pas une adresse web (javascript:) n\'est pas un lien : je vois « Ajouter l\'adresse du site en ligne »', async () => {
  await withPanel({ issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])], homepages: { 'o/r': 'javascript:alert(1)' } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Une carte' }).waitFor();
    assert.equal(await page.locator('#site').getAttribute('href'), '#site-url');
    assert.match(await page.locator('#site').innerText(), /Ajouter l'adresse du site en ligne/);
  });
});

test('une adresse de site en https est un lien qui s\'ouvre dans un nouvel onglet', async () => {
  await withPanel({ issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])], homepages: { 'o/r': 'https://exemple.fr/' } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Une carte' }).waitFor();
    assert.equal(await page.locator('#site').getAttribute('href'), 'https://exemple.fr/');
    assert.equal(await page.locator('#site').getAttribute('target'), '_blank');
  });
});
