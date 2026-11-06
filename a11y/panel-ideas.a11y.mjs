// « Idées à trier »: what the agent proposed by itself waits there, calm, until the owner keeps or drops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'panel');
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/ratelimit.mjs': 'scripts/lib/ratelimit.mjs', '/answer.mjs': 'scripts/lib/answer.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const AGENT = '<!-- factory-agent -->\nRepéré pendant la review générale.';
const issue = (number, title, labels, body = '') => ({ number, title, state: 'open', labels: labels.map((name) => ({ name })), comments: 0, html_url: `http://x/${number}`, created_at: new Date(Date.now() - 300000).toISOString(), updated_at: new Date().toISOString(), user: { login: 'a' }, body });

export function serve() {
  return createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      const body = await readFile(EXTRA[path] ? join(ROOT, EXTRA[path]) : join(PANEL, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0);
}

export const IDEAS = () => [
  issue(1, 'Répétition : lieu, heure et confirmation de venue', ['factory:feature', 'factory:building', 'factory:running']),
  issue(36, 'Codes à 4 chiffres : blocage de plus en plus long après des essais ratés', ['factory:feature'], AGENT),
  issue(41, 'Tester les disponibilités et les répétitions sur une vraie base', ['factory:feature'], AGENT),
  issue(44, 'Un test automatique de la grille échoue au hasard', ['factory:bug'], AGENT),
  issue(50, 'Ma demande à moi', ['factory:feature', 'factory:queued']),
];

// Answers the panel's GitHub calls from `issues`, and records the writes.
export function mockGitHub(page, issues, writes) {
  return page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET') {
      writes.push([req.method(), path, req.postDataJSON()]);
      const n = Number(/issues\/(\d+)/.exec(path)?.[1]);
      const it = issues.find((i) => i.number === n);
      if (it && path.endsWith('/labels')) it.labels.push(...req.postDataJSON().labels.map((name) => ({ name })));
      if (it && req.method() === 'PATCH') issues.splice(issues.indexOf(it), 1);
      return json({});
    }
    if (path === '/user/repos') return json([{ full_name: 'o/r', name: 'r', owner: { login: 'o' }, private: true, html_url: 'http://x/o/r', homepage: '' }]);
    if (path.endsWith('/contents/factory.config.json')) return json({ content: Buffer.from('{"autoPick":true}').toString('base64'), encoding: 'base64' });
    if (path.endsWith('/contents/PRODUCT.md')) return json({}, 404);
    if (path === '/repos/o/r/issues') return json(issues);
    return json([]);
  });
}

test('ideas to sort: listed apart from the cards, kept or dropped in one click', async () => {
  const server = serve();
  const browser = await launchBrowser(server);
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('factory.token', 'test'));
    const page = await context.newPage();
    const issues = IDEAS();
    const writes = [];
    await mockGitHub(page, issues, writes);
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForSelector('.lane-ideas .ticket');
    assert.equal(await page.locator('.lane-ideas .count').textContent(), '3');
    assert.equal(await page.locator('.lane-ideas', { hasText: 'Ma demande à moi' }).count(), 0, "the owner's own request is not an idea");
    assert.equal(await page.locator('.you-card', { hasText: 'Codes à 4 chiffres' }).count(), 0, 'an idea never waits in « À vous »');
    await page.getByRole('button', { name: /Garder l'idée #36/ }).click();
    await page.waitForFunction(() => document.querySelector('.lane-ideas .count')?.textContent === '2');
    assert.deepEqual(writes[0], ['POST', '/repos/o/r/issues/36/labels', { labels: ['factory:kept'] }]);
    await page.getByRole('button', { name: /Jeter l'idée #44/ }).click();
    await page.waitForFunction(() => document.querySelector('.lane-ideas .count')?.textContent === '1');
    assert.deepEqual(writes[1], ['PATCH', '/repos/o/r/issues/44', { state: 'closed', state_reason: 'not_planned' }]);
    // The remaining buttons can be reached and pressed with the keyboard.
    await page.getByRole('button', { name: /Garder l'idée #41/ }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.lane-ideas'));
    const axe = await readFile(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
    issues.push(issue(60, 'Une autre idée', ['factory:feature'], AGENT));
    await page.reload();
    await page.waitForSelector('.lane-ideas .ticket');
    await page.evaluate(axe);
    const result = await page.evaluate(() => window.axe.run(document.querySelector('.lane-ideas'), { runOnly: ['wcag2a', 'wcag2aa'] }));
    assert.deepEqual(result.violations.map((v) => v.id), []);
  } finally {
    await browser.close();
    server.close();
  }
});
