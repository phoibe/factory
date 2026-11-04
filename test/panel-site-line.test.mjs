import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8');

test('site link and issues link share a single line', () => {
  const lines = html.match(/<p class="site-line"[^>]*>[\s\S]*?<\/p>/g) || [];
  const both = lines.filter((l) => l.includes('id="site"') && l.includes('id="issues-link"'));
  assert.equal(both.length, 1, 'both links must be in the same site-line paragraph');
  assert.ok(lines.every((l) => l.includes('id="site"') || !l.includes('id="issues-link"')));
});

test('site line lays its links out in a wrapping row without orphan separator', () => {
  const css = readFileSync(new URL('../panel/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.site-line \{[^}]*display: flex;[^}]*flex-wrap: wrap/);
  assert.match(css, /\.site-line \.quiet-link \{ margin: 0; \}/);
  assert.match(css, /max-width: 600px\) \{ \.site-line \.sep \{ display: none; \} \}/);
});
