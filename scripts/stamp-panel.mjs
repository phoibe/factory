// Builds the published panel (the GitHub Pages site) and stamps every file it loads with the build:
// every relative import of every published module and the local scripts and stylesheets of index.html get
// `?v=<commit sha>`, so a reloaded page never mixes two versions. Fonts and icons are left unstamped.
// Usage: node scripts/stamp-panel.mjs <outDir> <sha>
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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
];

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** @param {string} build */
export const isBuild = (build) => /^[0-9a-f]{7,40}$/.test(build);

// `from './x.mjs'`, `import './x.mjs'`, `import('./x.mjs')`, with any existing query replaced.
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?\2/g;

/** @param {string} text @param {string} build */
export function stampModule(text, build) {
  return text.replace(SPECIFIER, (_, lead, q, path) => `${lead}${q}${path}?v=${build}${q}`);
}

// A local src/href (no scheme, no fragment) to a script or a stylesheet, with any existing query replaced.
const LOCAL_ASSET = /\b(src|href)="([^"#?:]+\.(?:mjs|js|css))(?:\?[^"]*)?"/g;

/** @param {string} html @param {string} build */
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
  mkdirSync(out, { recursive: true });
  cpSync(join(root, 'panel'), out, { recursive: true });
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
