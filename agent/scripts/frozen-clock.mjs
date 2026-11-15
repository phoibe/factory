// Starts the app's clock on the captures' fixed date and time (issue #422): the browser's clock is frozen by the
// screenshots tool, but an app that dates its sample data when it starts would show another time « before » and
// « after » (they are launched minutes apart), and the screen would be shown as changed. Loaded with
// `node --import`, through the environment printed by `shots.mjs env`; it does nothing without FACTORY_FROZEN_TIME.
// The clock keeps ticking from that time (timers and timeouts work as usual); only the starting point is fixed.
// No dependency on purpose: it is loaded inside the project's own app.

export function installFrozenClock(start, realNow = Date.now) {
  const RealDate = globalThis.Date;
  const startAt = typeof start === 'number' ? start : RealDate.parse(start);
  if (!Number.isFinite(startAt)) throw new Error(`frozen-clock: invalid time ${start}`);
  const offset = startAt - realNow();
  const now = () => realNow() + offset;
  class FrozenDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now()]));
    }
    static now() { return now(); }
    // A date made before the install (or by a library holding the real Date) is still a Date.
    static [Symbol.hasInstance](x) { return x instanceof RealDate; }
  }
  // Date() called without `new` returns a string of the current time.
  const FrozenDateFn = new Proxy(FrozenDate, { apply: () => new RealDate(now()).toString() });
  globalThis.Date = FrozenDateFn;
  return () => { globalThis.Date = RealDate; };
}

const fixed = globalThis.process?.env?.FACTORY_FROZEN_TIME;
if (fixed) installFrozenClock(fixed);
