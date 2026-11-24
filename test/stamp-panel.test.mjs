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
// Quoted names that are not files of the site but paths in a GitHub repository (runner settings, chat branch, Vercel).
const REMOTE = new Set(['settings.json', 'status.json', 'index.json', 'vercel.json']);
// Module specifiers: `import … from '…'`, `export … from '…'`, `import '…'` and `import('…')`.
const SPECIFIERS = /^\s*(?:import|export)\b[^;]*?\bfrom\s*(['"])[^'"]*\1|^\s*import\s*(['"])[^'"]*\2|\bimport\s*\(\s*(['"])[^'"]*\3\s*\)/gm;

/** Every quoted local file a panel module names at run time that is not wrapped in versioned(…). */
function unversionedLoads(text) {
  const code = text.replace(SPECIFIERS, (m) => m.replace(/['"][^'"]*['"]/g, "''"));
  const found = [];
  for (const m of code.matchAll(/(['"`])((?:\.{1,2}\/)?[\w./-]+\.(?:json|js|css|mjs))\1/g)) {
    const name = m[2].replace(/^(?:\.{1,2}\/)+/, '');
    if (UNSTAMPED.has(name) || REMOTE.has(name)) continue;
    if (/\bversioned\(\s*$/.test(code.slice(0, m.index))) continue;
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

test('every file a panel module loads at run time follows the build', () => {
  const found = [];
  for (const f of readdirSync(PANEL).filter((n) => n.endsWith('.mjs'))) {
    for (const load of unversionedLoads(readFileSync(join(PANEL, f), 'utf8'))) found.push(`${f}: ${load}`);
  }
  assert.deepEqual(found, [], `loaded at run time without versioned(…):\n${found.join('\n')}`);
});

test('the chat server address is always read fresh', () => {
  assert.ok(readFileSync(join(PANEL, 'app.mjs'), 'utf8').includes("fetch('chat-server.json', { cache: 'no-store' })"));
});
