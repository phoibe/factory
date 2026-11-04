#!/usr/bin/env node
// Before/after screenshots for factory PRs.
//   node .factory/scripts/shots.mjs capture --base-url http://localhost:3000 --routes /,/settings --out /tmp/shots/after
//   node .factory/scripts/shots.mjs publish --pr 12 [--before /tmp/shots/before] --after /tmp/shots/after
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
export const ASSETS_BRANCH = 'claude/factory-assets';

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

export const slug = (route) => (route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'accueil');

function loadPlaywright() {
  const req = createRequire(join(process.cwd(), 'noop.js'));
  try { return req('playwright'); } catch {}
  const globalRoot = execFileSync('npm', ['root', '-g']).toString().trim();
  return createRequire(join(globalRoot, 'noop.js'))('playwright');
}

async function capture({ baseUrl, routes, out }) {
  const { chromium } = loadPlaywright();
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage({ viewport });
      for (const route of routes) {
        await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle' });
        await page.screenshot({ path: join(out, `${slug(route)}--${name}.png`), fullPage: true });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

export function markdownTable({ repo, dir, files, hasBefore }) {
  const url = (kind, f) => `https://github.com/${repo}/blob/${ASSETS_BRANCH}/${dir}/${kind}/${f}?raw=true`;
  const rows = files.map((f) => {
    const label = f.replace(/\.png$/, '').replace('--', ' · ');
    const before = hasBefore ? `![avant](${url('before', f)})` : '_nouvel écran_';
    return `| ${label} | ${before} | ![après](${url('after', f)}) |`;
  });
  return ['| Écran | Avant | Après |', '| --- | --- | --- |', ...rows].join('\n');
}

function publish({ pr, before, after }) {
  const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
  const repo = git(['config', '--get', 'remote.origin.url']).replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '');
  const dir = `pr-${pr}/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const wt = mkdtempSync(join(tmpdir(), 'factory-assets-'));
  rmSync(wt, { recursive: true, force: true });
  let exists = true;
  try { git(['fetch', 'origin', ASSETS_BRANCH]); } catch { exists = false; }
  if (exists) git(['worktree', 'add', '-B', ASSETS_BRANCH, wt, 'FETCH_HEAD']);
  else {
    git(['worktree', 'add', '--detach', wt]);
    git(['checkout', '--orphan', ASSETS_BRANCH], wt);
    git(['rm', '-rf', '--quiet', '.'], wt);
  }
  if (before && existsSync(before)) cpSync(before, join(wt, dir, 'before'), { recursive: true });
  cpSync(after, join(wt, dir, 'after'), { recursive: true });
  git(['add', '.'], wt);
  git(['commit', '--quiet', '-m', `chore: screenshots for PR #${pr}`], wt);
  git(['push', '--quiet', 'origin', `HEAD:${ASSETS_BRANCH}`], wt);
  git(['worktree', 'remove', '--force', wt]);
  const files = readdirSync(after).filter((f) => f.endsWith('.png')).sort();
  return markdownTable({ repo, dir, files, hasBefore: Boolean(before && existsSync(before)) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (cmd === 'capture') {
    await capture({ baseUrl: args['base-url'], routes: String(args.routes || '/').split(','), out: args.out });
  } else if (cmd === 'publish') {
    console.log(publish({ pr: args.pr, before: args.before, after: args.after }));
  } else {
    console.error('usage: shots.mjs capture|publish ...');
    process.exit(2);
  }
}
