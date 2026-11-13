// « Jeter » on an idea waits 5 s and can be cancelled, like « go » (issue #402).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const idea = (n, title) => issue(n, title, ['factory:feature'], { body: '<!-- factory-agent -->\nIdée' });
const IDEAS = () => [idea(5, 'Importer depuis un site'), idea(6, 'Exporter en PDF')];
const closes = (writes, n) => writes.filter((w) => w.path.endsWith(`/issues/${n}`) && w.method === 'PATCH');
const toastSays = (page, text) => page.waitForFunction((t) => document.querySelector('#toast.show')?.textContent === t, text, { timeout: 2000 });

test('quand je touche « Jeter », le bouton affiche « Annuler (5 s) » et décompte, « Garder » est grisé et le message « L\'idée part dans 5 s » apparaît', async () => {
  await withPanel({ issues: IDEAS() }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #5/ }).click();
    const drop = page.locator('[data-idea="5"] [data-key="drop-5"]');
    assert.equal((await drop.textContent()).trim(), 'Annuler (5 s)');
    assert.equal(await drop.getAttribute('aria-label'), "Annuler « Jeter » pour l'idée #5 Importer depuis un site");
    assert.equal(await page.locator('[data-idea="5"] [data-key="keep-5"]').isDisabled(), true);
    await toastSays(page, "L'idée part dans 5 s.");
    await page.waitForFunction(() => document.querySelector('[data-key="drop-5"]')?.textContent.trim() === 'Annuler (4 s)', null, { timeout: 2000 });
    assert.equal(await page.locator('[data-idea="5"]').count(), 1, 'the card stays during the countdown');
    assert.deepEqual(closes(writes, 5), []);
    // The other card is untouched.
    assert.equal(await page.locator('[data-key="keep-6"]').isDisabled(), false);
  });
});

test('quand je touche « Annuler » avant la fin, la carte reste, le message « Jeter annulé » apparaît et l\'idée n\'est pas fermée', async () => {
  await withPanel({ issues: IDEAS() }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #5/ }).click();
    await page.getByRole('button', { name: /Annuler « Jeter » pour l'idée #5/ }).click();
    await toastSays(page, '« Jeter » annulé.');
    await page.waitForTimeout(5500);
    assert.deepEqual(closes(writes, 5), []);
    assert.equal(await page.locator('[data-idea="5"]').count(), 1);
    assert.equal((await page.locator('[data-key="drop-5"]').textContent()).trim(), 'Jeter');
    assert.equal(await page.locator('[data-key="keep-5"]').isDisabled(), false);
    assert.equal(await page.locator('.lane-ideas .count').textContent(), '2');
  });
});

test('quand je touche « Jeter » et attends 5 s, la carte disparaît et l\'idée est fermée', async () => {
  await withPanel({ issues: IDEAS() }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #5/ }).click();
    await page.waitForTimeout(3000);
    assert.equal(await page.locator('[data-idea="5"]').count(), 1);
    await page.waitForFunction(() => !document.querySelector('[data-idea="5"]'), null, { timeout: 4000 });
    for (let i = 0; i < 20 && !closes(writes, 5).length; i++) await page.waitForTimeout(100);
    assert.deepEqual(closes(writes, 5).map((w) => w.body), [{ state: 'closed', state_reason: 'not_planned' }]);
  });
});

test('quand je touche « Garder » sur une autre idée, elle part tout de suite, comme avant', async () => {
  await withPanel({ issues: IDEAS(), config: { autoPick: true } }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #5/ }).click();
    await page.getByRole('button', { name: /Garder l'idée #6/ }).click();
    await page.waitForFunction(() => !document.querySelector('[data-idea="6"]'), null, { timeout: 1500 });
    assert.equal(await page.locator('[data-idea="5"]').count(), 1, 'the countdown on the other card goes on');
    assert.match(await page.locator('[data-key="drop-5"]').textContent(), /Annuler \(\d s\)/);
    for (let i = 0; i < 20 && !writes.some((w) => w.path.endsWith('/issues/6/labels')); i++) await page.waitForTimeout(100);
    assert.ok(writes.some((w) => w.path.endsWith('/issues/6/labels')));
  });
});
