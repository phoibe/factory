// The other projects' dots follow reality faster (issue #488): every 10 s while the owner is active, and at once on
// coming back to the tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const repos = ['o/r', 'o/alpha'];
const openR = (page) => page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
const alphaDot = (page) => page.locator('#projects .project-item', { hasText: 'alpha' }).locator('.pdot');
const setHidden = (page, hidden) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

test('panneau ouvert et en main, quand un autre projet change d\'état, sa pastille change en 10 à 15 secondes', async () => {
  const repoIssues = { 'o/alpha': [issue(1, 'Construit', ['factory:feature', 'factory:building', 'factory:running'])] };
  await withPanel({ repos, repoIssues, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('#projects .pdot-working').waitFor();
    repoIssues['o/alpha'] = [issue(1, 'Question', ['factory:feature', 'factory:building', 'factory:blocked'])];
    await page.locator('#projects .pdot-blocked').waitFor({ timeout: 15_000 });
    assert.match(await alphaDot(page).getAttribute('class'), /pdot-blocked/);
  });
});

test('en revenant sur l\'onglet du panneau, les pastilles des autres projets sont revérifiées aussitôt', async () => {
  const repoIssues = { 'o/alpha': [issue(1, 'Construit', ['factory:feature', 'factory:building', 'factory:running'])] };
  await withPanel({ repos, repoIssues, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    await page.goto(url);
    await page.locator('#projects .pdot-working').waitFor();
    await setHidden(page, true);
    // Hidden: the round due after 10 s slows the next one down to 30 s.
    await page.waitForTimeout(16_000);
    repoIssues['o/alpha'] = [issue(1, 'Question', ['factory:feature', 'factory:building', 'factory:blocked'])];
    await page.waitForTimeout(12_000);
    assert.match(await alphaDot(page).getAttribute('class'), /pdot-working/, 'hidden: no check every 10 s');
    await setHidden(page, false);
    await page.locator('#projects .pdot-blocked').waitFor({ timeout: 4_000 });
  });
});

test('un geste après un moment de calme revérifie aussitôt les pastilles des autres projets', async () => {
  const repoIssues = { 'o/alpha': [issue(1, 'Construit', ['factory:feature', 'factory:building', 'factory:running'])] };
  await withPanel({ repos, repoIssues, viewport: { width: 1280, height: 800 } }, async ({ page, url }) => {
    await openR(page);
    // The page's clock can jump ahead, to stand for 2 minutes of calm without waiting them.
    await page.addInitScript(() => {
      const real = Date.now.bind(Date);
      let ahead = 0;
      Date.now = () => real() + ahead;
      window.jumpAhead = (ms) => { ahead += ms; };
    });
    await page.goto(url);
    await page.locator('#projects .pdot-working').waitFor();
    await page.evaluate(() => window.jumpAhead(121_000));
    repoIssues['o/alpha'] = [issue(1, 'Question', ['factory:feature', 'factory:building', 'factory:blocked'])];
    await page.mouse.move(300, 300);
    await page.locator('#projects .pdot-blocked').waitFor({ timeout: 4_000 });
  });
});
