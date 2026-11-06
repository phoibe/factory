// A repository-wide lock for the queue decisions. GitHub's own `concurrency` keeps only one waiting run per group
// and cancels the others (an event is lost); with one group per issue, two events on different issues (a merged PR
// and its closed issue) also run side by side and both take the same free place. This lock makes runs wait their turn.
// `store`: { acquire(): Promise<boolean>, ageMs(): Promise<number|null>, release(), takeOver() }.
export const LOCK_TTL_MS = 10 * 60_000; // a decision takes seconds (a report with several PRs to settle, minutes); longer belongs to a dead run
export const LOCK_WAIT_MS = 13 * 60_000; // under the jobs' timeout (15 minutes), and past the TTL so a dead lock is taken over

export async function withLock(store, fn, { ttlMs = LOCK_TTL_MS, waitMs = LOCK_WAIT_MS, pollMs = 4000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const start = now();
  while (!(await store.acquire())) {
    const age = await store.ageMs();
    if (age !== null && age > ttlMs) { await store.takeOver(); continue; }
    if (now() - start > waitMs) throw new Error('queue lock: waited too long');
    await sleep(pollMs + Math.floor(Math.random() * 500));
  }
  try { return await fn(); } finally { await store.release(); }
}
