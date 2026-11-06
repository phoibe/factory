// The board redraws itself every few seconds: active cards must survive a redraw where nothing changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'panel');
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const issue = (number, labels) => ({ number, title: `Carte ${number}`, state: 'open', labels: labels.map((name) => ({ name })), comments: 0, html_url: `http://x/${number}`, created_at: new Date(Date.now() - 300000).toISOString(), updated_at: new Date().toISOString(), user: { login: 'a' }, body: '' });

test('active cards stay visible when the board redraws with nothing changed', async () => {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      const body = await readFile(EXTRA[path] ? join(ROOT, EXTRA[path]) : join(PANEL, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0);
  const browser = await launchBrowser(server);
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('factory.token', 'test'));
    const page = await context.newPage();
    const issues = [issue(1, ['factory:feature', 'factory:building', 'factory:running']), issue(2, ['factory:bug', 'factory:building', 'factory:running'])];
    let listed = 0;
    await page.route('https://api.github.com/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/user/repos') return json([{ full_name: 'o/r', name: 'r', owner: { login: 'o' }, private: true, html_url: 'http://x/o/r', homepage: '' }]);
      if (path.endsWith('/contents/factory.config.json')) return json({ content: Buffer.from('{}').toString('base64'), encoding: 'base64' });
      if (path.endsWith('/contents/PRODUCT.md')) return json({}, 404);
      if (path === '/repos/o/r/issues') { listed++; return json(issues); }
      return json([]);
    });
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForSelector('.lane-working .ticket');
    const seen = listed;
    // Wait for two more refreshes of the list, then let the redraw settle.
    for (let i = 0; i < 60 && listed < seen + 2; i++) await page.waitForTimeout(1000);
    await page.waitForTimeout(500);
    assert.ok(listed >= seen + 2, 'the board did not refresh');
    assert.equal(await page.locator('.lane-working .ticket').count(), 2);
    assert.equal(await page.locator('.lane-working .count').textContent(), '2');
  } finally {
    await browser.close();
    server.close();
  }
});
