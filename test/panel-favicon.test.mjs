import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8');
const logoPath = html.match(/<a class="brand"[^>]*><svg[^>]*><path d="([^"]+)"/)[1];

test('panel declares an SVG favicon and an apple touch icon', () => {
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="favicon\.svg">/);
  assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
});

test('favicon is the header logo, white on a rounded blue square', () => {
  const svg = readFileSync(new URL('../panel/favicon.svg', import.meta.url), 'utf8');
  assert.ok(svg.includes(logoPath), 'same factory drawing as the header logo');
  assert.match(svg, /<rect[^>]*rx=[^>]*fill="#1850e8"/);
  assert.match(svg, /stroke="#fff(fff)?"/);
});

test('apple touch icon is a PNG file', () => {
  const p = new URL('../panel/apple-touch-icon.png', import.meta.url);
  assert.ok(existsSync(p));
  const png = readFileSync(p);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 180, 'width');
  assert.equal(png.readUInt32BE(20), 180, 'height');
});
