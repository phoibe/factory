import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameScreens, slug, markdownTable, NO_CHANGE_MARKER, NO_CHANGE_SENTENCE, screensToShow, parseArgs, darkToggle, cookiesFor, differs, orderFiles, sideBySideHtml } from '../agent/scripts/shots.mjs';

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
  assert.match(markdownTable({ repo: 'o/r', dir: 'd', files: [], unchanged: same }), /aucun n'a changé d'apparence/);
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

// A page that changes on every load if nothing is frozen: the time, a running animation, a focused field.
async function serveMovingPage(extra = '') {
  const { createServer } = await import('node:http');
  const html = `<!doctype html><meta charset="utf-8"><style>
@keyframes spin{to{transform:rotate(360deg)}} .s{width:60px;height:60px;background:#c33;animation:spin 1.3s linear infinite}
.f{width:60px;height:20px;background:#36c;animation:grow 2s ease-out forwards} @keyframes grow{from{width:0}to{width:200px}}
</style><p id="t"></p><div class="s"></div><div class="f"></div><input autofocus value="abc">${extra}
<script>document.getElementById('t').textContent = new Date().toISOString() + ' ' + Date.now();</script>`;
  const server = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html); });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('a screen that did not change gives the very same picture, even with an animation and the time on it', async () => {
  const { mkdtempSync, readdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { capture } = await import('../agent/scripts/shots.mjs');
  const { server, url } = await serveMovingPage();
  const before = mkdtempSync(join(tmpdir(), 'b-'));
  const after = mkdtempSync(join(tmpdir(), 'a-'));
  try {
    await capture({ baseUrl: url, routes: ['/'], out: before, toggle: null });
    await new Promise((ok) => setTimeout(ok, 700));
    await capture({ baseUrl: url, routes: ['/'], out: after, toggle: null });
    const files = readdirSync(after).sort();
    assert.deepEqual(sameScreens(before, after, files), files);
  } finally {
    server.close();
    for (const d of [before, after]) rmSync(d, { recursive: true, force: true });
  }
});

test('a real small change is still shown', async () => {
  const { mkdtempSync, readdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { capture } = await import('../agent/scripts/shots.mjs');
  const a = await serveMovingPage();
  const b = await serveMovingPage('<p>,</p>');
  const before = mkdtempSync(join(tmpdir(), 'b-'));
  const after = mkdtempSync(join(tmpdir(), 'a-'));
  try {
    await capture({ baseUrl: a.url, routes: ['/'], out: before, toggle: null });
    await capture({ baseUrl: b.url, routes: ['/'], out: after, toggle: null });
    const files = readdirSync(after).sort();
    assert.deepEqual(sameScreens(before, after, files), []);
  } finally {
    a.server.close(); b.server.close();
    for (const d of [before, after]) rmSync(d, { recursive: true, force: true });
  }
});

test('each shot hides the text caret and stops animations', async () => {
  const { FROZEN_SHOT } = await import('../agent/scripts/shots.mjs');
  assert.equal(FROZEN_SHOT.caret, 'hide');
  assert.equal(FROZEN_SHOT.animations, 'disabled');
});

test('when no screen changed, the output carries the no-change mark and only an information sentence, no question', () => {
  const md = markdownTable({ repo: 'o/r', dir: 'd', files: [], unchanged: ['accueil--mobile.png'] });
  assert.ok(md.includes(NO_CHANGE_MARKER));
  assert.ok(md.includes(NO_CHANGE_SENTENCE));
  assert.doesNotMatch(md, /Répondez|\?/);
  assert.match(md, /claude\/factory-assets/);
});

test('when a screen changed, the output has no no-change mark', () => {
  const md = markdownTable({ repo: 'o/r', dir: 'd', files: ['accueil--mobile.png'] });
  assert.ok(!md.includes(NO_CHANGE_MARKER));
});

test('no capture at all is an error, never reported as « no screen changed »', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const empty = mkdtempSync(join(tmpdir(), 'a-'));
  assert.throws(() => screensToShow(null, empty), /Aucune capture/);
});

test('identical captures before and after end in the no-change output, with nothing to show', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const before = mkdtempSync(join(tmpdir(), 'b-'));
  const after = mkdtempSync(join(tmpdir(), 'a-'));
  for (const f of ['accueil--mobile.png', 'accueil--desktop.png']) { writeFileSync(join(before, f), 'x'); writeFileSync(join(after, f), 'x'); }
  const { files, unchanged } = screensToShow(before, after);
  assert.deepEqual(files, []);
  assert.deepEqual(unchanged, ['accueil--desktop.png', 'accueil--mobile.png']);
  assert.ok(markdownTable({ repo: 'o/r', dir: 'd', files, unchanged }).includes(NO_CHANGE_MARKER));
});

// Issue #375: a comment's screenshots table, retyped by hand, showed broken links instead of the dark images.
const BROKEN_373 = [
  '<!-- shots: claude/factory-assets -->',
  '| Écran | Avant (gauche) · Après (droite) |',
  '| --- | --- |',
  '| s · desktop | ![avant · après](https://github.com/o/r/blob/claude/factory-assets/pr-1/t/compare/s--desktop.png?raw=true) |',
  '| s · desktop · sombre | [avant · après](` https://github.com/o/r/blob/claude/factory-assets/pr-1/t/compare/s--desktop--sombre.png?raw=true `) |',
  '| s · mobile · sombre | [avant · après](`` https://github.com/o/r/blob/claude/factory-assets/pr-1/t/compare/s--mobile--sombre.png?raw=true ``) |',
].join('\n');

test('brokenShotRows finds every table row that is not a displayed image', async () => {
  const { brokenShotRows } = await import('../agent/scripts/shots.mjs');
  const rows = brokenShotRows(BROKEN_373);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.includes('sombre')));
});

test('brokenShotRows accepts the tool output as is, whatever is written around it', async () => {
  const { brokenShotRows } = await import('../agent/scripts/shots.mjs');
  const md = markdownTable({ repo: 'o/r', dir: 'pr-1/t', files: ['a--desktop.png', 'a--desktop--sombre.png'], unchanged: ['b--mobile.png'] });
  assert.deepEqual(brokenShotRows(`<!-- factory-agent -->\nIntro.\n\n${md}\n\nRépondez « ok ».`), []);
  assert.deepEqual(brokenShotRows(markdownTable({ repo: 'o/r', dir: 'd', files: [] })), []);
  assert.deepEqual(brokenShotRows('| a | b |\n| --- | --- |\n| x | y |'), []); // no shots mark: not a screenshots message
});

test('brokenShotRows refuses a table with no image row, or a row with a missing image', async () => {
  const { brokenShotRows } = await import('../agent/scripts/shots.mjs');
  const md = '<!-- shots: claude/factory-assets -->\n| Écran | Avant (gauche) · Après (droite) |\n| --- | --- |\n| a · desktop | ![avant · après]() |';
  assert.equal(brokenShotRows(md).length, 1);
});
