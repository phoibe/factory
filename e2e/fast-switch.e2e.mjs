// Switching project is near instant (issue #327): a project already opened in this tab shows from memory,
// a first open shows the cards the project list already knows, then the details come in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const VP = { width: 1280, height: 800 };
const session = (n) => [{ id: n, user: { login: 'github-actions[bot]' }, created_at: new Date().toISOString(), body: `<!-- factory-session -->\nDernier lancement. [Voir](https://claude.ai/code/s${n})` }];
// Twenty cards with an agent at work: their « Voir ce qu'il fait » link comes from their comments (the card's details).
const busy = (from, word) => Array.from({ length: 20 }, (_, i) => issue(from + i, `Carte ${word} ${from + i}`, ['factory:feature', 'factory:building', 'factory:running'], { comments: 1 }));
const threads = (cards) => Object.fromEntries(cards.map((c) => [c.number, session(c.number)]));
// Every read takes a little time, as on a normal connection.
const network = [[/api\.github\.com/, 200]];
const pick = (page, name) => page.locator('#projects .project-item', { hasText: name }).click();

// Clicks the project in the page and returns the ms until `ready` (a selector count) holds, or null after `limit` ms.
const timeSwitch = (page, repo, sel, count, limit = 6000) => page.evaluate(({ repo, sel, count, limit }) => new Promise((done) => {
  const t0 = performance.now();
  const check = () => {
    if (document.querySelectorAll(sel).length >= count) { obs.disconnect(); done(Math.round(performance.now() - t0)); return true; }
    return false;
  };
  const obs = new MutationObserver(check);
  obs.observe(document.getElementById('board'), { childList: true, subtree: true, attributes: true });
  setTimeout(() => { obs.disconnect(); done(null); }, limit);
  document.querySelector(`#projects .project-item[data-repo="${repo}"]`).click();
  check();
}), { repo, sel, count, limit });

test('en revenant sur un projet déjà ouvert, ses cartes et leurs détails sont là en moins d\'un quart de seconde', async () => {
  const issues = busy(1, 'r');
  await withPanel({ repos: ['o/r', 'o/alpha'], issues, comments: threads(issues), repoIssues: { 'o/alpha': [issue(50, 'Carte alpha', ['factory:feature', 'factory:queued'])] }, slowReads: network, viewport: VP }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('#board .ticket .session').length === 20, null, { timeout: 15000 });
    await pick(page, 'alpha');
    await page.locator('.ticket', { hasText: 'Carte alpha' }).waitFor();
    const ms = await timeSwitch(page, 'o/r', '#board .ticket .session', 20);
    assert.ok(ms !== null && ms < 250, `cards and details back in ${ms} ms`);
    assert.equal(await page.locator('#board .skeleton').count(), 0);
  });
});

test('à la première ouverture d\'un projet, ses cartes apparaissent en moins d\'une seconde et leurs détails en moins de trois', async () => {
  const alpha = busy(101, 'alpha');
  await withPanel({ repos: ['o/r', 'o/alpha'], issues: [issue(1, 'Carte r', ['factory:feature', 'factory:queued'])], repoIssues: { 'o/alpha': alpha }, repoComments: { 'o/alpha': threads(alpha) }, slowReads: network, viewport: VP }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte r' }).waitFor();
    // The project list has read alpha's requests in the background (its dot is drawn).
    await page.locator('#projects .project-item[data-repo="o/alpha"] .pdot-working').waitFor({ timeout: 15000 });
    const cards = await timeSwitch(page, 'o/alpha', '#board .ticket', 20);
    assert.ok(cards !== null && cards < 1000, `cards in ${cards} ms`);
    const details = await page.evaluate(() => new Promise((done) => {
      const t0 = performance.now();
      const tick = () => (document.querySelectorAll('#board .ticket .session').length >= 20 ? done(Math.round(performance.now() - t0)) : performance.now() - t0 > 6000 ? done(null) : setTimeout(tick, 20));
      tick();
    }));
    assert.ok(details !== null && cards + details < 3000, `details in ${cards + details} ms`);
  });
});

test('une demande qui a changé pendant qu\'on était sur un autre projet se met à jour seule au retour', async () => {
  const issues = [issue(1, 'Carte r', ['factory:feature', 'factory:queued'])];
  await withPanel({ repos: ['o/r', 'o/alpha'], issues, repoIssues: { 'o/alpha': [issue(50, 'Carte alpha', ['factory:feature', 'factory:queued'])] }, viewport: VP }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await page.locator('.lane-queued .ticket', { hasText: 'Carte r' }).waitFor();
    await pick(page, 'alpha');
    await page.locator('.ticket', { hasText: 'Carte alpha' }).waitFor();
    issues[0] = { ...issues[0], labels: ['factory:feature', 'factory:building', 'factory:running'].map((name) => ({ name })), updated_at: new Date(Date.now() + 1000).toISOString() };
    await pick(page, 'r');
    assert.equal(await page.locator('#board .skeleton').count(), 0, 'shown from memory, no grey cards');
    await page.locator('.lane-working .ticket', { hasText: 'Carte r' }).waitFor({ timeout: 10000 });
    assert.equal(await page.locator('#board .ticket', { hasText: 'Carte r' }).count(), 1);
  });
});

test('après un rechargement de la page, un projet s\'ouvre comme la première fois, sans ancien état', async () => {
  await withPanel({ repos: ['o/r', 'o/alpha'], issues: [issue(1, 'Carte r', ['factory:feature', 'factory:queued'])], repoIssues: { 'o/alpha': [issue(50, 'Carte alpha', ['factory:feature', 'factory:queued'])] }, slowRepos: { 'o/r': 1500 }, viewport: VP }, async ({ page, url }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('factory.project')) localStorage.setItem('factory.project', 'o/r'); });
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte r' }).waitFor();
    await pick(page, 'alpha');
    await page.locator('.ticket', { hasText: 'Carte alpha' }).waitFor();
    await page.reload();
    await page.locator('.ticket', { hasText: 'Carte alpha' }).waitFor();
    await pick(page, 'r');
    await page.waitForFunction(() => document.getElementById('project-name').textContent === 'r');
    assert.equal(await page.locator('#board .ticket', { hasText: 'Carte r' }).count(), 0, 'nothing remembered across a reload');
    await page.locator('.ticket', { hasText: 'Carte r' }).waitFor({ timeout: 10000 });
  });
});

test('en cliquant très vite sur des projets déjà ouverts, le tableau finit sur le dernier cliqué, avec ses seules cartes', async () => {
  const repoIssues = { 'o/alpha': [issue(1, 'Carte alpha', ['factory:feature', 'factory:queued'])], 'o/delta': [issue(1, 'Carte delta', ['factory:feature', 'factory:building'])] };
  await withPanel({ repos: ['o/r', 'o/alpha', 'o/delta'], issues: [issue(1, 'Carte r', ['factory:feature', 'factory:queued'])], repoIssues, slowRepos: { 'o/delta': 800 }, viewport: VP }, async ({ page, url }) => {
    await page.addInitScript(() => localStorage.setItem('factory.project', 'o/r'));
    await page.goto(url);
    await page.locator('.ticket', { hasText: 'Carte r' }).waitFor();
    for (const name of ['alpha', 'delta']) { await pick(page, name); await page.locator('.ticket', { hasText: `Carte ${name}` }).waitFor({ timeout: 10000 }); }
    for (const name of ['r', 'delta', 'alpha', 'delta', 'r', 'alpha']) await pick(page, name);
    await page.waitForTimeout(2500); // the slow project's answers come in meanwhile
    assert.equal(await page.locator('#project-name').textContent(), 'alpha');
    assert.deepEqual(await page.locator('#board .ticket h3').allTextContents(), ['Carte alpha']);
  });
});
