// A card blocked while it waits for another request's merge (issue #298).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const block = (waits) => ({ id: 1, body: `<!-- factory-agent -->\nJe dois attendre la fusion.\n<!-- factory-waits-for ${waits.map((n) => `#${n}`).join(' ')} -->`, user: { login: 'o' }, created_at: new Date().toISOString(), html_url: 'https://github.com/o/r/issues/5#issuecomment-1' });
const blocked = issue(5, 'Exporter en PDF', ['factory:feature', 'factory:building', 'factory:blocked'], { comments: 1 });

test('une carte bloquée qui attend une autre demande affiche « Attend #… » dans le tableau', async () => {
  await withPanel({ issues: [blocked], comments: { 5: [block([12, 15])] } }, async ({ page, url }) => {
    await page.goto(url);
    const c = page.locator('.ticket[data-number="5"]');
    await c.locator('.waits').waitFor();
    assert.equal(await c.locator('.waits').textContent(), 'Attend #12, #15');
    assert.equal(await c.getByText('Bloqué', { exact: true }).count(), 0, 'no « Bloqué » tag');
    assert.equal(await page.locator('section.lane-yours .ticket[data-number="5"]').count(), 0, 'nothing for the owner to do');
    assert.equal(await page.locator('section.lane-queued .ticket[data-number="5"]').count(), 1);
  });
});

test('une carte bloquée sans lien de dépendance reste « Bloqué » et vous attend', async () => {
  const plain = { ...block([12]), body: '<!-- factory-agent -->\nJ\'ai une question.' };
  await withPanel({ issues: [blocked], comments: { 5: [plain] } }, async ({ page, url }) => {
    await page.goto(url);
    const c = page.locator('section.lane-yours .ticket[data-number="5"]');
    await c.waitFor();
    assert.equal(await c.locator('.blocked-tag').textContent(), 'Bloqué');
  });
});
