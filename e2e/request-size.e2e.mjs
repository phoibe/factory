// Journeys of issue #381: the board names a request's size as soon as the agent has classified it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const estimate = (size) => ({
  body: `<!-- factory-agent -->\n<!-- factory-estimate size=${size} min=10 max=20 -->\nJe pense que c'est une demande.`,
  created_at: new Date(Date.now() - 60_000).toISOString(), html_url: 'u', user: { login: 'o' }, author_association: 'OWNER',
});

test('la taille apparaît sur la carte du tableau dès les questions', async () => {
  const asking = issue(5, 'Renommer un onglet', ['factory:feature', 'factory:grilling'], { comments: 1 });
  await withPanel({ issues: [asking], comments: { 5: [estimate('small')] } }, async ({ page, url }) => {
    await page.goto(url);
    const kind = page.locator('.ticket[data-number="5"] .kind');
    await kind.filter({ hasText: 'petite demande #5' }).waitFor({ timeout: 10_000 });
    assert.equal(await kind.innerText(), 'Fonctionnalité · petite demande #5');
  });
});

test('quand la taille est corrigée en « grosse demande », la carte affiche la nouvelle taille', async () => {
  const later = { ...estimate('large'), created_at: new Date().toISOString() };
  const asking = issue(6, 'Refaire le tableau', ['factory:feature', 'factory:grilling'], { comments: 2 });
  await withPanel({ issues: [asking], comments: { 6: [estimate('small'), later] } }, async ({ page, url }) => {
    await page.goto(url);
    await page.locator('.ticket[data-number="6"] .kind', { hasText: 'grande demande #6' }).waitFor({ timeout: 10_000 });
  });
});
