#!/usr/bin/env node
// Dependency-free project checks behind the npm scripts typecheck, lint and build.
// Usage: node tools/project-checks.mjs <typecheck|lint|build>
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'vendor', 'packs', '.claude', '.factory']);

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const sources = () => walk(ROOT).filter((f) => f.endsWith('.mjs'));

// Syntax check of every module (no TypeScript in this project).
export function typecheck() {
  const bad = sources().filter((f) => spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }).status !== 0);
  bad.forEach((f) => console.error(`Syntax error: ${f}`));
  return bad.length === 0;
}

// Minimal hygiene rules: no merge-conflict markers, no debugger statements.
export function lintText(text) {
  const problems = [];
  text.split('\n').forEach((line, i) => {
    if (/^(<{7}|>{7}) /.test(line) || /^={7}$/.test(line)) problems.push([i + 1, 'merge conflict marker']);
    if (/^\s*debugger;?\s*$/.test(line)) problems.push([i + 1, 'debugger statement']);
  });
  return problems;
}

export function lint() {
  let ok = true;
  for (const f of sources()) {
    for (const [line, msg] of lintText(readFileSync(f, 'utf8'))) { console.error(`${f}:${line} ${msg}`); ok = false; }
  }
  return ok;
}

// The panel is static: the build checks that every local file the page references exists.
export function build() {
  const dir = join(ROOT, 'panel');
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"#?:]+)(?:\?[^"]*)?"/g)].map((m) => m[1]).filter((r) => !r.startsWith('//'));
  // Files the stylesheets load (fonts), relative to the stylesheet itself.
  const cssRefs = refs.filter((r) => r.endsWith('.css') && existsSync(join(dir, r))).flatMap((css) =>
    [...readFileSync(join(dir, css), 'utf8').matchAll(/url\(["']?([^"')#?:]+)/g)].map((m) => join(dirname(css), m[1])));
  const missing = [...refs, ...cssRefs].filter((r) => !existsSync(join(dir, r)));
  missing.forEach((r) => console.error(`Missing panel file: ${r}`));
  return missing.length === 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const task = { typecheck, lint, build }[process.argv[2]];
  if (!task) { console.error('Usage: project-checks.mjs <typecheck|lint|build>'); process.exit(2); }
  process.exit(task() ? 0 : 1);
}
