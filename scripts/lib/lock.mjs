// A repository-wide lock for the queue decisions. GitHub's own `concurrency` keeps only one waiting run per group
// and cancels the others (an event is lost); with one group per issue, two events on different issues (a merged PR
// and its closed issue) also run side by side and both take the same free place. This lock makes runs wait their turn.
// `store`: { acquire(): Promise<boolean>, ageMs(): Promise<number|null>, release(), takeOver(), refresh?(): Promise<boolean>,
//   guard?(assert | null) }.
// While it works, the holder gives a sign of life every `beatMs` (`store.refresh`): the lock's age is the time since the
// last one, so a run that waits for minutes (a slow preview, several PRs to settle) is never taken for a dead one, and
// a run that really died is replaced after a few minutes.
//
// The turn. Another run may take the lock over once its age passes `ttlMs`. So the holder counts its turn as lost
// (sticky: nothing revives it) when GitHub refuses a sign of life (another run holds the lock), or when `ttlMs - marginMs`
// have passed since the last sign of life that got through was *sent* (a slow answer does not stretch the turn). From
// then on it launches, merges, labels and writes nothing: `withLock` hands the check to the store (`store.guard`), which
// runs it before every write, and the work ends with a `LostTurnError`. It never gives the lock back either: the lock
// may already be another run's; its own expires at most one margin later.
// Why the margin is one beat (60 s): it is the client's time limit for one request, so a write that passed the check at
// the last instant is answered or abandoned before anyone may take over; it covers clock differences between machines
// (the others measure the age with GitHub's commit date); and two missed signs of life are still forgiven.
export const LOCK_BEAT_MS = 60_000;
export const LOCK_TTL_MS = 4 * 60_000; // four missed signs of life: the holder is gone
export const LOCK_WAIT_MS = 13 * 60_000; // under the jobs' timeout (15 minutes), and past the TTL so a dead lock is taken over
export const LOCK_MARGIN_MS = LOCK_BEAT_MS;

// No digit in the message: the GitHub client reads « 404 » / « 422 » in an error text as GitHub's answer.
export class LostTurnError extends Error {
  constructor(why, options) {
    super(`queue lock: turn lost (${why})`, options);
    this.name = 'LostTurnError';
    this.lostTurn = true;
  }
}
export const isLostTurn = (e) => Boolean(e?.lostTurn);

const everyMs = (fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id); };

export async function withLock(store, fn, { ttlMs = LOCK_TTL_MS, waitMs = LOCK_WAIT_MS, pollMs = 4000, beatMs = LOCK_BEAT_MS,
  marginMs = Math.min(LOCK_MARGIN_MS, ttlMs / 4),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), every = everyMs, log = console.log } = {}) {
  const start = now();
  let sureAt = now(); // when the last sign that the lock is ours was sent
  const tryAcquire = async () => { const at = now(); if (await store.acquire()) { sureAt = at; return true; } return false; };
  while (!(await tryAcquire())) {
    const age = await store.ageMs();
    if (now() - start > waitMs) throw new Error('queue lock: waited too long');
    if (age !== null && age > ttlMs) { await store.takeOver(); if (await tryAcquire()) break; } // one immediate try, then the usual wait
    await sleep(pollMs + Math.floor(Math.random() * 500));
  }
  let lost = null; // why the turn was lost, once it is
  const lose = (why) => { if (lost) return; lost = why; log(`queue lock: turn lost (${why}): this run stops here, nothing more is launched or written`); };
  const held = () => {
    if (!lost && now() - sureAt >= ttlMs - marginMs) lose('no sign of life got through in time');
    return !lost;
  };
  const assertTurn = () => { if (!held()) throw new LostTurnError(lost); };
  let beating = null; // the signs of life on their way, waited for before the lock is given back
  let stopped = false;
  const beat = async (at) => {
    try {
      if (await store.refresh()) { if (!lost) sureAt = at; } else lose('taken over by another run');
    } catch (e) { log(`queue lock: no sign of life sent (${e.message || e})`); }
  };
  // A sign of life answered after the next one was due sends that next one at once: waiting for the following tick
  // would leave two beats between signs of life, and slow answers alone would end a healthy run.
  const beats = async () => {
    let at;
    do { at = now(); await beat(at); } while (!stopped && held() && now() - at >= beatMs);
  };
  const tick = () => { if (!beating && held()) beating = beats().finally(() => { beating = null; }); return beating; };
  const stopTimer = store.refresh ? every(tick, beatMs) : () => {};
  const stop = () => { stopped = true; stopTimer(); };
  store.guard?.(assertTurn);
  try {
    let result;
    try { result = await fn(); } catch (e) {
      if (!isLostTurn(e) && !held()) throw new LostTurnError(lost, { cause: e });
      throw e;
    }
    assertTurn();
    return result;
  } finally {
    stop(); await beating;
    store.guard?.(null);
    // Not sure the lock is still ours: leave it to expire rather than drop another run's.
    // A failed release must not hide the work's result: the lock expires by itself (TTL).
    if (held()) { try { await store.release(); } catch (e) { log(`queue lock: release failed, it will expire by itself (${e.message || e})`); } }
  }
}
