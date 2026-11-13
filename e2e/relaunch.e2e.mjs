// A card whose agent launch failed for a passing reason: the factory relaunches it alone (issue #383).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';
import { writeRelaunch, relaunchLine } from '../panel/relaunch.mjs';

const next = Date.now() + 2 * 60_000;
const waiting = issue(3, 'Exporter en PDF', ['factory:feature', 'factory:spec-review', 'factory:relaunch'], {
  body: writeRelaunch('Ma demande', { stage: 'build', issue: 3, pr: null, then: { comments: [{ n: 3, body: '<!-- factory-agent -->\nJe démarre.' }] }, since: Date.now(), failures: 1, next }),
});

test('une carte dont le lancement a échoué affiche « Relance prévue à … » au lieu de vous demander de réécrire', async () => {
  await withPanel({ issues: [waiting] }, async ({ page, url }) => {
    await page.goto(url);
    const c = page.locator('section.lane-working .ticket[data-number="3"]');
    await c.locator('.relaunch').waitFor();
    assert.equal(await c.locator('.relaunch').textContent(), relaunchLine({ next }));
    assert.equal(await page.locator('section.lane-yours .ticket[data-number="3"]').count(), 0, 'nothing for the owner to do');
    assert.doesNotMatch(await c.textContent(), /de travail des agents/, 'no agent works on it until then');
  });
});

test('une fois l\'agent relancé, la mention disparaît', async () => {
  const started = issue(3, 'Exporter en PDF', ['factory:feature', 'factory:building', 'factory:running'], { body: 'Ma demande' });
  await withPanel({ issues: [started] }, async ({ page, url }) => {
    await page.goto(url);
    const c = page.locator('.ticket[data-number="3"]');
    await c.waitFor();
    assert.equal(await c.locator('.relaunch').count(), 0);
    assert.match(await c.textContent(), /Un agent travaille/);
  });
});
