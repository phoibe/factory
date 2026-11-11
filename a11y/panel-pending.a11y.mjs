// A plate the owner just acted on waits in « Prise en compte en cours… » until GitHub catches up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'panel');
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/ratelimit.mjs': 'scripts/lib/ratelimit.mjs', '/answer.mjs': 'scripts/lib/answer.mjs', '/waits.mjs': 'scripts/lib/waits.mjs', '/trust.mjs': 'scripts/lib/trust.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
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
  const browser = await launchBrowser(server);
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
    await page.waitForSelector('.ticket.yours');
    assert.equal(await page.locator('.pending-zone').count(), 0, 'no zone while nothing waits');
    assert.equal(await page.locator('.ticket.yours').count(), 2);
    // Click « Répondre » on plate 2 (opens GitHub in a new tab), then come back.
    const popup = page.waitForEvent('popup');
    await page.locator('.ticket.yours[data-number="2"] a.button').click();
    await (await popup).close();
    assert.equal(await page.locator('.pending-zone').count(), 0, 'not before coming back');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector('.pending-zone');
    assert.deepEqual(await page.locator('.ticket.yours').evaluateAll((n) => n.map((x) => x.dataset.number)), ['1']);
    assert.match(await page.locator('.pending-zone').textContent(), /Carte 2/);
    // The waiting card keeps its shape and status line, and its « Répondre » button.
    assert.match(await page.locator('.pending-zone').textContent(), /En attente de GitHub/);
    const reply = page.locator('.pending-zone .ticket[data-number="2"] a.button');
    assert.equal(await reply.textContent(), 'Répondre');
    assert.equal(await reply.getAttribute('href'), 'http://x/2');
    await page.reload();
    await page.waitForSelector('.pending-zone');
    assert.deepEqual(await page.locator('.ticket.yours').evaluateAll((n) => n.map((x) => x.dataset.number)), ['1']);
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
  const browser = await launchBrowser(server);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 480 } }); // short screen: the « go » sits low, where the toast shows
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
    assert.equal(await page.locator('.ticket.yours').count(), 0);
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
    // Small to the eye, but a thumb-sized (44 px) touch area around every button of the row.
    // Measured and probed in one step once the cards have stopped sliding, so nothing moves in between.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity));
    const reach = await page.evaluate(() => [...document.querySelectorAll('.pending-zone .card-actions > *')].map((b) => {
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = (px, py) => document.elementFromPoint(px, py)?.closest('.card-actions > *') === b;
      return { height: r.height, tall: hit(x, r.top - (44 - r.height) / 2 + 0.5) && hit(x, r.bottom + (44 - r.height) / 2 - 0.5), wide: hit(r.left - 3.5, y) && hit(r.right + 3.5, y) };
    }));
    assert.ok(reach.length >= 2);
    for (const r of reach) {
      assert.ok(r.height <= 36, 'a compact button, not a big block');
      assert.ok(r.tall && r.wide, 'big enough for a thumb (44 px)');
    }
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
    const blocked = page.locator('.pending-zone .ticket[data-number="3"]');
    // Its red border stays red under the pointer.
    await blocked.hover();
    await page.waitForTimeout(400); // the border colour has a short transition
    const red = await blocked.evaluate((n) => { const p = document.createElement('span'); p.style.color = 'var(--danger)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return [getComputedStyle(n).borderTopColor, c]; });
    assert.equal(red[0], red[1]);
    // In the dark theme the grey « go » stays quieter than the muted grey (it is not the brightest block on the board).
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await page.evaluate(() => { const p = document.createElement('span'); p.style.color = 'var(--muted)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return [getComputedStyle(document.querySelector('.pending-zone button.go')).backgroundColor, c]; });
    assert.notEqual(dark[0], dark[1]);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.mouse.move(0, 0);
    // With the keyboard: « go » starts the countdown, keeps the focus across redraws, and Enter cancels it.
    await go.focus();
    // The « go » sits at the very bottom of the screen, where the toast shows.
    await page.evaluate(() => { const b = document.querySelector('.pending-zone button.go[data-go="1"]').getBoundingClientRect(); scrollBy(0, b.bottom - innerHeight + 2); });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Annuler/.test(document.querySelector('.pending-zone button.go[data-go="1"]')?.textContent || ''));
    // The countdown stays readable: on screen, not under the toast, and named « Annuler » for screen readers.
    const seen = await page.evaluate(() => {
      const b = document.querySelector('.pending-zone button.go[data-go="1"]').getBoundingClientRect();
      const t = document.getElementById('toast').getBoundingClientRect();
      return { onScreen: b.top >= 0 && b.bottom <= innerHeight, underToast: b.bottom > t.top && b.top < t.bottom && b.right > t.left && b.left < t.right };
    });
    assert.deepEqual(seen, { onScreen: true, underToast: false });
    assert.match(await page.locator('.pending-zone button.go[data-go="1"]').getAttribute('aria-label'), /^Annuler le go pour #1/);
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); // forces a redraw while the countdown runs
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.go), '1', 'focus stays on « go »');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.pending-zone button.go[data-go="1"]').textContent(), 'go');
    await page.waitForTimeout(5500);
    assert.deepEqual(posted, [], 'a cancelled « go » sends nothing');
    assert.match(await page.locator('.pending-zone button.go[data-go="1"]').getAttribute('aria-label'), /^go pour #1/);
    // Sent: « Envoi… » stays readable on the waiting card (not faded).
    // The button turns to « Envoi… » just before the request leaves: wait for the request itself.
    await page.locator('.pending-zone button.go[data-go="1"]').click();
    for (let t = Date.now(); !posted.length && Date.now() - t < 10000;) await page.waitForTimeout(50);
    assert.deepEqual(posted, ['/repos/o/r/issues/1/comments']);
    // Read on the live button: a redraw may replace it right after the request.
    await page.waitForFunction(() => { const b = document.querySelector('.pending-zone button.go[data-go="1"]'); return b?.disabled && getComputedStyle(b).opacity === '1'; }, null, { timeout: 10000 });
    // The blocked card keeps its red « Bloqué » tag and its « Débloquer » button.
    assert.equal(await blocked.locator('.blocked-tag').textContent(), 'Bloqué');
    assert.equal(await blocked.locator('a.button').textContent(), 'Débloquer');
    assert.match(await blocked.textContent(), /En attente de GitHub/);
  } finally {
    await browser.close();
    server.close();
  }
});
