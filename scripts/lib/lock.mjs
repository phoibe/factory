// A repository-wide lock for the queue decisions. GitHub's own `concurrency` keeps only one waiting run per group
// and cancels the others (an event is lost); with one group per issue, two events on different issues (a merged PR
// and its closed issue) also run side by side and both take the same free place. This lock makes runs wait their turn.
// `store`: { acquire(): Promise<boolean>, ageMs(): Promise<number|null>, release(), takeOver(), refresh?(): Promise<boolean> }.
// While it works, the holder gives a sign of life every `beatMs` (`store.refresh`): the lock's age is the time since the
// last one, so a run that waits for minutes (a slow preview, several PRs to settle) is never taken for a dead one, and
// a run that really died is replaced after a few minutes.
export const LOCK_BEAT_MS = 60_000;
export const LOCK_TTL_MS = 4 * 60_000; // four missed signs of life: the holder is gone
export const LOCK_WAIT_MS = 13 * 60_000; // under the jobs' timeout (15 minutes), and past the TTL so a dead lock is taken over

const everyMs = (fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id); };

export async function withLock(store, fn, { ttlMs = LOCK_TTL_MS, waitMs = LOCK_WAIT_MS, pollMs = 4000, beatMs = LOCK_BEAT_MS,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), every = everyMs, log = console.log } = {}) {
  const start = now();
  while (!(await store.acquire())) {
    const age = await store.ageMs();
    if (age !== null && age > ttlMs) { await store.takeOver(); continue; }
    if (now() - start > waitMs) throw new Error('queue lock: waited too long');
    await sleep(pollMs + Math.floor(Math.random() * 500));
  }
  let beating = null; // the sign of life on its way, waited for before the lock is given back
  let lost = false;
  const beat = async () => {
    try { if (!(await store.refresh()) && !lost) { lost = true; log('queue lock: lost (taken over by another run)'); } } catch (e) { log(`queue lock: no sign of life sent (${e.message || e})`); }
  };
  const stop = store.refresh ? every(() => { if (!beating && !lost) beating = beat().finally(() => { beating = null; }); return beating; }, beatMs) : () => {};
  try { return await fn(); } finally {
    stop(); await beating;
    // A failed release must not hide the work's result: the lock expires by itself (TTL).
    try { await store.release(); } catch (e) { log(`queue lock: release failed, it will expire by itself (${e.message || e})`); }
  }
}
