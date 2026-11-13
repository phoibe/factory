// Journeys of the panel, replayed at each delivery (npm run test:e2e).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

test('sans jeton, je vois la page de connexion et le lien pour créer le jeton', async () => {
  await withPanel({ token: false }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForSelector('#login:not([hidden])');
    assert.match(await page.locator('#login a.button').getAttribute('href'), /personal-access-tokens\/new/);
  });
});

test('une spec à valider est en tête, et « go » part après 5 secondes', async () => {
  await withPanel({ issues: [issue(1, 'Partager une recette', ['factory:feature', 'factory:spec-review'])] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="1"]').click();
    assert.match(await page.locator('button.go[data-go="1"]').textContent(), /Annuler/);
    // The button reads « Envoi… » a moment before the comment leaves: wait for the comment itself.
    const sent = () => writes.filter((w) => w.path.endsWith('/issues/1/comments')).map((w) => w.body.body);
    for (let i = 0; i < 100 && !sent().length; i++) await page.waitForTimeout(100);
    assert.deepEqual(sent(), ['go']);
  });
});

test('« go » annulé à temps : rien n\'est envoyé', async () => {
  await withPanel({ issues: [issue(1, 'Partager une recette', ['factory:feature', 'factory:spec-review'])] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.locator('button.go[data-go="1"]').click();
    await page.locator('button.go[data-go="1"]').click();
    await page.waitForTimeout(6000);
    assert.equal(writes.filter((w) => w.path.endsWith('/comments')).length, 0);
    assert.equal(await page.locator('button.go[data-go="1"]').textContent(), 'go');
  });
});

test('je garde une idée de l\'agent en un clic', async () => {
  const idea = issue(5, 'Importer depuis un site', ['factory:feature'], { body: '<!-- factory-agent -->\nIdée' });
  await withPanel({ issues: [idea] }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: /Garder/ }).first().click();
    await page.waitForFunction(() => true);
    for (let i = 0; i < 20 && !writes.some((w) => w.path.endsWith('/issues/5/labels')); i++) await page.waitForTimeout(250);
    assert.deepEqual(writes.find((w) => w.path.endsWith('/issues/5/labels'))?.body, { labels: ['factory:kept'] });
  });
});

test('je change une règle et je l\'enregistre', async () => {
  await withPanel({}, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.click('#tab-rules');
    await page.locator('#stage-plan').click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    for (let i = 0; i < 20 && !writes.some((w) => w.method === 'PUT'); i++) await page.waitForTimeout(250);
    const put = writes.find((w) => w.method === 'PUT' && w.path.endsWith('/contents/factory.config.json'));
    assert.ok(put, 'the rules are written to GitHub');
    assert.equal(JSON.parse(Buffer.from(put.body.content, 'base64').toString()).stages.plan, false);
  });
});

test('si GitHub ne donne pas les modifications terminées, « Terminé » ne dit pas « Rien de livré »', async () => {
  await withPanel({ issues: [issue(1, 'Partager une recette', ['factory:feature', 'factory:building'])], failing: new Set(['/repos/o/r/pulls']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket[data-number="1"]').waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await page.getByText('Rien de livré pour l\'instant.').count(), 0);
  });
});
