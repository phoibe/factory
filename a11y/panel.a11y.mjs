// Accessibility check of the panel: the login screen, then Suivi, Paramètres, Agent, Réglages généraux and Consommation of a signed-in
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
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/ratelimit.mjs': 'scripts/lib/ratelimit.mjs', '/answer.mjs': 'scripts/lib/answer.mjs', '/waits.mjs': 'scripts/lib/waits.mjs', '/trust.mjs': 'scripts/lib/trust.mjs', '/models.mjs': 'scripts/lib/models.mjs', '/prices.mjs': 'scripts/lib/prices.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };

// A fake GitHub account: one project with a ticket waiting for the owner, one being built, one queued,
// one finished, and one conversation. No real token, no network.
const FAKE_REPO = { name: 'exemple', full_name: 'proprio/exemple', private: true, html_url: 'https://github.com/proprio/exemple', default_branch: 'main', archived: false, is_template: false };
const label = (name) => ({ name });
const issue = (number, title, labels, extra = {}) => ({ number, title, labels: labels.map(label), state: 'open', comments: 0, created_at: '2026-11-04T10:00:00Z', updated_at: '2026-11-04T12:00:00Z', html_url: `https://github.com/proprio/exemple/issues/${number}`, user: { login: 'proprio' }, body: '', ...extra });
// « Consommation » (issue #628): one run two hours ago, a plan week started two days ago with one reading, and a
// calibration (its window holds no run: the stored dollars per point stay), so the plan columns and the question show.
const HOUR = 3600e3;
const ago = (h) => new Date(Date.now() - h * HOUR);
const USAGE_RUN = { at: ago(2).toISOString(), issue: 34, stage: 'build', size: 'medium',
  tasks: [{ type: 'pilot', kind: 'build', model: 'claude-opus-5-5', effort: 'medium' }, { type: 'review', kind: 'final-review', model: 'claude-fable-5-2', effort: 'high' },
    { type: 'code', kind: 'build', model: 'claude-opus-5-5', effort: 'medium' }],
  use: [0, 1, 2].map((i) => [ago(2).toISOString().slice(0, 13), i, i === 1 ? 'claude-fable-5-2' : 'claude-opus-5-5', 1000, 0, 0, 500000, 80000]) };
const QUOTA = { reset: { all: { day: ago(48).getDay() || 7, hour: 0 }, fable: null }, readings: [{ at: ago(1).toISOString(), all: 12, fable: 4, outside: null }],
  calibration: { from: ago(30).toISOString(), to: ago(26).toISOString(), all: 2, fable: 1, points: { all: 10, fable: 10 } } };
const asContent = (data) => ({ content: Buffer.from(JSON.stringify(data)).toString('base64'), encoding: 'base64', sha: 'u' });
async function fakeGithub(route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  // A chat message never leaves (the network drops): it stays in the conversation, « Non envoyé » (issue #580).
  if (route.request().method() === 'POST' && /\/issues(\/\d+\/comments)?$/.test(path)) return route.abort('internetdisconnected');
  if (path === '/user/repos') return json([FAKE_REPO]);
  if (path === '/repos/phoibe/factory/contents/settings.json') return json(asContent({ machine: 'dev-server', quota: QUOTA }));
  if (path === `/repos/proprio/exemple/contents/usage/${USAGE_RUN.at.slice(0, 7)}.json`) return json(asContent({ v: 1, runs: { s1: USAGE_RUN } }));
  if (/\/contents\/usage\//.test(path)) return json({ message: 'Not Found' }, 404);
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
        const screens = signedIn ? [['Suivi', 'tab-board', '.ticket'], ['Paramètres', 'tab-rules', '#rules fieldset'], ['Agent', 'tab-chat', '.conv'], ['Réglages généraux', 'general-open', '#general fieldset'], ['Consommation', 'usage-open', '#usage table']] : [['Connexion', null, '#login:not([hidden])']];
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
          if (name === 'Agent') {
            // A message that could not be sent: its red mention and its two buttons, light and dark (issue #580).
            await page.fill('#chat-input', 'Un message qui ne part pas');
            await page.click('#chat-send');
            await page.waitForSelector('.msg.unsent', { state: 'visible', timeout: 15000 });
            const unsent = await page.evaluate(() => axe.run());
            for (const v of unsent.violations) found.push(`Agent, message non envoyé (${scheme}): ${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0].target.join(' ')}`);
            // The same state at phone width: the conversation fills the screen, the buttons under the bubble.
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForSelector('.msg.unsent', { state: 'visible', timeout: 15000 });
            const phone = await page.evaluate(() => axe.run());
            for (const v of phone.violations) found.push(`Agent, message non envoyé, téléphone (${scheme}): ${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0].target.join(' ')}`);
            // 32 px seen, 44 px under the finger: the rows of pixels around the button where a touch lands on it.
            const hit = await page.locator('.msg.unsent button.resend').evaluate((b) => {
              b.scrollIntoView({ block: 'center' });
              const r = b.getBoundingClientRect(), x = r.left + r.width / 2;
              let n = 0;
              for (let y = Math.floor(r.top) - 12; y <= r.bottom + 12; y++) if (b.contains(document.elementFromPoint(x, y))) n++;
              return n;
            }).catch(() => 0);
            if (hit < 44) found.push(`Agent, message non envoyé, téléphone (${scheme}): « Renvoyer » trop petit ou caché : ${hit} px sous le doigt`);
            await page.setViewportSize({ width: 1280, height: 720 });
          }
          if (name === 'Consommation') {
            // A row unfolded and the question about use outside the factory, then the same page at phone width.
            await page.click('#usage .usage-toggle');
            await page.fill('#usage-reading-all', '15');
            await page.click('#usage-reading-save');
            await page.waitForSelector('#usage-question', { state: 'visible', timeout: 15000 });
            const open = await page.evaluate(() => axe.run());
            for (const v of open.violations) found.push(`Consommation, ligne dépliée et question (${scheme}): ${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0].target.join(' ')}`);
            const columns = await page.locator('#usage thead th').count();
            if (columns !== 7) found.push(`Consommation (${scheme}): ${columns} colonnes au lieu de 7`);
            await page.setViewportSize({ width: 390, height: 844 });
            const phone = await page.evaluate(() => axe.run());
            for (const v of phone.violations) found.push(`Consommation, téléphone (${scheme}): ${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0].target.join(' ')}`);
            const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            if (wide) found.push(`Consommation, téléphone (${scheme}): la page déborde`);
            await page.setViewportSize({ width: 1280, height: 720 });
          }
          if (name === 'Paramètres') {
            // The "Features en questions en même temps" setting sits under the auto-pick switch, in its row, set to 2 by default.
            const q = await page.evaluate(() => {
              const input = document.getElementById('maxQuestions');
              const pickRow = document.getElementById('autoPick')?.closest('.row');
              return input && { value: input.value, min: input.min, max: input.max, label: document.querySelector('label[for=maxQuestions]')?.textContent,
                afterPick: pickRow?.contains(input) === true && Boolean(pickRow.querySelector('label[for=autoPick]').compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) };
            });
            if (!q || q.value !== '2' || q.min !== '1' || q.max !== '10' || q.label !== 'En attente de vos réponses, au plus' || !q.afterPick)
              found.push(`Paramètres (${scheme}): réglage maxQuestions absent ou mal placé : ${JSON.stringify(q)}`);
            // Nested under the auto-pick switch: off while picking is off, aligned with the switch's label.
            const nest = await page.evaluate(() => ({ disabled: document.getElementById('maxQuestions').disabled,
              inputmode: document.getElementById('maxQuestions').inputMode,
              x: document.querySelector('label[for=maxQuestions]').getBoundingClientRect().x,
              pickX: document.querySelector('label[for=autoPick]').getBoundingClientRect().x }));
            if (!nest.disabled || nest.inputmode !== 'numeric' || Math.abs(nest.x - nest.pickX) > 1)
              found.push(`Paramètres (${scheme}): réglage maxQuestions pas rattaché à la pioche : ${JSON.stringify(nest)}`);
            // With picking on, a value out of range is not kept: the field goes back and a short message says why.
            await page.check('#autoPick');
            await page.fill('#maxQuestions', '11');
            await page.dispatchEvent('#maxQuestions', 'change');
            const after = await page.inputValue('#maxQuestions');
            const toastText = await page.textContent('#toast');
            if (after !== '2' || toastText !== 'Entre 1 et 10.') found.push(`Paramètres (${scheme}): valeur hors limites : champ ${after}, message ${JSON.stringify(toastText)}`);
          }
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
