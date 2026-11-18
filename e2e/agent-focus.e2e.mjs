// Journeys of issue #489: opening the « Agent » tab puts the cursor in the message box, on a computer only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const agentTab = (page) => page.getByRole('tab', { name: 'Agent', exact: true });
const focusedId = (page) => page.evaluate(() => document.activeElement?.id || '');

test('sur ordinateur, en cliquant sur l\'onglet « Agent », je tape directement ma question dans la zone de saisie', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page).click();
    await page.waitForFunction(() => document.activeElement?.id === 'chat-input');
    await page.keyboard.type('Bonjour');
    assert.equal(await page.locator('#chat-input').inputValue(), 'Bonjour');
  });
});

test('en revenant sur l\'onglet « Agent » depuis un autre onglet, le curseur est de nouveau dans la zone de saisie', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page).click();
    await page.waitForFunction(() => document.activeElement?.id === 'chat-input');
    await page.getByRole('tab', { name: 'Suivi' }).click();
    assert.notEqual(await focusedId(page), 'chat-input');
    await page.getByRole('tab', { name: 'Suivi' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.activeElement?.id === 'chat-input');
  });
});

test('sans jeton de lecture, le curseur se place dans le champ du jeton', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.' }, readToken: false }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page).click();
    await page.getByRole('heading', { name: 'Un jeton de lecture pour discuter' }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'read-token');
  });
});

test('sur téléphone, ouvrir l\'onglet « Agent » ne fait pas apparaître le clavier', async () => {
  await withPanel({ viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes('pointer: fine') ? { ...real(q), matches: false, media: q } : real(q));
    });
    await page.goto(url);
    await agentTab(page).click();
    await page.locator('#chat-new').or(page.getByRole('button', { name: 'Nouvelle conversation' })).first().waitFor();
    await page.waitForTimeout(300);
    assert.notEqual(await focusedId(page), 'chat-input');
  });
});
