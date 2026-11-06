// « Idées à trier »: a card leaves as soon as the owner clicks « Garder » or « Jeter », GitHub finishes in the background.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const idea = (n, title) => issue(n, title, ['factory:feature'], { body: '<!-- factory-agent -->\nIdée' });
const IDEAS = () => [idea(5, 'Importer depuis un site'), idea(6, 'Exporter en PDF'), idea(7, 'Mode sombre')];
const SLOW = 4000; // GitHub takes its time: everything below must happen before it answers
const shown = (page) => page.locator('.lane-ideas .ticket.idea h3').allTextContents();

test('un clic sur « Garder » fait disparaître la carte en douceur, et les suivantes remontent aussitôt', async () => {
  await withPanel({ issues: IDEAS(), writeDelay: SLOW, config: { autoPick: true } }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    const place = await page.locator('[data-idea="5"]').boundingBox();
    await page.getByRole('button', { name: /Garder l'idée #5/ }).click();
    await page.waitForFunction(() => !document.querySelector('[data-idea="5"]'), null, { timeout: 1500 });
    assert.deepEqual(await shown(page), ['Exporter en PDF', 'Mode sombre']);
    // Mid-slide the next card is still on its way; once the slide is over it sits where the sorted card was.
    const mid = await page.locator('[data-idea="6"]').boundingBox();
    await page.waitForTimeout(600);
    const end = await page.locator('[data-idea="6"]').boundingBox();
    assert.deepEqual([Math.round(end.x), Math.round(end.y)], [Math.round(place.x), Math.round(place.y)], 'the next card took its place');
    assert.notDeepEqual([Math.round(mid.x), Math.round(mid.y)], [Math.round(end.x), Math.round(end.y)], 'it slid there, it did not jump');
    assert.deepEqual(writes.find((w) => w.path.endsWith('/issues/5/labels'))?.body, { labels: ['factory:kept'] });
  });
});

test('même chose avec « Jeter »', async () => {
  await withPanel({ issues: IDEAS(), writeDelay: SLOW }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #6/ }).click();
    await page.waitForFunction(() => !document.querySelector('[data-idea="6"]'), null, { timeout: 1500 });
    assert.deepEqual(await shown(page), ['Importer depuis un site', 'Mode sombre']);
    assert.deepEqual(writes.find((w) => w.path.endsWith('/issues/6'))?.body, { state: 'closed', state_reason: 'not_planned' });
  });
});

test('le nombre à côté de « Idées à trier » baisse au clic', async () => {
  await withPanel({ issues: IDEAS(), writeDelay: SLOW }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    assert.equal(await page.locator('.lane-ideas .count').textContent(), '3');
    await page.getByRole('button', { name: /Jeter l'idée #7/ }).click();
    assert.equal(await page.locator('.lane-ideas .count').textContent(), '2');
  });
});

test('je peux trier plusieurs cartes à la suite sans attendre', async () => {
  await withPanel({ issues: IDEAS(), writeDelay: SLOW }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    const t0 = Date.now();
    await page.getByRole('button', { name: /Garder l'idée #5/ }).click();
    await page.getByRole('button', { name: /Jeter l'idée #6/ }).click();
    await page.waitForFunction(() => !document.querySelector('[data-idea="5"]') && !document.querySelector('[data-idea="6"]'));
    assert.ok(Date.now() - t0 < SLOW, 'no waiting for GitHub');
    assert.deepEqual(await shown(page), ['Mode sombre']);
    for (let i = 0; i < 20 && writes.length < 2; i++) await page.waitForTimeout(100);
    assert.equal(writes.length, 2);
  });
});

test('après le tri de la dernière idée, la section disparaît', async () => {
  await withPanel({ issues: [idea(5, 'Importer depuis un site')], writeDelay: SLOW }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #5/ }).click();
    await page.waitForFunction(() => !document.querySelector('.lane-ideas'), null, { timeout: 1000 });
  });
});

test('aucun message « Idée gardée. » ou « Idée jetée… » ne s\'affiche', async () => {
  await withPanel({ issues: IDEAS(), config: { autoPick: true } }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Garder l'idée #5/ }).click();
    await page.getByRole('button', { name: /Jeter l'idée #6/ }).click();
    for (let i = 0; i < 20 && writes.length < 2; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(300);
    assert.doesNotMatch(await page.locator('#toast').textContent(), /Idée (gardée|jetée)/);
  });
});

test('quand la factory ne prend pas les demandes toute seule, « Garder » rappelle d\'écrire dedans', async () => {
  await withPanel({ issues: IDEAS(), config: { autoPick: false } }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Garder l'idée #5/ }).click();
    await page.waitForFunction(() => document.querySelector('#toast.show')?.textContent === 'Idée gardée. Écrivez dedans pour la lancer.');
  });
});

test('si GitHub refuse, la carte revient à sa place avec la ligne rouge, qui part quand je reclique', async () => {
  await withPanel({ issues: IDEAS(), failing: new Set(['/repos/o/r/issues/6']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #6/ }).click();
    await page.waitForSelector('[data-idea="6"] .idea-error');
    assert.deepEqual(await shown(page), ['Importer depuis un site', 'Exporter en PDF', 'Mode sombre'], 'back at its place');
    assert.equal(await page.locator('.lane-ideas .count').textContent(), '3');
    assert.equal(await page.locator('[data-idea="6"] .idea-error').textContent(), 'GitHub a refusé : réessayez.');
    assert.equal(await page.getByRole('button', { name: /Jeter l'idée #6/ }).isEnabled(), true);
    await page.getByRole('button', { name: /Garder l'idée #6/ }).click();
    // Kept this time (GitHub agrees): the card leaves, and the red line with it.
    await page.waitForFunction(() => !document.querySelector('[data-idea="6"]') && !document.querySelector('.idea-error'));
    assert.equal(await page.locator('.lane-ideas .count').textContent(), '2');
  });
});

test('un refus sur une carte ne touche pas les autres cartes en cours', async () => {
  await withPanel({ issues: IDEAS(), writeDelay: 600, failing: new Set(['/repos/o/r/issues/6']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #6/ }).click();
    await page.getByRole('button', { name: /Jeter l'idée #7/ }).click();
    await page.waitForSelector('[data-idea="6"] .idea-error');
    await page.waitForTimeout(300);
    assert.deepEqual(await shown(page), ['Importer depuis un site', 'Exporter en PDF']);
    assert.equal(await page.locator('.idea-error').count(), 1);
    // The refusal is announced, and tied to the card's buttons.
    assert.equal(await page.locator('[data-idea="6"] .idea-error').getAttribute('role'), 'alert');
    const id = await page.locator('[data-idea="6"] .idea-error').getAttribute('id');
    assert.equal(await page.getByRole('button', { name: /Garder l'idée #6/ }).getAttribute('aria-describedby'), id);
  });
});

test('si GitHub refuse la dernière idée, la section revient avec son nombre', async () => {
  await withPanel({ issues: [idea(5, 'Importer depuis un site')], failing: new Set(['/repos/o/r/issues/5']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #5/ }).click();
    await page.waitForSelector('[data-idea="5"] .idea-error');
    assert.equal(await page.locator('.lane-ideas .count').textContent(), '1');
  });
});
