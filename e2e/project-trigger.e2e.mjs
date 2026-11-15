// Issue #427: on a project installed before #406, « Garder » never woke the factory. The project's trigger is never
// synced by the factory, and the board's own wake-up failed in silence (the token lacked the « Actions » right).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel, issue } from './fixture.mjs';

const idea = (n, title) => issue(n, title, ['factory:feature'], { body: '<!-- factory-agent -->\nIdée' });
const FILE = '.github/workflows/factory.yml';
const PATH = `/repos/o/r/contents/${FILE}`;
// The filter a project installed on 2026-11-06 still has (Pulsarwheel, read on 2026-11-15).
const OLD = `jobs:
  factory:
    if: >-
      (github.event_name != 'issues' || github.event.action != 'labeled' || github.event.label.name == 'factory:feature' || github.event.label.name == 'factory:bug' || github.event.label.name == 'factory:project' || github.event.label.name == 'factory:question' || github.event.label.name == 'factory:audit') &&
      (github.event_name != 'pull_request' || github.event.action != 'labeled' || github.event.label.name == 'factory:checks')
    uses: phoibe/factory/.github/workflows/relay.yml@stable
`;
const until = async (page, ok, ms = 3000) => { for (let t = 0; t < ms && !ok(); t += 100) await page.waitForTimeout(100); };
const toastText = (page) => page.locator('#toast').textContent();

test('ouvrir un projet au déclencheur ancien le met à jour : « Garder » y réveillera la factory', async () => {
  await withPanel({ files: { [FILE]: OLD } }, async ({ page, writes, url }) => {
    await page.goto(url);
    const put = () => writes.find((w) => w.method === 'PUT' && w.path === PATH);
    await until(page, put);
    assert.ok(put(), 'the trigger was written');
    const text = Buffer.from(put().body.content, 'base64').toString();
    assert.match(text, /'factory:kept'/);
    assert.match(text, /'factory:blocked'/);
    assert.equal(put().body.sha, 's', 'written over the version read');
  });
});

test('un déclencheur à jour n\'est pas réécrit', async () => {
  const fresh = OLD.replace("'factory:audit')", "'factory:audit' || github.event.label.name == 'factory:stack' || github.event.label.name == 'factory:kept' || github.event.label.name == 'factory:blocked')");
  await withPanel({ files: { [FILE]: fresh } }, async ({ page, writes, url }) => {
    await page.goto(url);
    await page.waitForSelector('#project-view:not([hidden])');
    await page.waitForTimeout(1000);
    assert.ok(!writes.some((w) => w.path === PATH));
  });
});

test('si le jeton ne peut pas mettre le déclencheur à jour, le panneau le dit en clair', async () => {
  await withPanel({ files: { [FILE]: OLD }, forbidden: new Set([PATH]) }, async ({ page, url }) => {
    await page.goto(url);
    await page.waitForFunction(() => /pas à jour/.test(document.querySelector('#toast.show')?.textContent || ''), null, { timeout: 5000 });
    assert.match(await toastText(page), /nouveau jeton/);
  });
});

test('si GitHub refuse le réveil après « Garder », le panneau le dit au lieu de se taire', async () => {
  await withPanel({ issues: [idea(5, 'Importer depuis un site')], config: { autoPick: true }, forbidden: new Set(['/repos/o/r/actions/workflows/factory.yml/dispatches']) }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('button', { name: /Garder l'idée #5/ }).click();
    await page.waitForFunction(() => /démarrera plus tard/.test(document.querySelector('#toast.show')?.textContent || ''), null, { timeout: 5000 });
    assert.match(await toastText(page), /Actions/);
  });
});

test('le bouton de création du jeton demande les droits Actions et Workflows', async () => {
  await withPanel({ token: false }, async ({ page, url }) => {
    await page.goto(url);
    const href = await page.locator('#login a.button').getAttribute('href');
    assert.match(href, /actions=write/);
    assert.match(href, /workflows=write/);
  });
});
