import { test } from 'node:test';
import assert from 'node:assert/strict';

// A browser just good enough for screen-login.mjs: elements that keep their text and their listeners.
const nodes = new Map();
const node = () => ({
  textContent: '', value: '', listeners: {}, shown: new Set(),
  addEventListener(type, fn) { this.listeners[type] = fn; },
  get classList() { const s = this.shown; return { add: (c) => s.add(c), remove: (c) => s.delete(c) }; },
});
const set = (k, value) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
set('document', { getElementById: (id) => nodes.get(id) || nodes.set(id, node()).get(id) });
set('localStorage', Object.create({ getItem: () => null, setItem() {}, removeItem() {} }));
set('location', { hash: '', pathname: '/panel/', search: '' });
set('history', { replaceState() {} });
const $ = (id) => document.getElementById(id);

const { provide, app } = await import('../panel/common.mjs');
const { errorText } = await import('../panel/errors.mjs');
await import('../panel/screen-login.mjs');

test('after login, a project that fails to open shows the same toast as on page load (issue #591)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const err = new Error('boom');
  provide('start', async () => { throw err; });
  const unhandled = [];
  const keep = (e) => unhandled.push(e);
  process.on('unhandledRejection', keep);
  t.after(() => process.off('unhandledRejection', keep));
  $('token').value = ' jeton ';
  $('login-form').listeners.submit({ preventDefault() {} });
  await new Promise((r) => setImmediate(r));
  assert.equal(app.token, 'jeton');
  assert.equal($('toast').textContent, errorText(err));
  assert.ok($('toast').shown.has('show'), 'a temporary toast');
  assert.equal($('login-error').textContent, '', 'not under the login field');
  assert.deepEqual(unhandled, []);
});
