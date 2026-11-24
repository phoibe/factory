// Journey of issue #561: the panel as it will be published (every file stamped with the build) starts,
// and every file it loads is asked for with the same number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withPanel, issue } from './fixture.mjs';
import { buildSite } from '../scripts/stamp-panel.mjs';

const B = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const modules = (dir, base = '') => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  if (statSync(p).isDirectory()) return modules(p, `${base}/${name}`);
  return name.endsWith('.mjs') ? [`${base}/${name}`] : [];
});

test('le tableau de bord tel qu\'il sera publié démarre, et tous ses fichiers sont demandés avec le même numéro', async () => {
  const root = mkdtempSync(join(tmpdir(), 'site-'));
  try {
    buildSite({ out: root, build: B });
    await withPanel({ root, issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])] }, async ({ page, url }) => {
      const errors = [];
      const requested = [];
      const origin = new URL(url).origin;
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => { const u = new URL(r.url()); if (u.origin === origin) requested.push(u); });
      await page.goto(url);
      await page.locator('.ticket', { hasText: 'Une carte' }).first().waitFor();
      await page.getByRole('button', { name: 'Sur mon téléphone' }).click();
      await page.locator('#phone-qr svg').waitFor();

      assert.deepEqual(errors, []);
      assert.equal(await page.locator('meta[name="build"]').getAttribute('content'), B);
      for (const u of requested) {
        if (/\.(mjs|js|css)$/.test(u.pathname) || ['/catalog.json', '/factory.config.json'].includes(u.pathname)) {
          assert.equal(u.search, `?v=${B}`, `${u.pathname} is asked for without the build`);
        }
        if (/\.(woff2|svg|png)$/.test(u.pathname) || u.pathname === '/chat-server.json') assert.equal(u.search, '', `${u.pathname} is stamped`);
      }
      const asked = requested.filter((u) => u.pathname.endsWith('.mjs'));
      const published = modules(root).sort();
      assert.deepEqual([...new Set(asked.map((u) => u.pathname))].sort(), published);
      assert.equal(new Set(asked.map((u) => u.href)).size, published.length, 'a module is loaded under two addresses');
      for (const path of ['/style.css', '/catalog.json', '/factory.config.json', '/vendor/qrcode.js']) {
        assert.ok(requested.some((u) => u.pathname === path), `${path} was not asked for`);
      }
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
