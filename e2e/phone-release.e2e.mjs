// Journeys of issue #343: on a phone, « Mise en production » takes the top line and « Nouvelle fonctionnalité » moves into « Plus ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const approval = { production: 'approval' };
const phone = { width: 390, height: 844 };
const pending = [
  issue(11, 'Ajout du mode sombre', ['factory:awaiting-production'], { state: 'closed', pull_request: { merged_at: '2026-11-08T10:00:00Z' } }),
  issue(12, 'Correction du menu', ['factory:awaiting-production'], { state: 'closed', pull_request: { merged_at: '2026-11-08T11:00:00Z' } }),
];
const inMenu = (page, id) => page.evaluate((i) => document.getElementById('more-menu').contains(document.getElementById(i)), id);
const top = (page, sel) => page.locator(sel).evaluate((n) => Math.round(n.getBoundingClientRect().top));

test('sur téléphone, « Mise en production » et « Plus » tiennent sur une seule ligne en haut', async () => {
  await withPanel({ config: approval, viewport: phone }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#release').waitFor();
    assert.equal(await page.locator('#new-feature').isVisible(), false);
    assert.equal(await top(page, '#release'), await top(page, '#more > summary'));
  });
});

test('dans « Plus », « Nouvelle fonctionnalité » est la première ligne et ouvre la page de nouvelle demande', async () => {
  await withPanel({ config: approval, viewport: phone }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#release').waitFor();
    await page.locator('#more > summary').click();
    assert.equal(await inMenu(page, 'new-feature'), true);
    assert.equal(await page.evaluate(() => document.getElementById('more-menu').firstElementChild.id), 'new-feature');
    const link = page.getByRole('link', { name: 'Nouvelle fonctionnalité' });
    assert.equal(await link.isVisible(), true);
    assert.match(await link.getAttribute('href'), /issues\/new\?template=feature\.yml$/);
  });
});

test('avec ou sans modifications en attente, le premier « go » reste à la même place', async () => {
  const heights = [];
  for (const awaiting of [[], pending]) {
    await withPanel({ config: approval, awaiting, viewport: phone }, async ({ page, url }) => {
      await page.goto(url);
      await page.locator('#release').waitFor();
      if (awaiting.length) await page.getByRole('button', { name: 'Mise en production (2)' }).waitFor();
      // One line of buttons: the release button and « Plus » share the top line.
      assert.equal(await top(page, '#release'), await top(page, '#more > summary'));
      heights.push(await page.locator('.actions').evaluate((n) => Math.round(n.getBoundingClientRect().bottom)));
    });
  }
  assert.equal(heights[0], heights[1]);
  assert.equal(heights.length, 2);
});

test('sur téléphone, un projet sans mise en production garde « Nouvelle fonctionnalité » en haut à côté de « Plus »', async () => {
  await withPanel({ viewport: phone }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#new-feature').waitFor();
    assert.equal(await inMenu(page, 'new-feature'), false);
    assert.equal(await page.locator('#new-feature').isVisible(), true);
    assert.equal(await top(page, '#new-feature'), await top(page, '#more > summary'));
  });
});

test('sur ordinateur, « Nouvelle fonctionnalité » et « Mise en production » restent côte à côte en haut', async () => {
  await withPanel({ config: approval, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('#release').waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('new-feature').nextElementSibling?.id), 'release');
    assert.equal(await top(page, '#new-feature'), await top(page, '#release'));
  });
});
