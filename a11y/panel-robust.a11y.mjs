// The panel survives a project whose settings file is broken, and a « go » never lands on another project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'panel');
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/ratelimit.mjs': 'scripts/lib/ratelimit.mjs', '/answer.mjs': 'scripts/lib/answer.mjs', '/waits.mjs': 'scripts/lib/waits.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const issue = (number, labels) => ({ number, title: `Carte ${number}`, state: 'open', labels: labels.map((name) => ({ name })), comments: 0, html_url: `http://x/${number}`, created_at: new Date(Date.now() - 300000).toISOString(), updated_at: new Date().toISOString(), user: { login: 'a' }, body: '' });
const repo = (name) => ({ full_name: `o/${name}`, name, owner: { login: 'o' }, private: true, html_url: `http://x/o/${name}`, homepage: '' });

async function withPanel(configs, run) {
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
    const posts = [];
    const page = await context.newPage();
    await page.route('https://api.github.com/**', (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() === 'POST') { posts.push(path); return json({}); }
      if (path === '/user/repos') return json(Object.keys(configs).map(repo));
      const m = path.match(/^\/repos\/o\/([^/]+)\/contents\/factory\.config\.json$/);
      if (m) return json({ content: Buffer.from(configs[m[1]]).toString('base64'), encoding: 'base64' });
      if (path.endsWith('/contents/PRODUCT.md')) return json({}, 404);
      if (/^\/repos\/o\/[^/]+\/issues$/.test(path)) return json([issue(1, ['factory:feature', 'factory:spec-review'])]);
      return json([]);
    });
    await run({ context, page, posts, url: `http://localhost:${server.address().port}/` });
  } finally {
    await browser.close();
    server.close();
  }
}

test('a project with a broken settings file still opens, with the default settings', async () => {
  await withPanel({ good: '{}', bad: '{ not json' }, async ({ context, page, url }) => {
    await context.addInitScript(() => { localStorage.setItem('factory.token', 'test'); localStorage.setItem('factory.project', 'o/bad'); });
    await page.goto(url);
    await page.waitForSelector('#project-view:not([hidden])', { timeout: 15000 });
    assert.equal(await page.locator('#project-name').textContent(), 'bad');
    await page.waitForSelector('.ticket.yours');
  });
});

test('a « go » counting down is cancelled when another project is opened', async () => {
  await withPanel({ a: '{}', b: '{}' }, async ({ context, page, posts, url }) => {
    await context.addInitScript(() => { localStorage.setItem('factory.token', 'test'); localStorage.setItem('factory.project', 'o/a'); });
    await page.goto(url);
    await page.locator('button.go[data-go="1"]').click();
    await page.selectOption('#project', 'o/b');
    await page.waitForFunction(() => document.querySelector('#project-name').textContent === 'b');
    await page.waitForTimeout(6500);
    assert.deepEqual(posts.filter((p) => p.endsWith('/comments')), []);
    assert.equal(await page.locator('button.go[data-go="1"]').textContent(), 'go');
  });
});
