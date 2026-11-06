// Accessibility check of the panel: the login screen, then Suivi, Règles and Discussion of a signed-in
// (fake) account, each in the light and the dark theme. A violation fails the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'panel');
// The Pages workflow copies these next to the panel files; the test server does the same.
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };

// A fake GitHub account: one project with a ticket waiting for the owner, one being built, one queued,
// one finished, and one conversation. No real token, no network.
const FAKE_REPO = { name: 'exemple', full_name: 'proprio/exemple', private: true, html_url: 'https://github.com/proprio/exemple', default_branch: 'main', archived: false, is_template: false };
const label = (name) => ({ name });
const issue = (number, title, labels, extra = {}) => ({ number, title, labels: labels.map(label), state: 'open', comments: 0, created_at: '2026-11-04T10:00:00Z', updated_at: '2026-11-04T12:00:00Z', html_url: `https://github.com/proprio/exemple/issues/${number}`, user: { login: 'proprio' }, body: '', ...extra });
async function fakeGithub(route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path === '/user/repos') return json([FAKE_REPO]);
  if (path === '/repos/proprio/exemple/contents/factory.config.json') {
    const content = (await readFile(join(ROOT, 'defaults/factory.config.json'))).toString('base64');
    return json({ content, sha: 'abc', name: 'factory.config.json' });
  }
  if (path === '/repos/proprio/exemple/issues') {
    const chat = url.searchParams.has('labels');
    if (chat) return json([issue(12, 'Comment ajouter un bouton ?', ['factory:chat'], { comments: 1, updated_at: '2026-11-04T13:20:00Z' })]);
    return json([
      issue(33, 'Valider la spec du panier', ['factory:feature', 'factory:spec-review']),
      issue(34, 'Page de connexion', ['factory:feature', 'factory:building', 'factory:running']),
      issue(35, 'Mode sombre', ['factory:feature', 'factory:queued']),
    ]);
  }
  if (path === '/repos/proprio/exemple/pulls') return json([{ number: 30, title: 'Ajouter le panier', merged_at: '2026-11-04T11:00:00Z', state: 'closed', labels: [], html_url: 'https://github.com/proprio/exemple/pull/30', user: { login: 'proprio' } }]);
  if (/\/issues\/\d+\/comments$/.test(path)) return json([]);
  if (path.endsWith('/issues/events')) return json([]);
  if (path.includes('/compare/')) return json({ ahead_by: 0, commits: [] });
  return json([]);
}

test('panel screens have no axe violations, in the light and the dark theme', async () => {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      const body = await readFile(EXTRA[path] ? join(ROOT, EXTRA[path]) : join(PANEL, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0);
  const browser = await launchBrowser(server);
  const found = [];
  try {
    for (const scheme of ['light', 'dark']) {
      for (const signedIn of [false, true]) {
        const context = await browser.newContext({ colorScheme: scheme });
        const page = await context.newPage();
        await page.route('https://api.github.com/**', fakeGithub);
        await page.addInitScript((on) => { if (on) localStorage.setItem('factory.token', 'fake-token-for-tests'); }, signedIn);
        await page.goto(`http://localhost:${server.address().port}/`);
        const screens = signedIn ? [['Suivi', 'tab-board', '.ticket'], ['Règles', 'tab-rules', '#rules fieldset'], ['Discussion', 'tab-chat', '.conv']] : [['Connexion', null, '#login:not([hidden])']];
        for (const [name, tab, ready] of screens) {
          if (tab) {
            await page.waitForSelector('#project-view:not([hidden])');
            await page.click(`#${tab}`);
          }
          await page.waitForSelector(ready, { state: 'visible', timeout: 15000 });
          // Cards fade in: measuring contrast mid-fade gives false failures, so wait for finite animations to end.
          await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
          await page.evaluate(axeSource);
          const result = await page.evaluate(() => axe.run());
          for (const v of result.violations) found.push(`${name} (${scheme}): ${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0].target.join(' ')}`);
        }
        await context.close();
      }
    }
    assert.deepEqual(found, []);
  } finally {
    await browser.close();
    server.close();
  }
});
