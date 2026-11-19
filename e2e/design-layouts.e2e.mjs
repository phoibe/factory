// Journeys of issue #509: the factory's « Décrire les mises en page des écrans » card, replayed at each delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

test('je vois la demande « Décrire les mises en page des écrans » nommée « Mises en page » sur le tableau, sans étape de questions', async () => {
  const card = issue(7, 'Décrire les mises en page des écrans', ['factory:layouts', 'factory:kept', 'factory:building', 'factory:running']);
  await withPanel({ issues: [card] }, async ({ page, url }) => {
    await page.goto(url);
    const ticket = page.locator('.ticket', { hasText: 'Décrire les mises en page des écrans' });
    await ticket.waitFor();
    const text = await ticket.innerText();
    assert.match(text, /Mises en page/);
    assert.doesNotMatch(text, /Fonctionnalité/);
    assert.doesNotMatch(text, /Questions/);
  });
});
