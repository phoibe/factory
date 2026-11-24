import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../panel/', import.meta.url);
export const files = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort().map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]));
export const all = Object.values(files).join('\n');
export const fn = (name) => all.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\)[^]*?\\n\\}\\n`))?.[0] || '';
export const resets = [...all.matchAll(/^onReset\(\(\) => \{\n[^]*?\n\}\);$/gm)].map((m) => m[0]);
