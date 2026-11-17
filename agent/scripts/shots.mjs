#!/usr/bin/env node
// Before/after screenshots for factory PRs.
//   node .factory/scripts/shots.mjs capture --base-url http://localhost:3000 --routes /,/settings --out /tmp/shots/after
//        [--dark-class dark | --dark-attr data-theme=dark]   (only for a dark theme switched by the app, not by the browser)
//        [--cookie session=abc123[,other=v]]                 (screens behind a sign-in: the session cookie to send)
//   node .factory/scripts/shots.mjs publish --pr 12 [--before /tmp/shots/before] --after /tmp/shots/after
//        [--set-aside aside.json]  ({"screener": "seule l'heure du dernier passage diffère"}: changed screens not shown, issue #422)
//   node .factory/scripts/shots.mjs run -- sh -c 'npm run build && exec npm run start -- -p 3000'   (app on the fixed time)
//   eval "$(node .factory/scripts/shots.mjs env)"   (the same environment, for a shell that launches the app itself)
//   node .factory/scripts/shots.mjs check comment.md   (exit 1 when a table row is not a displayed image)
// Capture takes light shots, then dark ones; dark shots are kept only if the page really differs from light.
// Publish builds one side-by-side image (before left, after right) per screen, size and theme.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
export const ASSETS_BRANCH = 'claude/factory-assets';
// Written when no screen changed: there is nothing to validate, so the agent does not ask for an « ok » (issue #303).
export const NO_CHANGE_MARKER = '<!-- factory-shots-unchanged -->';
export const NO_CHANGE_SENTENCE = "J'ai comparé tous les écrans, en clair et en sombre : aucun n'a changé d'apparence.";

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

export const DARK_SUFFIX = 'sombre';

// Parses --dark-class / --dark-attr into a description of how the app switches to its dark theme.
export function darkToggle({ 'dark-class': cls, 'dark-attr': attr } = {}) {
  if (typeof cls === 'string' && cls) return { kind: 'class', value: cls };
  if (typeof attr === 'string' && attr) {
    const [name, ...rest] = attr.split('=');
    return { kind: 'attr', name, value: rest.join('=') || 'dark' };
  }
  return null;
}

// Parses --cookie "a=1,b=2" into Playwright cookies for the base URL (screens behind a sign-in).
export function cookiesFor(arg, baseUrl) {
  if (typeof arg !== 'string' || !arg) return [];
  const url = new URL(baseUrl).origin;
  return arg.split(',').map((pair) => pair.trim()).filter((pair) => pair.includes('=')).map((pair) => {
    const at = pair.indexOf('=');
    return { name: pair.slice(0, at), value: pair.slice(at + 1), url };
  });
}

// True when two screenshots (PNG buffers) differ, i.e. the dark theme changes the page.
export function differs(a, b) {
  return !Buffer.from(a).equals(Buffer.from(b));
}

// Everything that moves is frozen before each shot, so that a screen that did not change gives the very same
// picture before and after: one fixed date and time (only in the captures, never in the app itself), CSS animations
// and transitions stopped (finite ones at their end, endless ones at their start), the text caret hidden, and
// reduced motion asked for (JS motion libraries then jump to their final state). No tolerance on top: one pixel
// apart is a change.
export const FROZEN_TIME = '2026-01-15T10:30:00.000Z';
export const FROZEN_CONTEXT = { reducedMotion: 'reduce' };
export const FROZEN_SHOT = { fullPage: true, animations: 'disabled', caret: 'hide' };

// The environment the app is launched with for the captures (issue #422): a Node app starts its clock on FROZEN_TIME,
// so the sample data it dates when it starts reads the same « before » and « after ». Applied by `shots.mjs run`,
// printed by `shots.mjs env`.
export function frozenEnv(env = process.env) {
  const clock = pathToFileURL(join(fileURLToPath(new URL('.', import.meta.url)), 'frozen-clock.mjs')).href;
  return { FACTORY_FROZEN_TIME: FROZEN_TIME, NODE_OPTIONS: [env.NODE_OPTIONS, `--import=${clock}`].filter(Boolean).join(' ') };
}
const shellQuote = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

export async function capture({ baseUrl, routes, out, toggle, cookies = [] }) {
  const { chromium } = loadPlaywright();
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions());
  const shoot = async (viewport, scheme, applyToggle) => {
    const context = await browser.newContext({ ...FROZEN_CONTEXT, viewport, colorScheme: scheme });
    // The clock API came with Playwright 1.45: an older project still gets its captures, only the time is not frozen.
    if (context.clock) await context.clock.setFixedTime(new Date(FROZEN_TIME));
    else console.error('playwright < 1.45: time not frozen, screens showing the time may differ before and after');
    if (cookies.length) await context.addCookies(cookies);
    if (applyToggle && toggle) {
      await context.addInitScript(({ toggle }) => {
        const root = document.documentElement;
        if (toggle.kind === 'class') root.classList.add(toggle.value);
        else root.setAttribute(toggle.name, toggle.value);
      }, { toggle });
    }
    const page = await context.newPage();
    const shots = {};
    for (const route of routes) {
      await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle' });
      shots[route] = await page.screenshot(FROZEN_SHOT);
    }
    await context.close();
    return shots;
  };
  let darkFound = false;
  try {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const light = await shoot(viewport, 'light', false);
      const dark = await shoot(viewport, 'dark', true);
      for (const route of routes) {
        writeFileSync(join(out, `${slug(route)}--${name}.png`), light[route]);
        if (differs(light[route], dark[route])) {
          darkFound = true;
          writeFileSync(join(out, `${slug(route)}--${name}--${DARK_SUFFIX}.png`), dark[route]);
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.error(darkFound
    ? 'dark theme detected: dark screenshots written (suffix --sombre)'
    : 'no dark theme detected: light screenshots only. If the app has a dark theme switched by a button/class, rerun with --dark-class or --dark-attr; if you cannot find how, say so in the PR.');
}

// The cloud sessions have a Chromium of their own whose version may not match the project's Playwright: use it.
export function launchOptions(env = process.env, exists = existsSync) {
  if (env.CHROMIUM_PATH) return { executablePath: env.CHROMIUM_PATH };
  return exists('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
}

// Light screenshots first, then dark ones, each sorted by name.
export function orderFiles(files) {
  const isDark = (f) => f.endsWith(`--${DARK_SUFFIX}.png`);
  return [...files].sort((a, b) => Number(isDark(a)) - Number(isDark(b)) || a.localeCompare(b));
}

export function sideBySideHtml({ beforeUri, afterUri }) {
  const col = (title, body) => `<div class="c"><div class="t">${title}</div>${body}</div>`;
  const before = beforeUri ? `<img src="${beforeUri}">` : '<div class="n">nouvel écran</div>';
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font:600 16px system-ui,sans-serif;color:#222}
.r{display:flex;gap:16px;padding:16px;align-items:flex-start;width:max-content}
.c{display:flex;flex-direction:column;gap:8px}.t{text-transform:uppercase;font-size:13px;letter-spacing:.05em;color:#555}
img{display:block;border:1px solid #ccc}.n{display:flex;align-items:center;justify-content:center;min-width:240px;min-height:160px;border:2px dashed #bbb;color:#888;font-style:italic;padding:24px}
</style><div class="r">${col('Avant', before)}${col('Après', `<img src="${afterUri}">`)}</div>`;
}

const dataUri = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

// Writes one side-by-side image (before left, after right) per screenshot of `after` into `out`.
export async function compose({ before, after, out, only = null }) {
  const { chromium } = loadPlaywright();
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage();
    for (const f of readdirSync(after).filter((x) => x.endsWith('.png') && (!only || only.includes(x)))) {
      const b = before && join(before, f);
      const html = sideBySideHtml({ beforeUri: b && existsSync(b) ? dataUri(b) : null, afterUri: dataUri(join(after, f)) });
      await page.setContent(html, { waitUntil: 'load' });
      await page.locator('.r').screenshot({ path: join(out, f) });
    }
  } finally {
    await browser.close();
  }
}

const label = (f) => f.replace(/\.png$/, '').replace(/--/g, ' · ');

// The screens that look exactly the same before and after (same pixels): not shown, only listed. Every main screen
// is captured, so that a change breaking a screen the feature did not touch still shows up.
export function sameScreens(before, after, files) {
  if (!before) return [];
  return files.filter((f) => existsSync(join(before, f)) && !differs(readFileSync(join(before, f)), readFileSync(join(after, f))));
}

// Which screens to show and which ones only to list. No capture at all is a mistake (a wrong folder, a capture that
// failed), never « nothing changed »: that would skip the owner's review without anything having been compared.
export function screensToShow(before, after, aside = {}) {
  const all = readdirSync(after).filter((f) => f.endsWith('.png')).sort();
  if (!all.length) throw new Error(`Aucune capture dans ${after} : relance la commande capture avant de publier.`);
  const unchanged = sameScreens(before, after, all);
  const changed = all.filter((f) => !unchanged.includes(f));
  const newScreens = changed.filter((f) => !before || !existsSync(join(before, f)));
  return { ...setAsideScreens(changed, aside, { newScreens }), unchanged };
}

// The safety net of issue #422: changed screens the agent sets aside because their only difference is data that
// changes on its own (a random draw, data from the internet). Each key is a route slug (all its sizes and themes) or
// one file name without « .png »; each value is the reason, shown to the owner. A key matching no changed screen is a
// typo and a new screen is a real change: both are refused rather than silently ignored.
export function setAsideScreens(files, aside = {}, { newScreens = [] } = {}) {
  const set = [];
  for (const [key, raw] of Object.entries(aside || {})) {
    const reason = cleanReason(raw);
    if (!reason) throw new Error(`Écran « ${key} » écarté sans raison : écris pourquoi il n'a pas de changement visible.`);
    const hits = files.filter((f) => { const stem = f.replace(/\.png$/, ''); return stem === key || stem.split('--')[0] === key; });
    if (!hits.length) throw new Error(`Écran « ${key} » à écarter introuvable parmi les écrans qui ont changé : ${files.map((f) => f.replace(/\.png$/, '')).join(', ') || 'aucun'}.`);
    const fresh = hits.filter((f) => newScreens.includes(f));
    if (fresh.length) throw new Error(`« ${key} » est un nouvel écran (absent avant) : il est toujours montré.`);
    for (const f of hits) if (!set.some((s) => s.file === f)) set.push({ file: f, reason });
  }
  return { files: files.filter((f) => !set.some((s) => s.file === f)), setAside: set };
}

// One short line: the reason is written inside the italic trace line the factory's bot posts. Cleaned again when the
// line is built, for a shots.json written by an older copy of this tool.
const cleanReason = (raw) => [...String(raw ?? '').replace(/[\s_*`|<>()]+/g, ' ').trim()].slice(0, 200).join('').trim();

// « Écrans sans changement visible, non montrés : a · desktop, a · mobile (raison) », one group per reason.
function setAsideLine(setAside) {
  const clean = setAside.map((s) => ({ file: String(s.file), reason: cleanReason(s.reason) }));
  const reasons = [...new Set(clean.map((s) => s.reason))];
  const groups = reasons.map((r) => `${orderFiles(clean.filter((s) => s.reason === r).map((s) => s.file)).map(label).join(', ')} (${r})`);
  return `_Écrans sans changement visible, non montrés : ${groups.join(' ; ')}._`;
}

export function markdownTable({ repo, dir, files, unchanged = [], setAside = [] }) {
  const url = (f) => `https://github.com/${repo}/blob/${ASSETS_BRANCH}/${dir}/compare/${f}?raw=true`;
  const rows = orderFiles(files).map((f) => `| ${label(f)} | ![avant · après](${url(f)}) |`);
  const table = rows.length ? ['| Écran | Avant (gauche) · Après (droite) |', '| --- | --- |', ...rows].join('\n') : NO_CHANGE_SENTENCE;
  // The hidden mark names the assets branch even when no image is shown: the factory reads it as « captures shown ».
  const mark = `<!-- shots: ${ASSETS_BRANCH} -->${rows.length ? '' : `\n${NO_CHANGE_MARKER}`}`;
  const notes = [
    unchanged.length ? `_Écrans identiques avant et après, non montrés : ${orderFiles(unchanged).map(label).join(', ')}._` : '',
    setAside.length ? setAsideLine(setAside) : '',
  ].filter(Boolean);
  return [`${mark}\n${table}`, ...notes].join('\n\n');
}

// Written next to the images: the factory posts the table itself from that folder (issue #378), and only this file
// tells it which screens were identical before and after.
export const SHOTS_META = 'shots.json';
export const shotsMeta = ({ files, unchanged = [], setAside = [] }) => JSON.stringify(setAside.length ? { files, unchanged, setAside } : { files, unchanged }, null, 2);

// The table rows of a screenshots message (after its hidden shots mark) that would not show an image: the agent once
// retyped the table by hand and the dark rows became broken links (issue #375). Empty when every row is an image
// from the assets branch, or when the text is not a screenshots message.
const SHOT_ROW = new RegExp(`^\\|[^|]+\\| !\\[[^\\]]*\\]\\(https://github\\.com/[\\w.-]+/[\\w.-]+/blob/${ASSETS_BRANCH.replace(/[/.]/g, '\\$&')}/[^\\s()]+\\.png\\?raw=true\\) \\|$`);
export function brokenShotRows(text) {
  const at = String(text || '').indexOf('<!-- shots:');
  if (at < 0) return [];
  const rows = String(text).slice(at).split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  return rows.filter((l) => !/^\|\s*Écran\s*\|/.test(l) && !/^\|[\s|:-]+\|$/.test(l) && !SHOT_ROW.test(l));
}

async function publish({ pr, before, after, aside = {} }) {
  const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  const { repoFromRemote } = await import('./specs.mjs');
  const repo = repoFromRemote(git(['config', '--get', 'remote.origin.url']));
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
  // Always removed, even on a failure: a leftover worktree holds the branch and makes the next try fail.
  try {
    const from = before && existsSync(before) ? before : null;
    const { files, unchanged, setAside } = screensToShow(from, after, aside);
    if (files.length) {
      await compose({ before: from, after, out: join(wt, dir, 'compare'), only: files });
      writeFileSync(join(wt, dir, SHOTS_META), shotsMeta({ files, unchanged, setAside }));
      git(['add', '.'], wt);
      git(['commit', '--quiet', '-m', `chore: screenshots for PR #${pr}`], wt);
      // Another PR may have pushed its captures meanwhile: each PR writes its own folder, so a rebase never conflicts.
      for (let attempt = 0; ; attempt++) {
        try { git(['push', '--quiet', 'origin', `HEAD:${ASSETS_BRANCH}`], wt); break; } catch (e) {
          if (!exists || attempt >= 2) throw e;
          git(['pull', '--quiet', '--rebase', 'origin', ASSETS_BRANCH], wt);
        }
      }
    }
    return markdownTable({ repo, dir, files, unchanged, setAside });
  } finally {
    try { git(['worktree', 'remove', '--force', wt]); } catch { rmSync(wt, { recursive: true, force: true }); }
  }
}

// Compared as paths: the URL form is percent-encoded (a space becomes %20) and never matched argv.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (cmd === 'capture') {
    await capture({ baseUrl: args['base-url'], routes: String(args.routes || '/').split(','), out: args.out, toggle: darkToggle(args), cookies: cookiesFor(args.cookie, args['base-url']) });
  } else if (cmd === 'check') {
    // node .factory/scripts/shots.mjs check comment.md : refuses a screenshots message whose table is broken.
    const broken = brokenShotRows(readFileSync(args._[1], 'utf8'));
    for (const row of broken) console.error(`ligne cassée : ${row}`);
    if (broken.length) process.exit(1);
  } else if (cmd === 'run') {
    // One command, so that the fixed time cannot be lost between two shell calls (the app then runs on the real clock).
    const at = process.argv.indexOf('--');
    const command = at > 0 ? process.argv.slice(at + 1) : [];
    if (!command.length) { console.error('usage: shots.mjs run -- <commande qui lance l\'appli>'); process.exit(2); }
    const { spawn } = await import('node:child_process');
    // Its own process group, so that stopping this command stops the whole app, even behind `sh -c` or npm (a shell
    // does not pass the signal on): no server left running on the port.
    const child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true, env: { ...process.env, ...frozenEnv() } });
    const stop = (sig) => { try { process.kill(-child.pid, sig); } catch { child.kill(sig); } };
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => stop(sig));
    child.on('error', (e) => { console.error(`impossible de lancer ${command[0]} : ${e.message}`); process.exit(127); });
    child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  } else if (cmd === 'env') {
    for (const [k, v] of Object.entries(frozenEnv())) console.log(`export ${k}=${shellQuote(v)}`);
  } else if (cmd === 'publish') {
    let aside = {};
    if (typeof args['set-aside'] === 'string') {
      try { aside = JSON.parse(readFileSync(args['set-aside'], 'utf8')); } catch (e) {
        console.error(`Le fichier ${args['set-aside']} n'est pas un JSON valide ({"écran": "raison"}) : ${e.message}`);
        process.exit(2);
      }
    }
    console.log(await publish({ pr: args.pr, before: args.before, after: args.after, aside }));
  } else {
    console.error('usage: shots.mjs capture|publish|check|run|env ...');
    process.exit(2);
  }
}
