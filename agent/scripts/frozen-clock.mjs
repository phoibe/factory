// Starts the app's clock on the captures' fixed date and time (issue #422): the browser's clock is frozen by the
// screenshots tool, but an app that dates its sample data when it starts would show another time « before » and
// « after » (they are launched minutes apart), and the screen would be shown as changed. Loaded with
// `node --import`, through `shots.mjs run -- <command>` (or the environment printed by `shots.mjs env`); it does nothing without FACTORY_FROZEN_TIME.
// The clock keeps ticking from that time (timers and timeouts work as usual); only the starting point is fixed.
// No dependency on purpose: it is loaded inside the project's own app.

export function installFrozenClock(start, realNow = Date.now) {
  const RealDate = globalThis.Date;
  const startAt = typeof start === 'number' ? start : RealDate.parse(start);
  if (!Number.isFinite(startAt)) throw new Error(`frozen-clock: invalid time ${start}`);
  const offset = startAt - realNow();
  const now = () => realNow() + offset;
  let FrozenDateFn;
  class FrozenDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now()]));
    }
    static now() { return now(); }
    // A date made before the install (or by Node itself, or by a library holding the real Date) is still a Date;
    // a subclass of Date (inherits this method) keeps the usual check.
    static [Symbol.hasInstance](x) {
      return this === FrozenDate || this === FrozenDateFn ? x instanceof RealDate : Function.prototype[Symbol.hasInstance].call(this, x);
    }
  }
  // Looks like the real Date: name, arity, and `new Date().constructor === Date` (logs and equality checks rely on them).
  Object.defineProperty(FrozenDate, 'name', { value: 'Date' });
  Object.defineProperty(FrozenDate, 'length', { value: 7 });
  // Date() called without `new` returns a string of the current time.
  FrozenDateFn = new Proxy(FrozenDate, { apply: () => new RealDate(now()).toString() });
  Object.defineProperty(FrozenDate.prototype, 'constructor', { value: FrozenDateFn, writable: true, configurable: true });
  globalThis.Date = FrozenDateFn;
  return () => { globalThis.Date = RealDate; };
}

const fixed = globalThis.process?.env?.FACTORY_FROZEN_TIME;
if (fixed) installFrozenClock(fixed);
