// Journeys of issue #551: « Déclarer stable » counts only the real changes waiting on the factory's main. The factory's
// automatic `chore(factory)…` commits (skills and agent instructions synced to the projects) are no change for the owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const VP = { width: 1280, height: 800 };
const commit = (message) => ({ commit: { message } });
const CHORE = commit('chore(factory): sync skills and agent instructions');
const COMPARE = '/repos/phoibe/factory/compare/stable...main';

test('quand seuls des commits automatiques de la factory attendent, « Déclarer stable » reste caché', async () => {
  await withPanel({ viewport: VP, stable: { ahead_by: 1, commits: [CHORE] } }, async ({ page, url, reads }) => {
    const answered = page.waitForResponse((r) => r.url().endsWith(COMPARE), { timeout: 15000 });
    await page.goto(url);
    // The panel read the compare (after the board) and had the time to draw the button from it.
    await (await answered).finished();
    assert.ok(reads.includes(COMPARE), 'the panel read stable...main');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#stable').isHidden(), true, 'no button for automatic commits only');
  });
});

test('avec 2 vraies modifications et 1 commit automatique, le bouton dit « Déclarer stable (2) »', async () => {
  const commits = [commit('fix(panel): le bouton suit la liste\n\nDétails.'), CHORE, commit('feat(scripts): nouvelle relance (#540)')];
  await withPanel({ viewport: VP, stable: { ahead_by: 3, commits } }, async ({ page, url }) => {
    await page.goto(url);
    const btn = page.locator('#stable');
    await btn.waitFor({ state: 'visible', timeout: 15000 });
    assert.equal((await btn.textContent()).trim(), 'Déclarer stable (2)');
    assert.equal(await btn.locator('span.num').textContent(), '2');
  });
});
