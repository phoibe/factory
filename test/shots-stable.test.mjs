// Issue #422: a screen whose only difference is data that changes on its own is not shown before/after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FROZEN_TIME, frozenEnv, setAsideScreens, screensToShow, markdownTable, shotsMeta, NO_CHANGE_MARKER, NO_CHANGE_SENTENCE } from '../agent/scripts/shots.mjs';
import { installFrozenClock } from '../agent/scripts/frozen-clock.mjs';

const runNode = (code, env) => execFileSync(process.execPath, ['-e', code], { env: { ...process.env, ...env } }).toString().trim();

test('an app started with the captures environment starts on the same fixed date and time as the browser', () => {
  const env = frozenEnv();
  assert.equal(env.FACTORY_FROZEN_TIME, FROZEN_TIME);
  const now = Date.parse(runNode('console.log(new Date().toISOString())', env));
  assert.ok(now >= Date.parse(FROZEN_TIME) && now < Date.parse(FROZEN_TIME) + 60_000, new Date(now).toISOString());
  assert.ok(Math.abs(Number(runNode('console.log(Date.now())', env)) - Date.parse(FROZEN_TIME)) < 60_000);
});

test('the frozen clock keeps every other use of dates working', () => {
  const out = JSON.parse(runNode('console.log(JSON.stringify([new Date(0).toISOString(), Date.parse("2020-01-01T00:00:00Z"), Date.UTC(2020, 0, 1), new Date() instanceof Date, new Date(2020, 0, 1).getFullYear(), typeof Date()]))', frozenEnv()));
  assert.deepEqual(out, ['1970-01-01T00:00:00.000Z', 1577836800000, 1577836800000, true, 2020, 'string']);
});

test('the frozen clock keeps ticking from the fixed time', () => {
  let real = 1_000;
  const restore = installFrozenClock('2026-01-15T10:30:00.000Z', () => real);
  try {
    assert.equal(new Date().toISOString(), '2026-01-15T10:30:00.000Z');
    real += 5_000;
    assert.equal(Date.now(), Date.parse('2026-01-15T10:30:05.000Z'));
  } finally { restore(); }
  assert.ok(Math.abs(Date.now() - Number(new Date())) < 1000 && new Date().getFullYear() >= 2026);
});

test('the captures environment keeps the options the app already had', () => {
  const env = frozenEnv({ NODE_OPTIONS: '--max-old-space-size=4096' });
  assert.match(env.NODE_OPTIONS, /^--max-old-space-size=4096 --import=file:\/\/\S+frozen-clock\.mjs$/);
});

test('without the captures environment, loading the clock changes nothing', () => {
  const url = new URL('../agent/scripts/frozen-clock.mjs', import.meta.url).href;
  const year = runNode(`import(${JSON.stringify(url)}).then(() => console.log(new Date().getFullYear()))`, { FACTORY_FROZEN_TIME: '' });
  assert.equal(Number(year), new Date().getFullYear());
});

const files = ['screener--desktop.png', 'screener--mobile.png', 'screener--desktop--sombre.png', 'reglages--desktop.png'];

test('a screen set aside by the agent is not shown, all sizes and themes of a route at once', () => {
  const res = setAsideScreens(files, { screener: "seule l'heure du dernier passage diffère" });
  assert.deepEqual(res.files, ['reglages--desktop.png']);
  assert.deepEqual(res.setAside.map((s) => s.file).sort(), ['screener--desktop--sombre.png', 'screener--desktop.png', 'screener--mobile.png']);
  assert.ok(res.setAside.every((s) => s.reason === "seule l'heure du dernier passage diffère"));
});

test('one size or theme of a screen can be set aside alone', () => {
  const res = setAsideScreens(files, { 'screener--mobile': 'heure' });
  assert.deepEqual(res.setAside, [{ file: 'screener--mobile.png', reason: 'heure' }]);
  assert.equal(res.files.length, 3);
});

test('a set-aside name matching no changed screen, a missing reason or a new screen is refused', () => {
  assert.throws(() => setAsideScreens(files, { screner: 'heure' }), /screner/);
  assert.throws(() => setAsideScreens(files, { screener: '  ' }), /raison/);
  assert.throws(() => setAsideScreens(files, { reglages: 'heure' }, { newScreens: ['reglages--desktop.png'] }), /nouvel écran/);
});

test('each screen set aside is named under the captures, with its reason', () => {
  const md = markdownTable({ repo: 'o/r', dir: 'd', files: ['reglages--desktop.png'], setAside: [
    { file: 'screener--desktop.png', reason: "seule l'heure du dernier passage diffère" },
    { file: 'screener--mobile.png', reason: "seule l'heure du dernier passage diffère" },
  ] });
  assert.match(md, /_Écrans sans changement visible, non montrés : screener · desktop, screener · mobile \(seule l'heure du dernier passage diffère\)\._/);
  assert.ok(!md.includes(NO_CHANGE_MARKER));
});

test('when every changed screen is set aside, nothing is left to validate and the trace line stays', () => {
  const md = markdownTable({ repo: 'o/r', dir: 'd', files: [], unchanged: ['reglages--desktop.png'], setAside: [{ file: 'screener--desktop.png', reason: 'heure' }] });
  assert.ok(md.includes(NO_CHANGE_MARKER));
  assert.ok(md.includes(NO_CHANGE_SENTENCE));
  assert.match(md, /non montrés : screener · desktop \(heure\)/);
  assert.doesNotMatch(md, /Répondez|\?/);
});

test('screensToShow applies the set-aside list to the changed screens only, and refuses a new screen', () => {
  const before = mkdtempSync(join(tmpdir(), 'b-'));
  const after = mkdtempSync(join(tmpdir(), 'a-'));
  writeFileSync(join(before, 'same--desktop.png'), 'x'); writeFileSync(join(after, 'same--desktop.png'), 'x');
  writeFileSync(join(before, 'screener--desktop.png'), '14:23'); writeFileSync(join(after, 'screener--desktop.png'), '15:47');
  writeFileSync(join(after, 'neuf--desktop.png'), 'n');
  const res = screensToShow(before, after, { screener: 'heure' });
  assert.deepEqual(res.files, ['neuf--desktop.png']);
  assert.deepEqual(res.unchanged, ['same--desktop.png']);
  assert.deepEqual(res.setAside, [{ file: 'screener--desktop.png', reason: 'heure' }]);
  assert.throws(() => screensToShow(before, after, { neuf: 'heure' }), /nouvel écran/);
});

test('the list of set-aside screens is left next to the images for the factory', () => {
  const meta = JSON.parse(shotsMeta({ files: ['a--desktop.png'], unchanged: [], setAside: [{ file: 'b--mobile.png', reason: 'heure' }] }));
  assert.deepEqual(meta.setAside, [{ file: 'b--mobile.png', reason: 'heure' }]);
});

test('the screenshots stage launches both apps on the fixed time and frames the safety net', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../agent/stages/screenshots.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(s, /--set-aside/);
  assert.match(s, /au moindre doute, l'écran est montré/i);
  assert.match(s, /que la demande devait changer/);
});

test('shots run launches the app with the fixed time in one command, and fails loudly when the app fails', () => {
  const script = new URL('../agent/scripts/shots.mjs', import.meta.url).pathname;
  const out = execFileSync(process.execPath, [script, 'run', '--', process.execPath, '-e', 'console.log(new Date().toISOString().slice(0, 10))']).toString().trim();
  assert.equal(out, '2026-01-15');
  assert.throws(() => execFileSync(process.execPath, [script, 'run', '--', process.execPath, '-e', 'process.exit(3)'], { stdio: 'pipe' }), (e) => e.status === 3);
  assert.throws(() => execFileSync(process.execPath, [script, 'run'], { stdio: 'pipe' }), (e) => e.status === 2);
});

test('the frozen Date still looks like Date and leaves Date subclasses alone', () => {
  const out = JSON.parse(runNode('class My extends Date {}; const d = new Date(); console.log(JSON.stringify([d.constructor === Date, Date.name, Date.length, d instanceof My, new My() instanceof My, require("util").inspect(new Date(0))]))', frozenEnv()));
  assert.deepEqual(out, [true, 'Date', 7, false, true, '1970-01-01T00:00:00.000Z']);
});

test('a reason is kept on one short line that cannot break the trace line', () => {
  const res = setAsideScreens(['a--desktop.png'], { a: "seule l'heure\n_diffère_ " + 'x'.repeat(300) });
  assert.doesNotMatch(res.setAside[0].reason, /[\n_]/);
  assert.ok(res.setAside[0].reason.length <= 200);
});

test('a set-aside file that is not valid JSON is refused in plain French', () => {
  const dir = mkdtempSync(join(tmpdir(), 's-'));
  writeFileSync(join(dir, 'aside.json'), '{screener: heure}');
  const script = new URL('../agent/scripts/shots.mjs', import.meta.url).pathname;
  assert.throws(() => execFileSync(process.execPath, [script, 'publish', '--pr', '1', '--after', dir, '--set-aside', join(dir, 'aside.json')], { stdio: 'pipe' }), (e) => /n'est pas un JSON valide/.test(e.stderr.toString()));
});

test('the screenshots stage launches each app through shots run and says when to do without the fixed time', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../agent/stages/screenshots.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(s, /node <outil> run -- /);
  assert.match(s, /page de connexion/);
});

test('the build also runs on the fixed time (pages pre-rendered at build), and signed-in captures are checked', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../agent/stages/screenshots.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(s, /run -- sh -c 'npm run build && exec npm run start -- -p 3000'/);
  assert.match(s, /écrans connectés montrent bien l'appli connectée/);
});

test('a reason cannot hide the rest of the trace line', () => {
  assert.doesNotMatch(setAsideScreens(['a--desktop.png'], { a: 'heure <!-- x' }).setAside[0].reason, /</);
});

test('stopping shots run stops the app, even behind a shell', async () => {
  const { spawn } = await import('node:child_process');
  const script = new URL('../agent/scripts/shots.mjs', import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), 'r-'));
  const flag = join(dir, 'alive');
  const app = `setInterval(() => require('fs').writeFileSync(${JSON.stringify(flag)}, String(Date.now())), 100)`;
  const run = spawn(process.execPath, [script, 'run', '--', 'sh', '-c', `true && ${process.execPath} -e "${app.replace(/"/g, '\\"')}"`], { stdio: 'ignore' });
  const { readFileSync, existsSync } = await import('node:fs');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !existsSync(flag); i++) await wait(100);
  assert.ok(existsSync(flag), 'app started');
  run.kill('SIGTERM');
  await new Promise((r) => run.on('exit', r));
  await wait(300);
  const last = readFileSync(flag, 'utf8');
  await wait(500);
  assert.equal(readFileSync(flag, 'utf8'), last, 'the app behind the shell kept running');
});

test('a reason written by an older tool is cleaned when the trace line is built', () => {
  const md = markdownTable({ repo: 'o/r', dir: 'd', files: [], setAside: [{ file: 'a--desktop.png', reason: 'heure\n_<!-- x' }] });
  assert.match(md, /a · desktop \(heure !-- x\)\._$/);
  assert.doesNotMatch(md.split('\n').pop(), /</);
});

test('the screenshots stage waits for the app, changes folder explicitly and dates the demo account on the fixed time', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../agent/stages/screenshots.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(s, /&& exec npm run start -- -p 3000'/);
  assert.match(s, /cd \/tmp\/before && node <outil> run -- sh -c 'npm run build && exec npm run start -- -p 3001'/);
  assert.match(s, /curl -sf --retry 60 --retry-delay 5 --retry-connrefused http:\/\/localhost:3000/);
  assert.match(s, /compte de démonstration[^.]*run/);
});
