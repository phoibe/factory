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
    await agentTab(page).click();
    await page.waitForFunction(() => document.activeElement?.id === 'chat-input');
  });
});

test('avec les flèches du clavier, je passe d\'onglet en onglet sans être arrêté sur « Agent »', async () => {
  await withPanel({}, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('#chat:not([hidden])').waitFor();
    assert.equal(await focusedId(page), 'tab-chat');
    await page.keyboard.press('ArrowRight');
    assert.equal(await focusedId(page), 'tab-rules');
  });
});

test('pendant que l\'agent répond, en revenant sur « Agent », je peux préparer mon message suivant', async () => {
  await withPanel({ chatServer: { answer: 'Bonjour.', delay: 3000 } }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page).click();
    await page.locator('#chat-input').fill('Combien de demandes ?');
    await page.locator('#chat-send').click();
    await page.getByRole('tab', { name: 'Suivi' }).click();
    await agentTab(page).click();
    await page.waitForFunction(() => document.activeElement?.id === 'chat-input');
    await page.keyboard.type('Et ensuite');
    assert.equal(await page.locator('#chat-input').inputValue(), 'Et ensuite');
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

// A touch screen, at a width where the message box is on screen: only the missing fine pointer keeps the cursor out.
test('sur téléphone, ouvrir l\'onglet « Agent » ne fait pas apparaître le clavier', async () => {
  await withPanel({ viewport: { width: 1024, height: 800 } }, async ({ page, url }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) => {
        const m = real(q);
        if (q.includes('pointer: fine')) Object.defineProperty(m, 'matches', { value: false });
        return m;
      };
    });
    await page.goto(url);
    await agentTab(page).click();
    await page.locator('#chat-input').waitFor({ state: 'visible' });
    assert.equal(await focusedId(page), 'tab-chat');
  });
});

test('sur un écran d\'ordinateur portable, la zone de saisie où se trouve le curseur est entièrement visible', async () => {
  await withPanel({ viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await page.goto(url);
    await agentTab(page).click();
    await page.waitForFunction(() => document.activeElement?.id === 'chat-input');
    await page.waitForFunction(() => document.getElementById('chat-input').getBoundingClientRect().bottom + 2 <= innerHeight, null, { timeout: 2000 });
  });
});
