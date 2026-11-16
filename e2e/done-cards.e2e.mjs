// Journeys of issue #435: every card of « Terminé » has the same height, on a computer and on a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const approval = { production: 'approval' };
const note = (data) => `<!-- factory-release ${JSON.stringify(data)} -->`;
const botComment = (body) => ({ body, user: { login: 'github-actions[bot]' }, author_association: 'NONE' });
const LONG = 'Un titre vraiment très long pour une demande terminée, qui raconte en détail tout ce qui a été changé sur le tableau, la carte et le téléphone';
const closedAt = (h) => new Date(Date.now() - h * 3600000).toISOString();
const done = (n, title, h) => issue(n, title, ['factory:feature', 'factory:already-done'], { state: 'closed', closed_at: closedAt(h) });
const release = issue(50, 'Mise en production', ['factory:production'], { state: 'closed', closed_at: closedAt(1), comments: 1, body: '' });
const changes = Array.from({ length: 6 }, (_, i) => ({ number: 100 + i, title: `Modification ${i + 1}` }));
const closed = [release, done(61, 'Court', 2), done(62, LONG, 3), done(63, 'Moyen titre', 4), done(64, 'Encore une', 5)];
const comments = { 50: [botComment(note({ state: 'live', version: '0.19.0', prs: changes, site: 'https://site.example' }))] };
const cards = (page) => page.locator('.lane-done .ticket');
const releaseCard = (page) => cards(page).filter({ hasText: 'Mise en production' }).first();
const heights = async (page) => {
  await releaseCard(page).locator('summary').waitFor();
  await cards(page).filter({ hasText: 'Encore une' }).waitFor();
  return cards(page).evaluateAll((list) => list.map((c) => Math.round(c.getBoundingClientRect().height)));
};
const same = (hs) => assert.ok(Math.max(...hs) - Math.min(...hs) <= 1, `hauteurs : ${hs.join(', ')}`);

test('sur ordinateur, toutes les cartes « Terminé » ont la même hauteur, d\'une rangée à l\'autre', async () => {
  await withPanel({ config: approval, viewport: { width: 1280, height: 900 }, closed, comments }, async ({ page, url }) => {
    await page.goto(url);
    const hs = await heights(page);
    assert.equal(hs.length, 5);
    same(hs);
  });
});

test('sur téléphone, les cartes « Terminé » empilées ont toutes la même hauteur', async () => {
  await withPanel({ config: approval, viewport: { width: 390, height: 844 }, closed, comments }, async ({ page, url }) => {
    await page.goto(url);
    same(await heights(page));
  });
});

test('un titre très long est coupé après deux lignes, le titre complet apparaît au survol', async () => {
  await withPanel({ config: approval, viewport: { width: 390, height: 844 }, closed, comments }, async ({ page, url }) => {
    await page.goto(url);
    await heights(page);
    const link = cards(page).getByRole('link', { name: LONG });
    assert.equal(await link.getAttribute('title'), LONG);
    const box = await cards(page).filter({ hasText: 'Moyen titre' }).locator('h3').evaluate((h) => parseFloat(getComputedStyle(h).lineHeight));
    const h3 = await cards(page).filter({ hasText: 'Un titre vraiment' }).locator('h3').evaluate((h) => ({ shown: h.clientHeight, full: h.scrollHeight }));
    assert.ok(h3.full > h3.shown, 'le titre long dépasse et est coupé');
    assert.ok(Math.abs(h3.shown - 2 * box) <= 2, `deux lignes affichées (${h3.shown}px pour des lignes de ${box}px)`);
  });
});

test('déplier « N modifications » ne fait grandir que cette carte, et la replier lui rend sa taille', async () => {
  await withPanel({ config: approval, viewport: { width: 1280, height: 900 }, closed, comments }, async ({ page, url }) => {
    await page.goto(url);
    const before = await heights(page);
    const toggle = releaseCard(page).getByText('6 modifications');
    await toggle.click();
    await releaseCard(page).getByText('Modification 6').waitFor();
    const open = await cards(page).evaluateAll((list) => list.map((c) => Math.round(c.getBoundingClientRect().height)));
    assert.ok(open[0] > before[0] + 20, `la carte dépliée grandit (${before[0]} → ${open[0]})`);
    assert.deepEqual(open.slice(1), before.slice(1));
    await toggle.click();
    await releaseCard(page).getByText('Modification 6').waitFor({ state: 'hidden' });
    assert.deepEqual(await cards(page).evaluateAll((list) => list.map((c) => Math.round(c.getBoundingClientRect().height))), before);
  });
});
