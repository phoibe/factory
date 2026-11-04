// A cancellable delayed action: tick(secondsLeft) every second, done() once at 0, cancel() stops it.
const real = { set: (f) => setInterval(f, 1000), clear: (id) => clearInterval(id) };
export function startCountdown({ seconds = 5, tick, done, clock = real }) {
  let left = seconds; let over = false; let id = null;
  const stop = () => { if (over) return false; over = true; clock.clear(id); return true; };
  tick(left);
  id = clock.set(() => {
    left -= 1;
    if (left > 0) return tick(left);
    if (stop()) done();
  });
  return { cancel: stop };
}
