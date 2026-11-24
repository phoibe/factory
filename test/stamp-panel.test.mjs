import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

test('the run-time loads follow the build', () => {
  const app = readFileSync(join(PANEL, 'app.mjs'), 'utf8');
  for (const load of ["versioned('catalog.json', BUILD)", "versioned('factory.config.json', BUILD)", "versioned('vendor/qrcode.js', BUILD)",
    "fetch('chat-server.json', { cache: 'no-store' })"]) assert.ok(app.includes(load), load);
});
