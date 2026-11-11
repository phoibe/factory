// Switching project while the agent's answer is still being written must not disturb the other project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const repos = ['o/r', 'o/alpha'];
const repoIssues = { 'o/alpha': [issue(2, 'Carte du projet alpha', ['factory:feature', 'factory:queued'])] };
const pick = (page, name) => page.locator('#projects .project-item', { hasText: name }).click();

test('je change de projet pendant que l\'agent répond : aucune erreur, la zone de saisie de l\'autre projet reste vide, et je peux revenir', async () => {
  await withPanel({ repos, repoIssues, issues: [issue(1, 'Carte du projet r', ['factory:feature', 'factory:queued'])], chatServer: { delay: 1500, answer: 'Bien reçu.' }, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    // The chat server stops the agent when the panel hangs up: leaving must never cut the answer being written.
    await page.addInitScript(() => {
      window.cancels = 0;
      for (const proto of [ReadableStream.prototype, ReadableStreamDefaultReader.prototype]) {
        const cancel = proto.cancel;
        proto.cancel = function (...args) { window.cancels += 1; return cancel.apply(this, args); };
      }
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#chat-input').fill('Bonjour agent');
    await page.locator('#chat-send').click();
    await page.locator('#chat-messages').getByText('Bonjour agent').waitFor();
    await pick(page, 'alpha');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'alpha');
    await page.waitForTimeout(2500);
    assert.equal(await page.locator('#toast.show').count(), 0, `toast: ${await page.locator('#toast').textContent()}`);
    assert.equal(await page.locator('#chat-input').inputValue(), '');
    assert.equal(await page.locator('#chat-send').isDisabled(), false);
    assert.equal(await page.locator('#chat-messages').getByText('Bonjour agent').count(), 0);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.cancels), 0, 'the answer is read to the end, so the server saves it');
    // Back on the first project: the chat works, and a new message can be sent.
    await pick(page, 'r');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'r');
    await page.locator('#chat-input').fill('Encore');
    await page.locator('#chat-send').click();
    await page.locator('#chat-messages .msg.agent', { hasText: 'Bien reçu.' }).waitFor({ timeout: 8000 });
    assert.equal(await page.locator('#toast.show').count(), 0);
  });
});

test('un brouillon écrit dans un projet ne me suit pas dans un autre projet', async () => {
  await withPanel({ repos, repoIssues, issues: [issue(1, 'Carte du projet r', ['factory:feature', 'factory:queued'])], chatServer: { delay: 50, answer: 'Bien reçu.' }, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    await page.locator('#chat-input').fill('Pour le projet r');
    await pick(page, 'alpha');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'alpha');
    assert.equal(await page.locator('#chat-input').inputValue(), '');
  });
});
