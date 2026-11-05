// Plates the owner just acted on (tested in test/panel-pending.test.mjs).
// State: { [number]: { column, clickedAt, backAt } }. A click on a plate's link notes it; coming back to the
// panel puts the noted plates on hold (« Prise en compte en cours… ') until GitHub shows the plate in another
// column, or for at most PENDING_MS.
export const PENDING_MS = 120_000;
const STALE_MS = 86_400_000; // a click never followed by a return

export const noteClick = (state, item, now) => ({ ...state, [item.number]: { column: item.column, clickedAt: now, backAt: null } });

export function noteReturn(state, now) {
  const out = {};
  for (const [n, e] of Object.entries(state)) out[n] = e.backAt == null ? { ...e, backAt: now } : e;
  return out;
}

// The plates (from `items`, in order) currently on hold, and the state without what no longer counts.
export function pendingNow(state, items, now) {
  const byNumber = new Map(items.map((c) => [String(c.number), c]));
  const kept = {};
  for (const [n, e] of Object.entries(state)) {
    const c = byNumber.get(n);
    if (!c || c.column !== e.column) continue;
    if (e.backAt == null ? now - e.clickedAt >= STALE_MS : now - e.backAt >= PENDING_MS) continue;
    kept[n] = e;
  }
  const pending = items.filter((c) => kept[c.number]?.backAt != null);
  return { pending, state: kept };
}
