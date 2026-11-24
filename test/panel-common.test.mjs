import { test } from 'node:test';
import assert from 'node:assert/strict';

let n = 0;
function page({ hash = '', stored = {} } = {}) {
  const nodes = new Map();
  const node = () => ({ hidden: false, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } });
  const storage = Object.assign(Object.create({
    getItem(k) { return Object.hasOwn(this, k) ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  }), stored);
  const replaced = [];
  const set = (k, value) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  set('document', { getElementById: (id) => nodes.get(id) || nodes.set(id, node()).get(id) });
  set('localStorage', storage);
  set('location', { hash, pathname: '/panel/', search: '' });
  set('history', { replaceState: (...a) => replaced.push(a) });
  return { $: (id) => document.getElementById(id), storage, replaced };
}
async function load(opts, { keepGate = false } = {}) {
  const p = page(opts);
  const m = await import(`../panel/common.mjs?case=${++n}`);
  if (!keepGate) m.openBoardGate();
  return { ...p, m };
}
const signedIn = { 'factory.token': 't', 'factory.projects': '[]', 'factory.chatToken': 'r', 'factory.project': 'o/r', 'factory.chat.seen.o/r': '{}', 'factory.advanced': 'open' };

test('the session starts from what the browser kept', async () => {
  const { m } = await load({ stored: signedIn });
  assert.deepEqual({ ...m.app }, { token: 't', readToken: 'r', catalog: undefined, defaults: undefined, projects: [], current: null });
});

test('a token in the address is kept and wiped from the address bar', async () => {
  const { m, storage, replaced } = await load({ hash: '#jeton=abc&lecture=def', stored: { 'factory.chatToken': 'old' } });
  assert.equal(m.app.token, 'abc');
  assert.equal(m.app.readToken, 'def');
  assert.equal(storage['factory.token'], 'abc');
  assert.deepEqual(replaced, [[null, '', '/panel/']]);
  const alone = await load({ hash: '#jeton=abc', stored: { 'factory.chatToken': 'old' } });
  assert.equal(alone.m.app.readToken, null, 'a link without the read token forgets the stored one');
});

test('resetSession forgets the session first, then runs the reset every screen declared, in order', async () => {
  const { m, storage } = await load({ stored: signedIn });
  m.app.projects = [{}]; m.app.current = {};
  const seen = [];
  m.onReset(() => seen.push(['a', m.app.token, m.app.readToken, m.app.projects.length, m.app.current]));
  m.onReset(() => seen.push(['b', storage['factory.token'] ?? null]));
  m.resetSession();
  assert.deepEqual(seen, [['a', null, null, 0, null], ['b', null]]);
  assert.deepEqual(Object.keys(storage).sort(), ['factory.advanced', 'factory.chat.seen.o/r', 'factory.project'], 'a refused token keeps the project names');
});

test('logging out also forgets every stored project name, never the display preference', async () => {
  const { m, storage } = await load({ stored: signedIn });
  let runs = 0;
  m.onReset(() => { runs++; });
  m.resetSession({ forget: true });
  assert.deepEqual(Object.keys(storage), ['factory.advanced']);
  assert.equal(runs, 1);
});

test('a refused token resets once and shows the sign-in page with its sentence; signed out, it does nothing', async () => {
  const { m, $ } = await load({ stored: signedIn });
  let runs = 0;
  m.onReset(() => { runs++; });
  m.sessionExpired();
  assert.equal(runs, 1);
  assert.equal(m.shown().screen, 'login');
  assert.equal($('login').hidden, false);
  assert.equal($('nav').hidden, true);
  assert.equal($('login-error').textContent, 'GitHub a refusé le jeton : il a sans doute expiré. Créez-en un nouveau et collez-le ici.');
  m.sessionExpired();
  assert.equal(runs, 1, 'already signed out');
});

test('show() says which screen is shown and tells every watcher, even for the same screen again', async () => {
  const { m, $ } = await load();
  assert.deepEqual(m.shown(), { screen: null, tab: 'board', general: false });
  const events = [];
  m.onView((e) => events.push([e.what, e.screen, e.was.screen]));
  m.show('project-view');
  m.show('project-view');
  m.show('empty');
  assert.deepEqual(events, [['screen', 'project-view', null], ['screen', 'project-view', 'project-view'], ['screen', 'empty', 'project-view']]);
  assert.deepEqual(['login', 'empty', 'project-view'].map((s) => $(s).hidden), [true, false, true]);
  assert.equal($('nav').hidden, false);
  const copy = m.shown(); copy.screen = 'login';
  assert.equal(m.shown().screen, 'empty', 'shown() gives a copy');
});

test('selectTab() says which tab is shown, what was shown before, and whether the focus is asked', async () => {
  const { m, $ } = await load();
  const events = [];
  m.onView((e) => events.push([e.what, e.tab, e.was.tab, e.focus]));
  m.selectTab('chat', true);
  m.selectTab('chat');
  m.selectTab('rules');
  assert.deepEqual(events, [['tab', 'chat', 'board', true], ['tab', 'chat', 'chat', false], ['tab', 'rules', 'chat', false]]);
  assert.deepEqual(['board', 'chat', 'rules-panel'].map((id) => $(id).hidden), [true, true, false]);
  assert.deepEqual(['board', 'chat', 'rules'].map((t) => $(`tab-${t}`).attrs['aria-selected']), ['false', 'false', 'true']);
});

test('the general page is part of the view; a watcher may change the view from inside a notification', async () => {
  const { m } = await load();
  const heard = [];
  m.onView((e) => { if (e.what === 'screen' && e.screen !== 'project-view') m.setGeneralOpen(false); });
  m.onView((e) => heard.push([e.what, e.general, e.was.general]));
  m.show('project-view');
  m.setGeneralOpen(true);
  m.show('login');
  assert.deepEqual(heard, [['screen', false, false], ['general', true, false], ['general', false, true], ['screen', true, true]]);
  assert.equal(m.shown().general, false);
});

test('something is unsaved as soon as one screen says so', async () => {
  const { m } = await load();
  assert.equal(m.hasUnsaved(), false);
  let dirty = false;
  m.onUnsaved('settings', () => null);
  m.onUnsaved('answering', () => dirty);
  assert.equal(m.hasUnsaved(), false);
  assert.deepEqual(m.unsavedParts(), { settings: false, message: false, answering: false });
  dirty = true;
  assert.equal(m.hasUnsaved(), true);
  assert.deepEqual(m.unsavedParts(), { settings: false, message: false, answering: true }); // the kind is kept (#572)
});

test('call() runs the action a part provided and gives its result back; unknown or provided twice throws', async () => {
  const { m } = await load();
  m.provide('double', (x) => x * 2);
  m.provide('later', async () => 'done');
  assert.equal(m.call('double', 21), 42);
  assert.equal(await m.call('later'), 'done');
  assert.throws(() => m.call('nope'), /Unknown action: nope/);
  assert.throws(() => m.provide('double', () => 0), /Action already provided: double/);
});

test('the board gate opens with the first cards, or by itself after BOARD_FIRST_MS; holding it again makes a new wait', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { m } = await load({}, { keepGate: true });
  assert.equal(m.BOARD_FIRST_MS, 8000);
  const settled = (p) => { const s = { done: false }; p.then(() => { s.done = true; }); return s; };
  const first = settled(m.boardFirst());
  t.mock.timers.tick(7999); await new Promise(setImmediate);
  assert.equal(first.done, false);
  t.mock.timers.tick(1); await new Promise(setImmediate);
  assert.equal(first.done, true);
  m.holdForBoard();
  const held = m.boardFirst();
  m.holdForBoard();
  assert.equal(m.boardFirst(), held, 'already held: the same wait');
  const second = settled(held);
  m.openBoardGate(); await new Promise(setImmediate);
  assert.equal(second.done, true);
});
