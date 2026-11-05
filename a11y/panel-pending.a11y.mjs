// A plate the owner just acted on waits in « Prise en compte en cours… » until GitHub catches up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'panel');
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const issue = (number, labels) => ({ number, title: `Carte ${number}`, state: 'open', labels: labels.map((name) => ({ name })), comments: 0, html_url: `http://x/${number}`, created_at: new Date(Date.now() - 300000).toISOString(), updated_at: new Date().toISOString(), user: { login: 'a' }, body: '' });

test('a plate acted on leaves « À vous de jouer » for the waiting zone, and survives a reload', async () => {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      const body = await readFile(EXTRA[path] ? join(ROOT, EXTRA[path]) : join(PANEL, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('factory.token', 'test'));
    const page = await context.newPage();
    const issues = [issue(1, ['factory:feature', 'factory:spec-review']), issue(2, ['factory:feature', 'factory:grilling'])];
    await page.route('https://api.github.com/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/user/repos') return json([{ full_name: 'o/r', name: 'r', owner: { login: 'o' }, private: true, html_url: 'http://x/o/r', homepage: '' }]);
      if (path.endsWith('/contents/factory.config.json')) return json({ content: Buffer.from('{}').toString('base64'), encoding: 'base64' });
      if (path.endsWith('/contents/PRODUCT.md')) return json({}, 404);
      if (path === '/repos/o/r/issues') return json(issues);
      return json([]);
    });
    await context.route('http://x/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'github' }));
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForSelector('.you-item');
    assert.equal(await page.locator('.pending-zone').count(), 0, 'no zone while nothing waits');
    assert.equal(await page.locator('.you-item').count(), 2);
    // Click « Répondre » on plate 2 (opens GitHub in a new tab), then come back.
    const popup = page.waitForEvent('popup');
    await page.locator('.you-item[data-number="2"] a.button').click();
    await (await popup).close();
    assert.equal(await page.locator('.pending-zone').count(), 0, 'not before coming back');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector('.pending-zone');
    assert.deepEqual(await page.locator('.you-item').evaluateAll((n) => n.map((x) => x.dataset.number)), ['1']);
    assert.match(await page.locator('.pending-zone').textContent(), /Carte 2/);
    assert.equal(await page.locator('.pending-zone a, .pending-zone button').count(), 0);
    await page.reload();
    await page.waitForSelector('.pending-zone');
    assert.deepEqual(await page.locator('.you-item').evaluateAll((n) => n.map((x) => x.dataset.number)), ['1']);
    // GitHub catches up: plate 2 moves to the next step, the zone goes away.
    issues[1] = issue(2, ['factory:feature', 'factory:building']);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => !document.querySelector('.pending-zone'), null, { timeout: 30000 });
  } finally {
    await browser.close();
    server.close();
  }
});
