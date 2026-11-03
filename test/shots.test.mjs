import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug, markdownTable, parseArgs } from '../agent/scripts/shots.mjs';

test('slug names routes', () => {
  assert.equal(slug('/'), 'accueil');
  assert.equal(slug('/habits/new/'), 'habits-new');
});

test('markdown table links before and after images', () => {
  const md = markdownTable({ repo: 'o/r', dir: 'pr-1/t', files: ['accueil--desktop.png'], hasBefore: true });
  assert.match(md, /blob\/claude\/factory-assets\/pr-1\/t\/before\/accueil--desktop\.png\?raw=true/);
  assert.match(md, /\| accueil · desktop \|/);
});

test('table without before marks new screens', () => {
  assert.match(markdownTable({ repo: 'o/r', dir: 'd', files: ['x--mobile.png'], hasBefore: false }), /_nouvel écran_/);
});

test('parseArgs reads flags', () => {
  assert.deepEqual(parseArgs(['capture', '--out', 'x', '--flag']), { _: ['capture'], out: 'x', flag: true });
});
