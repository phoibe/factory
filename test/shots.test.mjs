import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug, markdownTable, parseArgs, darkToggle, cookiesFor, differs, orderFiles, sideBySideHtml } from '../agent/scripts/shots.mjs';

test('slug names routes', () => {
  assert.equal(slug('/'), 'accueil');
  assert.equal(slug('/habits/new/'), 'habits-new');
});

test('markdown table has one side-by-side image per screen', () => {
  const md = markdownTable({ repo: 'o/r', dir: 'pr-1/t', files: ['accueil--desktop.png'] });
  assert.match(md, /blob\/claude\/factory-assets\/pr-1\/t\/compare\/accueil--desktop\.png\?raw=true/);
  assert.match(md, /\| accueil · desktop \|/);
  assert.match(md, /\| Écran \| Avant \(gauche\) · Après \(droite\) \|/);
});

test('dark rows are named "sombre" and follow the light rows', () => {
  const md = markdownTable({
    repo: 'o/r', dir: 'd',
    files: ['accueil--desktop--sombre.png', 'accueil--desktop.png', 'accueil--mobile.png', 'accueil--mobile--sombre.png'],
  });
  const labels = md.split('\n').slice(2).map((l) => l.split('|')[1].trim());
  assert.deepEqual(labels, ['accueil · desktop', 'accueil · mobile', 'accueil · desktop · sombre', 'accueil · mobile · sombre']);
  assert.deepEqual(orderFiles(['b--mobile--sombre.png', 'a--mobile.png']), ['a--mobile.png', 'b--mobile--sombre.png']);
});

test('side-by-side image shows before left and after right', () => {
  const html = sideBySideHtml({ beforeUri: 'data:b', afterUri: 'data:a' });
  assert.ok(html.indexOf('data:b') < html.indexOf('data:a'));
  assert.doesNotMatch(html, /nouvel écran/);
});

test('side-by-side image marks a new screen instead of the before', () => {
  const html = sideBySideHtml({ beforeUri: null, afterUri: 'data:a' });
  assert.match(html, /nouvel écran/);
  assert.ok(html.indexOf('nouvel écran') < html.indexOf('data:a'));
});

test('parseArgs reads flags', () => {
  assert.deepEqual(parseArgs(['capture', '--out', 'x', '--flag']), { _: ['capture'], out: 'x', flag: true });
});

test('darkToggle reads how the app switches to dark', () => {
  assert.equal(darkToggle({}), null);
  assert.equal(darkToggle({ 'dark-class': true }), null);
  assert.deepEqual(darkToggle({ 'dark-class': 'dark' }), { kind: 'class', value: 'dark' });
  assert.deepEqual(darkToggle({ 'dark-attr': 'data-theme=night' }), { kind: 'attr', name: 'data-theme', value: 'night' });
  assert.deepEqual(darkToggle({ 'dark-attr': 'data-theme' }), { kind: 'attr', name: 'data-theme', value: 'dark' });
});

test('differs detects a page that looks the same in dark', () => {
  assert.equal(differs(Buffer.from('abc'), Buffer.from('abc')), false);
  assert.equal(differs(Buffer.from('abc'), Buffer.from('abd')), true);
});

test('cookiesFor turns --cookie into session cookies for the app being captured', () => {
  assert.deepEqual(cookiesFor('session=a=b, theme=dark', 'http://localhost:3000/x'), [
    { name: 'session', value: 'a=b', url: 'http://localhost:3000' },
    { name: 'theme', value: 'dark', url: 'http://localhost:3000' },
  ]);
  assert.deepEqual(cookiesFor(undefined, 'http://localhost:3000'), []);
  assert.deepEqual(cookiesFor(true, 'http://localhost:3000'), []);
});
