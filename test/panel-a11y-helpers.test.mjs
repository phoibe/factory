import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitNumbers } from '../panel/numbers.mjs';
import { nextTabIndex } from '../panel/tabs.mjs';

test('splitNumbers isolates issue numbers, counters, durations and hours', () => {
  assert.deepEqual(splitNumbers('Feature · PR #33'), [{ text: 'Feature · PR ' }, { text: '#33', num: true }]);
  assert.deepEqual(splitNumbers('2 tâches, 3 min'), [{ text: '2', num: true }, { text: ' tâches, ' }, { text: '3 min', num: true }]);
  assert.deepEqual(splitNumbers('à 14:32'), [{ text: 'à ' }, { text: '14:32', num: true }]);
  assert.deepEqual(splitNumbers('Aucun chiffre'), [{ text: 'Aucun chiffre' }]);
  assert.deepEqual(splitNumbers('1 à 3 min').map((p) => p.text), ['1', ' à ', '3 min']);
});

test('splitNumbers does not cut words that contain digits-like units', () => {
  assert.deepEqual(splitNumbers('5 minutes'), [{ text: '5', num: true }, { text: ' minutes' }]);
});

test('nextTabIndex wraps around and honours Home and End', () => {
  assert.equal(nextTabIndex('ArrowRight', 0, 3), 1);
  assert.equal(nextTabIndex('ArrowRight', 2, 3), 0);
  assert.equal(nextTabIndex('ArrowLeft', 0, 3), 2);
  assert.equal(nextTabIndex('ArrowLeft', 2, 3), 1);
  assert.equal(nextTabIndex('Home', 2, 3), 0);
  assert.equal(nextTabIndex('End', 0, 3), 2);
  assert.equal(nextTabIndex('Tab', 1, 3), null);
  assert.equal(nextTabIndex('a', 1, 3), null);
});

import { readFileSync } from 'node:fs';
test('the panel ships its fonts and its security policy lets the page load them', () => {
  const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../panel/style.css', import.meta.url), 'utf8');
  assert.match(html, /font-src 'self'/);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(css, /font-family: Geist;/);
  assert.match(css, /font-family: "Geist Mono";/);
});
