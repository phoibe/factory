// A new panel version is online while something is unsaved: the owner is told once, not every minute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

test('une nouvelle version est en ligne et un message est en cours de saisie : l\'avis n\'apparaît qu\'une fois, même après plusieurs vérifications', async () => {
  await withPanel({ issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])] }, async ({ page, url }) => {
    let build = 'abc1234';
    await page.route(url, async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()).replace('__BUILD__', 'abc1234') }); });
    await page.route('**/version.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build }) }));
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Une carte' }).waitFor();
    await page.evaluate(() => {
      document.getElementById('chat-input').value = 'Un message pas fini';
      window.__toasts = 0;
      new MutationObserver(() => window.__toasts++).observe(document.getElementById('toast'), { childList: true });
    });
    build = 'def5678';
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(400);
    }
    assert.equal(await page.evaluate(() => window.__toasts), 1);
    assert.match(await page.locator('#toast').textContent(), /nouvelle version/i);
  });
});

test('une nouvelle version est en ligne et un message non envoyé attend : la page ne se recharge pas', async () => {
  // The chat sends to a new conversation or to the one opened by itself: both writes fail.
  const offline = new Set(['/repos/o/r/issues', '/repos/o/r/issues/1/comments']);
  await withPanel({ issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])], offline }, async ({ page, url }) => {
    let build = 'abc1234';
    await page.route(url, async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()).replace('__BUILD__', 'abc1234') }); });
    await page.route('**/version.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build }) }));
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Une carte' }).waitFor();
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#chat-input').fill('Un message qui ne part pas');
    await page.locator('#chat-send').click();
    await page.locator('#chat-messages .msg.unsent').waitFor();
    await page.evaluate(() => { window.__still = true; });
    build = 'def5678';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('#toast', { hasText: /nouvelle version/i }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__still), true, 'la page s\'est rechargée');
    assert.equal(await page.locator('#chat-messages .msg.unsent').count(), 1);
  });
});

test('une nouvelle version est en ligne et seul un message non envoyé attend : l\'avis parle de ce message, pas d\'enregistrer', async () => {
  const offline = new Set(['/repos/o/r/issues', '/repos/o/r/issues/1/comments']);
  await withPanel({ issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])], offline }, async ({ page, url }) => {
    let build = 'abc1234';
    await page.route(url, async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()).replace('__BUILD__', 'abc1234') }); });
    await page.route('**/version.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build }) }));
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Une carte' }).waitFor();
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#chat-input').fill('Un message qui ne part pas');
    await page.locator('#chat-send').click();
    await page.locator('#chat-messages .msg.unsent').waitFor();
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
    build = 'def5678';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('#toast', { hasText: /nouvelle version/i }).waitFor();
    assert.equal((await page.locator('#toast').textContent()).trim(),
      'Une nouvelle version du panneau est en ligne : elle se chargera dès que vos messages non envoyés auront été renvoyés ou repris.');
  });
});
