// Journeys of issue #506: the agent shows the request card right away, after checking the open requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const agent = (page) => page.getByRole('tab', { name: 'Agent', exact: true }).click();

test('quand je signale un manque dans la discussion du tableau, la carte arrive tout de suite sous la réponse', async () => {
  const issues = [{ kind: 'bug', title: 'Le tri plante', body: 'Le tri plante quand la liste est vide.' }];
  await withPanel({ chatServer: { answer: 'En effet, le tri plante sur une liste vide.', issues } }, async ({ page, url }) => {
    await page.goto(url);
    await agent(page);
    await page.locator('#chat-input').fill('ça ne marche pas quand je trie une liste vide');
    await page.locator('#chat-send').click();
    const card = page.locator('.proposal', { hasText: 'Le tri plante' });
    await card.getByRole('button', { name: 'Créer cette demande' }).waitFor();
    await card.getByRole('button', { name: 'Ignorer' }).waitFor();
  });
});

test('l\'agent reçoit les demandes déjà ouvertes, pour ne pas en proposer une en double', async () => {
  const open = [
    issue(7, 'Exporter en PDF', ['factory:feature', 'factory:queued']),
    issue(9, 'Une autre discussion', ['factory:question']),
  ];
  await withPanel({ issues: open, chatServer: { answer: 'C\'est déjà prévu.' } }, async ({ page, url, chatCalls }) => {
    await page.goto(url);
    await page.locator('#board').getByText('Exporter en PDF').first().waitFor();
    await agent(page);
    await page.locator('#chat-input').fill('je voudrais exporter en PDF');
    await page.locator('#chat-send').click();
    await page.locator('#chat-messages').getByText('C\'est déjà prévu.').waitFor();
    assert.deepEqual(chatCalls[0].openRequests, [{ number: 7, title: 'Exporter en PDF' }]);
  });
});
