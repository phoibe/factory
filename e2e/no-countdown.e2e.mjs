// « go », « Ok » and « Jeter » act at the touch, without a 5 s countdown (issue #450).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const pr = (number, title, labels) => issue(number, title, ['factory:feature', ...labels], { pull_request: { url: `https://api.github.com/repos/o/r/pulls/${number}` }, html_url: `https://github.com/o/r/pull/${number}` });
const sentOn = (writes, n) => writes.filter((w) => w.path.endsWith(`/issues/${n}/comments`)).map((w) => w.body.body);
const closes = (writes, n) => writes.filter((w) => w.path.endsWith(`/issues/${n}`) && w.method === 'PATCH');
async function within(ms, check, page) { for (let i = 0; i < ms / 50 && !check(); i++) await page.waitForTimeout(50); return check(); }

test('sur une carte de « À vous de jouer », toucher « go » envoie la réponse tout de suite, sans « Annuler (5s) »', async () => {
  await withPanel({ issues: [issue(1, 'Partager une recette', ['factory:feature', 'factory:spec-review'])] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="1"]').click();
    assert.doesNotMatch(await page.locator('button.go[data-go="1"]').textContent(), /Annuler/);
    assert.ok(await within(1500, () => sentOn(writes, 1).length, page), 'the « go » leaves at once');
    assert.deepEqual(sentOn(writes, 1), ['go']);
    await page.waitForFunction(() => document.getElementById('toast').textContent === '« go » envoyé. La construction démarre.');
  });
});

test('sur une carte de « À vous de jouer », toucher « Ok » envoie la réponse tout de suite, sans « Annuler (5s) »', async () => {
  await withPanel({ issues: [pr(10, 'Partager une recette', ['factory:visual-review'])] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="10"]').click();
    assert.doesNotMatch(await page.locator('#toast').textContent(), /part dans/);
    assert.ok(await within(1500, () => sentOn(writes, 10).length, page), 'the « ok » leaves at once');
    assert.deepEqual(sentOn(writes, 10), ['ok']);
  });
});

test('dans « Idées à trier », toucher « Jeter » fait disparaître l\'idée aussitôt de la liste', async () => {
  const idea = (n, title) => issue(n, title, ['factory:feature'], { body: '<!-- factory-agent -->\nIdée' });
  await withPanel({ issues: [idea(5, 'Importer depuis un site'), idea(6, 'Exporter en PDF')] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('.lane-ideas .ticket.idea');
    await page.getByRole('button', { name: /Jeter l'idée #5/ }).click();
    await page.waitForFunction(() => !document.querySelector('[data-idea="5"]'), null, { timeout: 1500 });
    assert.ok(await within(1500, () => closes(writes, 5).length, page));
    assert.deepEqual(closes(writes, 5).map((w) => w.body), [{ state: 'closed', state_reason: 'not_planned' }]);
    assert.doesNotMatch(await page.locator('#toast').textContent(), /part dans/);
  });
});
