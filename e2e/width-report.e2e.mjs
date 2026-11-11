// The width diagnostic only shows when the address asks for it (?largeur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const tooWide = (page) => page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;top:0;left:0;width:3000px;height:4px'; document.body.append(d); });
const open = (page, url) => page.goto(url).then(() => page.locator('.ticket', { hasText: 'Une carte' }).waitFor()).then(() => tooWide(page));

test('une page plus large que l\'écran : le cadre noir de diagnostic n\'apparaît pas tout seul', async () => {
  await withPanel({ issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])] }, async ({ page, url }) => {
    await open(page, url);
    await page.waitForTimeout(5000);
    assert.equal(await page.locator('#width-report').count(), 0);
  });
});

test('avec « ?largeur » dans l\'adresse, le diagnostic de largeur s\'affiche avec la liste des éléments', async () => {
  await withPanel({ issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])] }, async ({ page, url }) => {
    await open(page, `${url}?largeur`);
    await page.locator('#width-report').waitFor({ timeout: 8000 });
    assert.match(await page.locator('#width-report pre').textContent(), /écran/);
  });
});
