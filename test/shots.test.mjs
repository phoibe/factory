import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameScreens, slug, markdownTable, parseArgs, darkToggle, cookiesFor, differs, orderFiles, sideBySideHtml } from '../agent/scripts/shots.mjs';

test('slug names routes', () => {
  assert.equal(slug('/'), 'accueil');
  assert.equal(slug('/habits/new/'), 'habits-new');
});

test('markdown table has one side-by-side image per screen', () => {
  const md = markdownTable({ repo: 'o/r', dir: 'pr-1/t', files: ['accueil--desktop.png'] });
  assert.match(md, /blob\/claude\/factory-assets\/pr-1\/t\/compare\/accueil--desktop\.png\?raw=true/);
  assert.match(md, /\| accueil · desktop \|/);
  assert.match(md, /\| Écran \| Avant \(gauche\) · Après \(droite\) \|/);
});

test('dark rows are named "sombre" and follow the light rows', () => {
  const md = markdownTable({
    repo: 'o/r', dir: 'd',
    files: ['accueil--desktop--sombre.png', 'accueil--desktop.png', 'accueil--mobile.png', 'accueil--mobile--sombre.png'],
  });
  const labels = md.split('\n').slice(3).map((l) => l.split('|')[1].trim());
  assert.deepEqual(labels, ['accueil · desktop', 'accueil · mobile', 'accueil · desktop · sombre', 'accueil · mobile · sombre']);
  assert.deepEqual(orderFiles(['b--mobile--sombre.png', 'a--mobile.png']), ['a--mobile.png', 'b--mobile--sombre.png']);
});

test('side-by-side image shows before left and after right', () => {
  const html = sideBySideHtml({ beforeUri: 'data:b', afterUri: 'data:a' });
  assert.ok(html.indexOf('data:b') < html.indexOf('data:a'));
  assert.doesNotMatch(html, /nouvel écran/);
});

test('side-by-side image marks a new screen instead of the before', () => {
  const html = sideBySideHtml({ beforeUri: null, afterUri: 'data:a' });
  assert.match(html, /nouvel écran/);
  assert.ok(html.indexOf('nouvel écran') < html.indexOf('data:a'));
});

test('parseArgs reads flags', () => {
  assert.deepEqual(parseArgs(['capture', '--out', 'x', '--flag']), { _: ['capture'], out: 'x', flag: true });
});

test('darkToggle reads how the app switches to dark', () => {
  assert.equal(darkToggle({}), null);
  assert.equal(darkToggle({ 'dark-class': true }), null);
  assert.deepEqual(darkToggle({ 'dark-class': 'dark' }), { kind: 'class', value: 'dark' });
  assert.deepEqual(darkToggle({ 'dark-attr': 'data-theme=night' }), { kind: 'attr', name: 'data-theme', value: 'night' });
  assert.deepEqual(darkToggle({ 'dark-attr': 'data-theme' }), { kind: 'attr', name: 'data-theme', value: 'dark' });
});

test('differs detects a page that looks the same in dark', () => {
  assert.equal(differs(Buffer.from('abc'), Buffer.from('abc')), false);
  assert.equal(differs(Buffer.from('abc'), Buffer.from('abd')), true);
});

test('cookiesFor turns --cookie into session cookies for the app being captured', () => {
  assert.deepEqual(cookiesFor('session=a=b, theme=dark', 'http://localhost:3000/x'), [
    { name: 'session', value: 'a=b', url: 'http://localhost:3000' },
    { name: 'theme', value: 'dark', url: 'http://localhost:3000' },
  ]);
  assert.deepEqual(cookiesFor(undefined, 'http://localhost:3000'), []);
  assert.deepEqual(cookiesFor(true, 'http://localhost:3000'), []);
});

test('screens identical before and after are listed, not shown, and the table still names the assets branch', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const before = mkdtempSync(join(tmpdir(), 'b-'));
  const after = mkdtempSync(join(tmpdir(), 'a-'));
  for (const [f, b, a] of [['accueil--mobile.png', 'x', 'x'], ['reglages--mobile.png', 'x', 'y'], ['nouveau--mobile.png', null, 'z']]) {
    if (b) writeFileSync(join(before, f), b);
    writeFileSync(join(after, f), a);
  }
  const all = ['accueil--mobile.png', 'nouveau--mobile.png', 'reglages--mobile.png'];
  const same = sameScreens(before, after, all);
  assert.deepEqual(same, ['accueil--mobile.png']);
  assert.deepEqual(sameScreens(null, after, all), []);
  const md = markdownTable({ repo: 'o/r', dir: 'd', files: all.filter((f) => !same.includes(f)), unchanged: same });
  assert.match(md, /claude\/factory-assets/);
  assert.match(md, /identiques avant et après, non montrés : accueil · mobile/);
  assert.doesNotMatch(md, /\| accueil · mobile \|/);
  assert.match(markdownTable({ repo: 'o/r', dir: 'd', files: [], unchanged: same }), /Aucun écran n'a changé/);
});

test('the script runs from a folder whose path has a space', async () => {
  const { mkdtempSync, copyFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = join(mkdtempSync(join(tmpdir(), 'shots-')), 'a b');
  mkdirSync(dir);
  copyFileSync(new URL('../agent/scripts/shots.mjs', import.meta.url), join(dir, 'shots.mjs'));
  const run = spawnSync(process.execPath, [join(dir, 'shots.mjs')], { encoding: 'utf8' });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /usage/);
});

test('the cloud session Chromium is used when it is there', async () => {
  const { launchOptions } = await import('../agent/scripts/shots.mjs');
  assert.deepEqual(launchOptions({ CHROMIUM_PATH: '/x/chrome' }, () => false), { executablePath: '/x/chrome' });
  assert.deepEqual(launchOptions({}, (p) => p === '/opt/pw-browsers/chromium'), { executablePath: '/opt/pw-browsers/chromium' });
  assert.deepEqual(launchOptions({}, () => false), {});
});
