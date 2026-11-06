#!/usr/bin/env node
// Opens a deployed version of a project (a PR's preview, or the live site after a merge) the way a visitor would,
// and says whether it works. Read-only on purpose: only page loads, never a click that writes, since a preview often
// shares the live database.
//   node scripts/smoke.mjs --url https://… [--dir <project checkout>] [--out result.json]
// Result: { result: 'passed' | 'failed' | 'skipped', detail } (written to --out, and printed). Always exits 0:
// the caller decides what a failure means.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserSetup } from './checks.mjs';
import { fromJobOutput } from './lib/job-output.mjs';

// The screens to open: « / » plus the ones the project lists in e2e/smoke-routes.txt (one path per line, # comments).
export function smokeRoutes(text) {
  const listed = String(text || '').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter((l) => l.startsWith('/'));
  return [...new Set(['/', ...listed])];
}

// The address of one screen. Routes are relative to the site, not to the domain: a site hosted in a sub-folder
// (GitHub Pages: https://owner.github.io/project/) must open « / » as its own home, never the domain's root.
export function routeUrl(route, base) {
  const u = new URL(base);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  u.search = '';
  u.hash = '';
  return new URL('./' + String(route).replace(/^\/+/, ''), u).toString();
}

// A deployment protected by its host's sign-in (Vercel Authentication…) cannot be opened by a robot: not a failure.
export function isProtected(status, location = '') {
  return status === 401 || status === 403 || /vercel\.com\/(login|sso)|\/sso-api|_vercel_sso/.test(String(location));
}

// What went wrong on one page, in plain French, or null.
export function pageProblem({ status, errors = [], serverErrors = [], text = '' }) {
  if (status >= 400) return `la page répond ${status}`;
  if (serverErrors.length) return `le serveur répond une erreur (${serverErrors.slice(0, 3).join(', ')})`;
  if (errors.length) return `erreur dans la page : ${String(errors[0]).slice(0, 200)}`;
  if (!String(text).trim()) return 'la page est vide';
  return null;
}

async function probe(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { redirect: 'manual' });
    return { status: res.status, location: res.headers.get('location') || '' };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

function loadPlaywright(dir) {
  const req = createRequire(join(dir, 'noop.js'));
  for (const name of ['playwright', '@playwright/test']) { try { return req(name); } catch { /* next */ } }
  return null;
}

// The live site right after a delivery may still be published (a 404 for a minute): a failure is checked again every
// `intervalMs` until `retryMs` has passed (issue #227). Only a failure is retried; a pass or a skip is final.
export async function smokeUntil({ check, retryMs, intervalMs = 60_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() }) {
  const deadline = now() + retryMs;
  let out = await check(0);
  for (let attempt = 1; out.result === 'failed' && now() < deadline; attempt++) {
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
    out = await check(attempt);
  }
  if (out.result === 'failed' && retryMs > 0) out = { ...out, detail: `${out.detail} (toujours après ${Math.round(retryMs / 60_000)} min)` };
  return out;
}

// The attempts of smokeUntil: the project's tools are installed once, by the first attempt that gets that far (an
// attempt that stops earlier, on an address that does not answer yet, installs nothing).
export function smokeAttempts({ url, dir = '.', run = smoke }) {
  let installed = false;
  return () => run({ url, dir, install: !installed, onInstalled: () => { installed = true; } });
}

// `install: false` reuses the tools a previous attempt installed (see smokeAttempts).
export async function smoke({ url, dir = '.', fetchImpl = fetch, log = console.error, install = true, onInstalled = () => {} } = {}) {
  const first = await probe(url, fetchImpl);
  if (first.status === 0) return { result: 'failed', detail: `l'adresse ne répond pas (${first.error})` };
  if (isProtected(first.status, first.location)) return { result: 'skipped', detail: "la version est protégée par l'hébergeur : pas d'ouverture automatique possible" };
  if (first.status >= 500) return { result: 'failed', detail: `la page d'accueil répond ${first.status}` };
  const pkgPath = join(dir, 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : null;
  const setup = pkg && browserSetup(pkg);
  if (!setup) return first.status < 400 ? { result: 'passed', detail: "la page d'accueil répond (pas de navigateur dans ce projet)" } : { result: 'failed', detail: `la page d'accueil répond ${first.status}` };
  const run = (cmd) => spawnSync(cmd[0], cmd.slice(1), { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, CI: 'true' } }).status;
  if (install) {
    if (run(existsSync(join(dir, 'package-lock.json')) ? ['npm', 'ci', '--ignore-scripts'] : ['npm', 'install', '--ignore-scripts']) !== 0) {
      return { result: 'skipped', detail: "les outils du projet ne s'installent pas : vérification sautée" };
    }
    run(setup.install);
    if (run(setup.probe) !== 0) run(setup.deps);
    onInstalled();
  }
  const pw = loadPlaywright(resolve(dir));
  if (!pw) return { result: 'skipped', detail: 'navigateur introuvable : vérification sautée' };
  const routesFile = join(dir, 'e2e/smoke-routes.txt');
  const routes = smokeRoutes(existsSync(routesFile) ? readFileSync(routesFile, 'utf8') : '');
  const origin = new URL(url).origin;
  let browser;
  try { browser = await pw.chromium.launch(); } catch (e) { return { result: 'skipped', detail: `le navigateur ne démarre pas (${e.message.slice(0, 120)})` }; }
  try {
    for (const route of routes) {
      const page = await browser.newPage();
      const errors = [];
      const serverErrors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => { if (r.status() >= 500 && r.url().startsWith(origin)) serverErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      const target = routeUrl(route, url);
      let status = 0;
      try {
        const res = await page.goto(target, { waitUntil: 'networkidle', timeout: 45_000 });
        status = res?.status() ?? 0;
      } catch (e) {
        await page.close();
        return { result: 'failed', detail: `${route} : la page ne se charge pas (${e.message.slice(0, 120)})` };
      }
      if (isProtected(status, page.url())) { await page.close(); return { result: 'skipped', detail: "la version est protégée par l'hébergeur : pas d'ouverture automatique possible" }; }
      const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      await page.close();
      const problem = pageProblem({ status, errors, serverErrors, text });
      if (problem) return { result: 'failed', detail: `${route} : ${problem}` };
      log(`ok ${route}`);
    }
  } finally {
    await browser.close();
  }
  return { result: 'passed', detail: `${routes.length} écran(s) ouvert(s) sans erreur` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  let out;
  try {
    const retryMs = (Number(arg('retry-minutes')) || 0) * 60_000;
    out = await smokeUntil({ retryMs, check: smokeAttempts({ url: fromJobOutput(arg('url')), dir: arg('dir') || '.' }) });
  } catch (e) {
    out = { result: 'skipped', detail: `vérification impossible (${String(e.message || e).slice(0, 120)})` };
  }
  console.log(JSON.stringify(out));
  if (arg('out')) writeFileSync(arg('out'), JSON.stringify(out));
  process.exit(0);
}
