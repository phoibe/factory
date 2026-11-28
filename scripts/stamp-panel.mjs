// Builds the published panel (the GitHub Pages site) and stamps every file it loads with the build:
// every relative import of every published module and the local scripts and stylesheets of index.html get
// `?v=<commit sha>`, so a reloaded page never mixes two versions. Fonts and icons are left unstamped.
// Usage: node scripts/stamp-panel.mjs <outDir> <sha>
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Files the panel reads next to itself, copied flat into the site.
export const SHARED = [
  'packs/catalog.json',
  'defaults/factory.config.json',
  'scripts/lib/config-core.mjs',
  'scripts/lib/ratelimit.mjs',
  'scripts/lib/answer.mjs',
  'scripts/lib/waits.mjs',
  'scripts/lib/trust.mjs',
  'scripts/lib/models.mjs',
  'scripts/lib/prices.mjs',
];

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** @param {string} build */
export const isBuild = (build) => /^[0-9a-f]{7,40}$/.test(build);

// A relative module specifier, with any existing query replaced: `import … from './x.mjs'` and `export … from './x.mjs'`
// at the start of a statement, a bare `import './x.mjs'`, and a dynamic `import('./x.mjs')`. A `from './x'` inside a
// string is left alone.
// Limit: a static import is found only at the start of a line, so a second `import … from './y.mjs'` on the same line
// is not stamped. That fails closed: the test "no published file escapes the stamp" (test/stamp-panel.test.mjs) and
// its run-time-load guard find any unstamped relative specifier, with patterns (SPECIFIERS there) written on purpose
// independently of these, so a blind spot shared by both is unlikely.
const STATIC = /^(\s*(?:import|export)\b[^;'"]*?\bfrom\s*|\s*import\s*)(['"])(\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?\2/gm;
const DYNAMIC = /(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?\2/g;

/** @param {string} text @param {string} build */
export function stampModule(text, build) {
  /** @param {string} _ @param {string} lead @param {string} q @param {string} path */
  const stamp = (_, lead, q, path) => `${lead}${q}${path}?v=${build}${q}`;
  return text.replace(STATIC, stamp).replace(DYNAMIC, stamp);
}

// A local src/href (no scheme, not protocol-relative, no fragment) to a script or a stylesheet, with any existing
// query replaced. Double-quoted attributes only (as index.html writes them): a single-quoted or unquoted one is left
// unstamped, which the unit check of index.html does not see either; the e2e (e2e/build-stamp.e2e.mjs) catches it,
// since the browser would then ask for that file without the build.
const LOCAL_ASSET = /\b(src|href)="(?!\/\/)([^"#?:]+\.(?:mjs|js|css))(?:\?[^"]*)?"/g;

/** Substitutes __BUILD__ and stamps LOCAL_ASSET (double-quoted attributes only). @param {string} html @param {string} build */
export function stampHtml(html, build) {
  return html.replaceAll('__BUILD__', build).replace(LOCAL_ASSET, (_, attr, path) => `${attr}="${path}?v=${build}"`);
}

/** @param {string} dir @returns {string[]} absolute paths of every file under dir */
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** @param {{ root?: string, out: string, build: string }} options */
export function buildSite({ root = ROOT, out, build }) {
  if (!isBuild(build)) throw new Error(`Not a commit sha: "${build}"`);
  // A stale file left in `out` would be published with the new build.
  if (existsSync(out) && readdirSync(out).length > 0) throw new Error(`Output folder not empty: ${out}`);
  mkdirSync(out, { recursive: true });
  const panel = join(root, 'panel');
  // The top-level dotfiles of the panel are not published, as `cp -r panel/*` did.
  cpSync(panel, out, { recursive: true, filter: (src) => dirname(src) !== panel || !basename(src).startsWith('.') });
  for (const f of SHARED) cpSync(join(root, f), join(out, basename(f)));
  for (const f of files(out)) {
    if (f.endsWith('.mjs')) writeFileSync(f, stampModule(readFileSync(f, 'utf8'), build));
  }
  const index = join(out, 'index.html');
  writeFileSync(index, stampHtml(readFileSync(index, 'utf8'), build));
  writeFileSync(join(out, 'version.json'), `{ "build": "${build}" }\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, build] = process.argv.slice(2);
  if (!out || !build || !isBuild(build)) {
    console.error('usage: node scripts/stamp-panel.mjs <outDir> <commit sha>');
    process.exit(1);
  }
  buildSite({ out, build });
}
