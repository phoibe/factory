// The panel served locally against a fake GitHub, for the journeys of e2e/*.e2e.mjs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../a11y/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'panel');
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

export const issue = (number, title, labels, extra = {}) => ({ number, title, state: 'open', labels: labels.map((name) => ({ name })), comments: 0, html_url: `https://github.com/o/r/issues/${number}`, created_at: new Date(Date.now() - 300000).toISOString(), updated_at: new Date().toISOString(), user: { login: 'o' }, author_association: 'OWNER', body: '', ...extra });

// Runs `journey` with a page on the panel. `issues` is the open list GitHub returns; every write is recorded.
export async function withPanel({ issues = [], token = true }, journey) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      const body = await readFile(EXTRA[path] ? join(ROOT, EXTRA[path]) : join(PANEL, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0);
  const browser = await launchBrowser(server);
  const writes = [];
  try {
    const context = await browser.newContext();
    if (token) await context.addInitScript(() => localStorage.setItem('factory.token', 'test'));
    await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'github' }));
    const page = await context.newPage();
    await page.route('https://api.github.com/**', (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() !== 'GET') { writes.push({ method: req.method(), path, body: req.postDataJSON?.() ?? null }); return json({}); }
      if (path === '/user/repos') return json([{ full_name: 'o/r', name: 'r', owner: { login: 'o' }, private: true, html_url: 'https://github.com/o/r', homepage: '' }]);
      if (path.endsWith('/contents/factory.config.json')) return json({ content: Buffer.from('{}').toString('base64'), encoding: 'base64', sha: 's' });
      if (path.endsWith('/contents/PRODUCT.md')) return json({}, 404);
      if (path === '/repos/o/r/issues') return json(new URL(req.url()).searchParams.get('state') === 'closed' ? [] : issues);
      return json([]);
    });
    await journey({ page, writes, url: `http://localhost:${server.address().port}/` });
  } finally {
    await browser.close();
    server.close();
  }
}
