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
    // The waiting card keeps its shape and status line, and its « Répondre » button.
    assert.match(await page.locator('.pending-zone').textContent(), /En attente de GitHub/);
    const reply = page.locator('.pending-zone .ticket[data-number="2"] a.button');
    assert.equal(await reply.textContent(), 'Répondre');
    assert.equal(await reply.getAttribute('href'), 'http://x/2');
    await page.reload();
    await page.waitForSelector('.pending-zone');
    assert.deepEqual(await page.locator('.you-item').evaluateAll((n) => n.map((x) => x.dataset.number)), ['1']);
    // Clicking « Répondre » again on the waiting card restarts the wait: it is noted as a new click.
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('factory.pending.o/r'))['2'].clickedAt);
    const again = page.waitForEvent('popup');
    await page.locator('.pending-zone .ticket[data-number="2"] a.button').click();
    await (await again).close();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('factory.pending.o/r'))['2']);
    assert.ok(after.clickedAt > before && after.backAt === null, 'a new click restarts the wait');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector('.pending-zone .ticket[data-number="2"]');
    // GitHub catches up: plate 2 moves to the next step, the zone goes away.
    issues[1] = issue(2, ['factory:feature', 'factory:building']);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => !document.querySelector('.pending-zone'), null, { timeout: 30000 });
  } finally {
    await browser.close();
    server.close();
  }
});

test('a waiting « go » card keeps a grey, cancellable « go »; a blocked one keeps « Bloqué »', async () => {
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
    await context.addInitScript(() => {
      localStorage.setItem('factory.token', 'test');
      const now = Date.now();
      localStorage.setItem('factory.pending.o/r', JSON.stringify({ 1: { column: 'spec', clickedAt: now - 2000, backAt: now - 1000 }, 3: { column: 'blocked', clickedAt: now - 2000, backAt: now - 1000 } }));
    });
    const page = await context.newPage();
    const posted = [];
    const issues = [issue(1, ['factory:feature', 'factory:spec-review']), issue(3, ['factory:feature', 'factory:blocked'])];
    await page.route('https://api.github.com/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (route.request().method() === 'POST') { posted.push(path); return json({}); }
      if (path === '/user/repos') return json([{ full_name: 'o/r', name: 'r', owner: { login: 'o' }, private: true, html_url: 'http://x/o/r', homepage: '' }]);
      if (path.endsWith('/contents/factory.config.json')) return json({ content: Buffer.from('{}').toString('base64'), encoding: 'base64' });
      if (path.endsWith('/contents/PRODUCT.md')) return json({}, 404);
      if (path === '/repos/o/r/issues') return json(issues);
      return json([]);
    });
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForSelector('.pending-zone .ticket[data-number="1"]');
    assert.equal(await page.locator('.you-item').count(), 0);
    const go = page.locator('.pending-zone button.go[data-go="1"]');
    assert.equal(await go.textContent(), 'go');
    // Grey, not blue: never the accent colour.
    const colours = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent)';
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      const b = getComputedStyle(document.querySelector('.pending-zone button.go'));
      return { accent, bg: b.backgroundColor, border: b.borderColor };
    });
    assert.notEqual(colours.bg, colours.accent);
    assert.notEqual(colours.border, colours.accent);
    const box = await go.boundingBox();
    assert.ok(box.height >= 44, 'big enough for a thumb');
    // Nothing in the waiting zone is blue: step track, borders, text, nor focus rings.
    const blue = await page.evaluate(async () => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent)';
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      const hits = [];
      const scan = () => { for (const n of document.querySelectorAll('.pending-zone, .pending-zone *')) {
        const st = getComputedStyle(n);
        for (const k of ['color', 'backgroundColor', 'borderTopColor', 'outlineColor']) if (st[k] === accent && !(k === 'outlineColor' && st.outlineStyle === 'none')) hits.push(`${n.className || n.tagName}:${k}`);
      } };
      scan();
      for (const n of document.querySelectorAll('.pending-zone a, .pending-zone button')) { n.focus(); scan(); }
      document.activeElement.blur();
      return hits;
    });
    assert.deepEqual(blue, []);
    // With the keyboard: « go » starts the countdown, keeps the focus across redraws, and Enter cancels it.
    await go.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Annuler/.test(document.querySelector('.pending-zone button.go[data-go="1"]')?.textContent || ''));
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); // forces a redraw while the countdown runs
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.go), '1', 'focus stays on « go »');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.pending-zone button.go[data-go="1"]').textContent(), 'go');
    await page.waitForTimeout(5500);
    assert.deepEqual(posted, [], 'a cancelled « go » sends nothing');
    // The blocked card keeps its red « Bloqué » tag and its « Débloquer » button.
    const blocked = page.locator('.pending-zone .ticket[data-number="3"]');
    assert.equal(await blocked.locator('.blocked-tag').textContent(), 'Bloqué');
    assert.equal(await blocked.locator('a.button').textContent(), 'Débloquer');
    assert.match(await blocked.textContent(), /En attente de GitHub/);
  } finally {
    await browser.close();
    server.close();
  }
});
