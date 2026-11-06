// Journeys of issue #260: « Discuter avec l'agent » leaves the « Plus » menu, the « Discussion » tab is now « Agent ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const question = issue(7, 'Combien de demandes en cours ?', ['factory:question'], { comments: 3 });

test('en ouvrant le menu « Plus » du tableau de suivi, je ne vois plus « Discuter avec l\'agent »', async () => {
  await withPanel({ viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    await page.locator('#more summary').click();
    await page.getByRole('button', { name: 'Review générale' }).waitFor();
    const items = (await page.locator('#more-menu > a, #more-menu > button:not([hidden])').allTextContents()).map((t) => t.trim());
    assert.deepEqual(items.slice(0, 4), ['Signaler un bug', 'Cadrer le projet', 'Review générale', 'Stack technique']);
    assert.equal(await page.getByText('Discuter avec l\'agent').count(), 0);
  });
});

test('les onglets du haut s\'appellent « Suivi », « Agent », « Paramètres »', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    const tabs = await page.getByRole('tab').allTextContents();
    assert.deepEqual(tabs.map((t) => t.trim()).slice(0, 3), ['Suivi', 'Agent', 'Paramètres']);
  });
});

test('en cliquant sur « Agent », je retrouve mes conversations, et « Nouvelle conversation » en démarre une vide', async () => {
  await withPanel({ issues: [question] }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('.conv', { hasText: 'Combien de demandes en cours ?' }).click();
    await page.locator('.conv.current').waitFor();
    await page.getByRole('button', { name: 'Nouvelle conversation' }).click();
    await page.locator('#chat-title', { hasText: 'Nouvelle conversation' }).waitFor();
    assert.equal(await page.locator('.conv.current').count(), 0);
    assert.equal(await page.locator('#chat-messages > li.msg').count(), 0);
    await page.locator('#chat-messages .chat-intro').waitFor();
  });
});

test('quand l\'agent m\'a répondu, la pastille apparaît bien sur l\'onglet « Agent »', async () => {
  await withPanel({ issues: [question] }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.chat.seen.o/r', JSON.stringify({ 7: 1 })));
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#tab-chat #chat-badge:not([hidden])').waitFor({ timeout: 5000 });
    assert.match(await page.locator('#tab-chat').innerText(), /^Agent\s*1$/);
  });
});
