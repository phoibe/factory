import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, relative, extname, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHARED, isBuild, stampModule, stampHtml, buildSite } from '../scripts/stamp-panel.mjs';

const B = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PANEL = join(ROOT, 'panel');

// Every file under dir, as paths relative to dir with forward slashes.
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p).map((f) => `${name}/${f}`));
    else out.push(name);
  }
  return out;
}

test('stampModule stamps every relative specifier and replaces an existing query', () => {
  assert.equal(stampModule("import { a } from './lib.mjs?v=28';", B), `import { a } from './lib.mjs?v=${B}';`);
  assert.equal(stampModule("import { a } from './lib.mjs';", B), `import { a } from './lib.mjs?v=${B}';`);
  assert.equal(stampModule('export { a } from "../x.mjs";', B), `export { a } from "../x.mjs?v=${B}";`);
  assert.equal(stampModule("import './x.mjs';", B), `import './x.mjs?v=${B}';`);
  assert.equal(stampModule("const m = await import('./x.mjs');", B), `const m = await import('./x.mjs?v=${B}');`);
  assert.equal(stampModule("import {\n  a,\n  b,\n} from './x.mjs';", B), `import {\n  a,\n  b,\n} from './x.mjs?v=${B}';`);
});

test('stampModule leaves bare and absolute specifiers alone and is idempotent', () => {
  const text = "import { readFileSync } from 'node:fs';\nimport { chromium } from 'playwright';\nimport x from 'https://x/y.mjs';\n";
  assert.equal(stampModule(text, B), text);
  const once = stampModule("import { a } from './lib.mjs';\nimport './x.mjs';", B);
  assert.equal(stampModule(once, B), once);
});

test('stampModule leaves a "from" inside a string alone', () => {
  const text = "const hint = 'copied from \\'./x.mjs\\' by hand';\nconst msg = \"read from './y.mjs'\";\n";
  assert.equal(stampModule(text, B), text);
  const both = "import { a } from './lib.mjs';\nconst s = 'see from \"./z.mjs\"';\n";
  assert.equal(stampModule(both, B), `import { a } from './lib.mjs?v=${B}';\nconst s = 'see from \"./z.mjs\"';\n`);
});

test('stampHtml leaves a protocol-relative url alone', () => {
  const html = '<script src="//cdn.example.com/x.js"></script><link rel="stylesheet" href="//cdn.example.com/y.css">';
  assert.equal(stampHtml(html, B), html);
});

test('stampHtml substitutes the build and stamps only local scripts and stylesheets', () => {
  const html = '<meta name="build" content="__BUILD__"><link rel="icon" href="favicon.svg"><link rel="stylesheet" href="style.css?v=60">'
    + '<a href="https://github.com/x?name=a">x</a><a href="#">y</a><script type="module" src="app.mjs"></script>';
  const out = stampHtml(html, B);
  assert.ok(out.includes(`<meta name="build" content="${B}">`));
  assert.ok(!out.includes('__BUILD__'));
  assert.ok(out.includes(`href="style.css?v=${B}"`));
  assert.ok(out.includes(`src="app.mjs?v=${B}"`));
  assert.ok(out.includes('<link rel="icon" href="favicon.svg">'));
  assert.ok(out.includes('<a href="https://github.com/x?name=a">x</a>'));
  assert.ok(out.includes('<a href="#">y</a>'));
});

test('isBuild accepts a commit sha only', () => {
  assert.equal(isBuild(B), true);
  assert.equal(isBuild('abc1234'), true);
  for (const bad of ['', '__BUILD__', 'main', 'ABC1234']) assert.equal(isBuild(bad), false, bad);
});

test('buildSite publishes the panel, the shared files and version.json', () => {
  const out = mkdtempSync(join(tmpdir(), 'site-'));
  try {
    buildSite({ out, build: B });
    const expected = new Set([...walk(PANEL), ...SHARED.map((f) => basename(f)), 'version.json']);
    assert.deepEqual(walk(out).sort(), [...expected].sort());
    assert.equal(readFileSync(join(out, 'version.json'), 'utf8'), `{ "build": "${B}" }\n`);
    assert.ok(!readFileSync(join(out, 'index.html'), 'utf8').includes('__BUILD__'));
    assert.ok(readFileSync(join(out, 'fonts/Geist-Variable.woff2')).equals(readFileSync(join(PANEL, 'fonts/Geist-Variable.woff2'))));
    assert.ok(readFileSync(join(out, 'catalog.json')).equals(readFileSync(join(ROOT, 'packs/catalog.json'))));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('an empty build is refused and nothing is written', () => {
  const out = mkdtempSync(join(tmpdir(), 'site-'));
  try {
    assert.throws(() => buildSite({ out, build: '' }));
    assert.deepEqual(readdirSync(out), []);
    const run = spawnSync(process.execPath, ['scripts/stamp-panel.mjs', out, ''], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.ok(run.stderr.length > 0);
    assert.deepEqual(readdirSync(out), []);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a non-empty output folder is refused and nothing is written', () => {
  const out = mkdtempSync(join(tmpdir(), 'site-'));
  try {
    writeFileSync(join(out, 'stale.mjs'), 'old');
    assert.throws(() => buildSite({ out, build: B }), /not empty/);
    assert.deepEqual(readdirSync(out), ['stale.mjs']);
    assert.equal(readFileSync(join(out, 'stale.mjs'), 'utf8'), 'old');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('no hand-kept number in the sources', () => {
  const sources = walk(PANEL)
    .filter((f) => !f.startsWith('vendor/') && !f.startsWith('fonts/') && /\.(mjs|html|css)$/.test(f))
    .map((f) => join(PANEL, f))
    .concat(SHARED.filter((f) => f.endsWith('.mjs')).map((f) => join(ROOT, f)));
  const found = [];
  for (const file of sources) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/\.\w+\?v=/.test(line)) found.push(`${relative(ROOT, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(found, [], `hand-kept ?v= numbers left in:\n${found.join('\n')}`);
});

test('no published file escapes the stamp', () => {
  const out = mkdtempSync(join(tmpdir(), 'site-'));
  try {
    buildSite({ out, build: B });
    const site = new Set(walk(out));
    // Checks written independently of the stamper's own patterns.
    for (const file of [...site].filter((f) => f.endsWith('.mjs'))) {
      const text = readFileSync(join(out, file), 'utf8');
      for (const m of text.matchAll(/(['"`])(\.{1,2}\/[^'"`\s]*?\.m?js)(\?[^'"`]*)?\1/g)) {
        assert.equal(m[3], `?v=${B}`, `${file}: ${m[0]} is not stamped`);
        const target = posix.normalize(posix.join(posix.dirname(file), m[2]));
        assert.ok(site.has(target), `${file}: ${m[2]} is not published`);
      }
    }
    // Double-quoted attributes only, like the stamper's LOCAL_ASSET: a single-quoted or unquoted src/href is left to
    // the e2e (e2e/build-stamp.e2e.mjs), which sees every file the browser asks for.
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    let mjs = 0;
    let css = 0;
    for (const [, value] of html.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('#')) continue;
      if (value.endsWith(`?v=${B}`)) {
        if (value.includes('.mjs?')) mjs++;
        if (value.includes('.css?')) css++;
        continue;
      }
      assert.ok(['.svg', '.png'].includes(extname(value)), `index.html: ${value} is neither stamped nor an icon`);
    }
    assert.ok(mjs >= 1, 'index.html stamps a module');
    assert.ok(css >= 1, 'index.html stamps a stylesheet');
    for (const file of [...site].filter((f) => f.endsWith('.css'))) {
      const text = readFileSync(join(out, file), 'utf8');
      assert.ok(!text.includes('@import'), `${file}: @import is not stamped`);
      for (const [, raw] of text.matchAll(/url\(([^)]*)\)/g)) {
        const target = raw.trim().replace(/^['"]|['"]$/g, '').split(/[?#]/)[0];
        assert.ok(['.woff2', '.svg', '.png'].includes(extname(target)), `${file}: url(${raw}) is not stamped`);
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('buildSite skips the dotfiles at the top of the panel, as `cp -r panel/*` did', () => {
  const root = mkdtempSync(join(tmpdir(), 'root-'));
  const out = mkdtempSync(join(tmpdir(), 'site-'));
  try {
    cpSync(join(ROOT, 'panel'), join(root, 'panel'), { recursive: true });
    for (const f of SHARED) cpSync(join(ROOT, f), join(root, f), { recursive: true });
    writeFileSync(join(root, 'panel/.secret'), 'x');
    mkdirSync(join(root, 'panel/.cache'));
    writeFileSync(join(root, 'panel/.cache/a.mjs'), 'x');
    buildSite({ root, out, build: B });
    assert.deepEqual(readdirSync(out).filter((f) => f.startsWith('.')), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

// Files the panel loads at run time that must follow GitHub's or the server's latest, never the build (no-store).
const UNSTAMPED = new Set(['version.json', 'chat-server.json']);
// Call sites whose quoted names are not files of the site but paths in a GitHub repository (runner settings, chat
// branch, Vercel), matched against the code just before the name: the same name anywhere else is still flagged.
const REMOTE = /(?:\b(?:runnersFile|readRunnersFile|branchJson)\(\s*|\bwriteChatFile\([^,()]*,\s*|\bpath:\s*)$/;
// Module specifiers: `import … from '…'`, `export … from '…'`, `import '…'` and `import('…')`.
// Written on purpose independently of STATIC/DYNAMIC in scripts/stamp-panel.mjs, so they do not share a blind spot.
const SPECIFIERS = /^\s*(?:import|export)\b[^;]*?\bfrom\s*(['"])[^'"]*\1|^\s*import\s*(['"])[^'"]*\2|\bimport\s*\(\s*(['"])[^'"]*\3\s*\)/gm;

/**
 * Every quoted local file a panel module names at run time that is not wrapped in versioned(…). A heuristic over
 * literal names only (a name built at run time slips through): the e2e (e2e/build-stamp.e2e.mjs) backs it, deny by
 * default, by failing on any request of the published site its scenario makes without the build.
 */
function unversionedLoads(text) {
  const code = text.replace(SPECIFIERS, (m) => m.replace(/['"][^'"]*['"]/g, "''"));
  const found = [];
  for (const m of code.matchAll(/(['"`])((?:\.{1,2}\/)?[\w./-]+\.(?:json|js|css|mjs|html|txt))(?:\?[^'"`\s]*)?\1/g)) {
    const name = m[2].replace(/^(?:\.{1,2}\/)+/, '');
    const before = code.slice(0, m.index);
    if (UNSTAMPED.has(name) || REMOTE.test(before)) continue;
    if (/\bversioned\(\s*$/.test(before)) continue;
    found.push(m[0]);
  }
  return found;
}

test('the guard over run-time loads finds an unversioned fetch', () => {
  assert.deepEqual(unversionedLoads("await fetch('extra.json');"), ["'extra.json'"]);
  assert.deepEqual(unversionedLoads("await loadScript('./vendor/y.js');"), ["'./vendor/y.js'"]);
  assert.deepEqual(unversionedLoads('await fetch(`extra.css`);'), ['`extra.css`']);
  assert.deepEqual(unversionedLoads("import { a } from './lib.mjs';\nawait import('./x.mjs');\nfetch(versioned('a.json', BUILD));\nfetch('chat-server.json');"), []);
});

test('the guard over run-time loads sees a query and html or text files', () => {
  assert.deepEqual(unversionedLoads("await fetch('extra.json?x=1');"), ["'extra.json?x=1'"]);
  assert.deepEqual(unversionedLoads("await fetch('help.html');"), ["'help.html'"]);
  assert.deepEqual(unversionedLoads("await fetch('./notes.txt');"), ["'./notes.txt'"]);
});

test('the guard over run-time loads exempts a repository path by its call site, not by its name', () => {
  assert.deepEqual(unversionedLoads("await fetch('settings.json');"), ["'settings.json'"]);
  assert.deepEqual(unversionedLoads("await fetch('index.json');"), ["'index.json'"]);
  const remote = "runnersFile('settings.json'); readRunnersFile('status.json'); branchJson('index.json');\n"
    + "writeChatFile(repo, 'index.json', f); writeChatFile(chat.repo, 'index.json', (index) => x);\n"
    + "const tree = [{ path: 'vercel.json', mode: '100644' }];";
  assert.deepEqual(unversionedLoads(remote), []);
});

/** Every unversioned run-time load in the panel modules of `root`, as `path: load`. */
function unversionedLoadsIn(root) {
  const panel = join(root, 'panel');
  const sources = walk(panel)
    .filter((f) => !f.startsWith('vendor/') && f.endsWith('.mjs'))
    .map((f) => join(panel, f))
    .concat(SHARED.filter((f) => f.endsWith('.mjs')).map((f) => join(root, f)));
  const found = [];
  for (const file of sources) {
    for (const load of unversionedLoads(readFileSync(file, 'utf8'))) found.push(`${relative(root, file)}: ${load}`);
  }
  return found;
}

test('the guard over run-time loads reads the sub-folders of the panel and the shared modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'root-'));
  try {
    mkdirSync(join(root, 'panel/sub'), { recursive: true });
    mkdirSync(join(root, 'panel/vendor'), { recursive: true });
    writeFileSync(join(root, 'panel/app.mjs'), "fetch(versioned('a.json', BUILD));\n");
    writeFileSync(join(root, 'panel/sub/x.mjs'), "await fetch('extra.json');\n");
    writeFileSync(join(root, 'panel/vendor/lib.mjs'), "await fetch('vendored.json');\n");
    for (const f of SHARED.filter((s) => s.endsWith('.mjs'))) {
      mkdirSync(join(root, posix.dirname(f)), { recursive: true });
      writeFileSync(join(root, f), f === 'scripts/lib/models.mjs' ? "await fetch('extra.json');\n" : '\n');
    }
    assert.deepEqual(unversionedLoadsIn(root).sort(), ["panel/sub/x.mjs: 'extra.json'", "scripts/lib/models.mjs: 'extra.json'"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every file a panel module loads at run time follows the build', () => {
  const found = unversionedLoadsIn(ROOT);
  assert.deepEqual(found, [], `loaded at run time without versioned(…):\n${found.join('\n')}`);
});

test('the chat server address is always read fresh', () => {
  assert.ok(readFileSync(join(PANEL, 'app.mjs'), 'utf8').includes("fetch('chat-server.json', { cache: 'no-store' })"));
});
