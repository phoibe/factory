// Plates the owner just acted on (tested in test/panel-pending.test.mjs).
// State: { [number]: { column, clickedAt, backAt } }. A click on a plate's link notes it; coming back to the
// panel puts the noted plates on hold (« Prise en compte en cours… ') until GitHub shows the plate in another
// column, or for at most PENDING_MS.
import { humanMinutes } from './eta.mjs';

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

// An answer the owner wrote on GitHub that the factory has not taken yet: the card's newest message is his own, not
// one of the factory's (its messages and notes carry a « <!-- factory-… » marker; the panel's own forward of an
// answer from a PR to its request, « factory-answer-pr », is still his). GitHub starts the factory on each message,
// but it sometimes holds that start for many minutes: the card then waits here, on every device, instead of going
// back to « À vous de jouer » as if nothing had been sent. Returns the answer's time in ms, or null.
export function untakenAnswer(comments, owner) {
  const last = (comments || []).at(-1);
  if (!last || !owner || last.user?.login !== owner) return null;
  const body = String(last.body || '').replace(/<!-- factory-answer-pr:\d+ -->/g, '');
  if (/<!--\s*factory-/.test(body)) return null;
  const at = Date.parse(last.created_at);
  return Number.isFinite(at) ? at : null;
}

// The « À vous de jouer » cards on hold (clicked and back, or answered and not taken yet), in their order there.
// `answered`: Map number -> time of the untaken answer.
export function heldCards(yours, clicked, answered) {
  const held = new Set(clicked.map((c) => c.number));
  return yours.filter((c) => held.has(c.number) || answered.has(c.number));
}

// Past this, a card on hold says that GitHub is late: a real warning, the factory usually takes an answer in a minute.
export const LATE_MS = 10 * 60_000;

// The status line of a card on hold. `answeredAt`: its untaken answer's time, if any.
export function holdLine(answeredAt, now) {
  if (answeredAt == null || now - answeredAt < LATE_MS) return { late: false, text: 'En attente de GitHub' };
  return { late: true, text: `Réponse pas encore prise en compte · GitHub tarde depuis ${humanMinutes((now - answeredAt) / 60_000)}` };
}
