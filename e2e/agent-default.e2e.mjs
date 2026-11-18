// Journeys of issue #477: the Agent tab opens on the most recent conversation still open, else on a new one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const older = issue(7, 'Combien de demandes en cours ?', ['factory:question'], { comments: 2, updated_at: ago(30) });
const recent = issue(9, 'Où en est la mise en ligne ?', ['factory:question'], { comments: 2, updated_at: ago(5) });
const finished = issue(11, 'Une vieille question', ['factory:question'], { state: 'closed', comments: 2, updated_at: ago(1) });
const openAgent = (page) => page.getByRole('tab', { name: 'Agent', exact: true }).click();

test('avec deux conversations en cours, celle qui a reçu le dernier message s\'affiche et est surlignée dans la liste', async () => {
  await withPanel({ issues: [older, recent, finished], viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await page.goto(url);
    await openAgent(page);
    await page.locator('.conv.current', { hasText: 'Où en est la mise en ligne ?' }).waitFor();
    await page.locator('#chat-title', { hasText: 'Où en est la mise en ligne ?' }).waitFor();
    assert.equal(await page.locator('.conv.current').count(), 1);
  });
});

test('quand toutes les conversations sont terminées, une nouvelle conversation vierge s\'affiche', async () => {
  await withPanel({ issues: [finished], viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await page.goto(url);
    await openAgent(page);
    await page.locator('.conv', { hasText: 'Une vieille question' }).waitFor();
    await page.locator('#chat-title', { hasText: 'Nouvelle conversation' }).waitFor();
    assert.equal(await page.locator('.conv.current').count(), 0);
  });
});

test('j\'ouvre une autre conversation, je passe au tableau puis reviens : je retrouve la conversation que je regardais', async () => {
  await withPanel({ issues: [older, recent], viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await page.goto(url);
    await openAgent(page);
    await page.locator('.conv.current', { hasText: 'Où en est la mise en ligne ?' }).waitFor();
    await page.locator('.conv', { hasText: 'Combien de demandes en cours ?' }).click();
    await page.locator('.conv.current', { hasText: 'Combien de demandes en cours ?' }).waitFor();
    await page.getByRole('tab', { name: 'Suivi', exact: true }).click();
    await openAgent(page);
    await page.waitForTimeout(500);
    await page.locator('.conv.current', { hasText: 'Combien de demandes en cours ?' }).waitFor();
  });
});

test('sur téléphone, j\'arrive dans la conversation en cours, et la flèche retour affiche la liste', async () => {
  await withPanel({ issues: [older, recent], viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
    await page.goto(url);
    await openAgent(page);
    await page.locator('#chat-title', { hasText: 'Où en est la mise en ligne ?' }).waitFor({ state: 'visible' });
    await page.locator('#chat.viewing').waitFor({ state: 'attached' });
    await page.locator('#chat-back').click();
    await page.locator('.conv', { hasText: 'Combien de demandes en cours ?' }).waitFor({ state: 'visible' });
  });
});
