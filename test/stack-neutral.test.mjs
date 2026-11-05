// Issue #180: the agent's instructions must not steer the stack toward named products.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../agent/stages/', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');
const section = (md, title) => (md.split(`## ${title}`)[1]?.split('\n## ')[0] ?? '').replace(/\s+/g, ' ');

const PRODUCTS = /\b(Neon|shadcn|nextjs|Next\.js|Supabase|Clerk|Prisma|Tailwind|Firebase|Netlify|Render|Cloudflare)\b/;

test('no stage cites a product or framework name as an example', () => {
  for (const f of readdirSync(dir)) {
    const hit = read(f).match(PRODUCTS);
    assert.equal(hit, null, `${f} names "${hit?.[0]}"`);
  }
});

test('Vercel is only named by framing to say it gets no bonus', () => {
  for (const f of readdirSync(dir)) {
    const md = read(f);
    if (f === 'framing.md') continue;
    assert.ok(!/vercel/i.test(md), `${f} mentions Vercel`);
  }
  const lines = read('framing.md').split('\n').filter((l) => /vercel/i.test(l));
  assert.ok(lines.length <= 1 && lines.every((l) => l.includes('aucun bonus')), lines.join('\n'));
});

test('stack criteria name kinds of building blocks only', () => {
  const s = section(read('framing.md'), 'Choisir la stack');
  for (const kind of ['une base de données gérée', "des composants d'interface tout faits", 'une authentification toute prête'])
    assert.ok(s.includes(kind), `missing "${kind}"`);
});

test('framing compares two or three genuinely different stacks', () => {
  const s = section(read('framing.md'), 'Choisir la stack');
  assert.match(s, /deux ou trois stacks/);
  assert.match(s, /pièce maîtresse/);
  for (const point of ['apporte', 'point faible', 'comptes', 'hébergée', 'maîtrise', '« très bonne », « bonne » ou « moyenne »'])
    assert.ok(s.includes(point), `per-stack point "${point}" missing`);
  assert.match(s, /➡️[^\n]*deux phrases/);
});

test('the host is chosen with the stack, on the same criteria', () => {
  const s = section(read('framing.md'), 'Choisir la stack');
  assert.match(s, /hébergeur se choisit avec la stack/);
  assert.match(s, /signale[^\n]*déploiements à GitHub/);
  const brief = section(read('framing.md'), 'La fiche projet (porte 1)');
  assert.match(brief, /Hébergement/);
  assert.match(brief, /où cliquer/);
});

test('adoption keeps the existing stack', () => {
  assert.match(read('framing.md'), /\*\*Stack\*\* : garde celle en place/);
});

test('foundation writes hosting config only if the chosen host asks for it', () => {
  const md = read('foundation.md');
  assert.match(md, /type d'appli de la stack choisie, si l'hébergeur le demande/);
});
