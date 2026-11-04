import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startCountdown } from '../panel/countdown.mjs';

// Fake clock: advance() runs the interval callback n times.
function fakeClock() {
  let fn = null; let cleared = false;
  return { set: (f) => { fn = f; cleared = false; return 1; }, clear: () => { fn = null; cleared = true; }, advance(n) { for (let i = 0; i < n && fn; i++) fn(); }, get cleared() { return cleared; } };
}

test('counts down from 5 and fires once at 0', () => {
  const c = fakeClock(); const ticks = []; let fired = 0;
  startCountdown({ seconds: 5, tick: (s) => ticks.push(s), done: () => fired++, clock: c });
  assert.deepEqual(ticks, [5]);
  c.advance(4); assert.equal(fired, 0); assert.deepEqual(ticks, [5, 4, 3, 2, 1]);
  c.advance(3); assert.equal(fired, 1);
});

test('cancel before the end never fires, and is idempotent', () => {
  const c = fakeClock(); let fired = 0;
  const h = startCountdown({ seconds: 5, tick() {}, done: () => fired++, clock: c });
  c.advance(2); h.cancel(); h.cancel(); c.advance(10);
  assert.equal(fired, 0); assert.equal(c.cleared, true);
});
