// Pure helpers for the live board (tested in test/panel-live.test.mjs).
import { COLUMNS, columnFor } from './lib.mjs?v=25';
import { humanMinutes, rangeText } from './eta.mjs';

const STEPS = [
  { id: 'grilling', name: 'Questions' },
  { id: 'spec', name: 'Spec' },
  { id: 'building', name: 'Construction' },
  { id: 'visual', name: 'Captures' },
  { id: 'checks', name: 'Contrôles' },
  { id: 'acceptance', name: 'Recette' },
];
const ACTIONS = {
  grilling: 'Répondez aux questions',
  spec: 'Validez la spec',
  visual: 'Validez les captures',
  acceptance: 'Testez l\'aperçu',
  blocked: "Débloquez l'agent",
};

// The steps an item goes through. Bugs, general reviews and stack sheets have no questions and no spec.
export function stepsFor(labels) {
  return ['factory:bug', 'factory:audit', 'factory:stack'].some((l) => labels.includes(l)) ? STEPS.slice(2) : STEPS;
}

// Where the card stands in its flow, or null when it cannot be told (a blocked item with no other state).
export function progress(item) {
  const steps = stepsFor(item.labels);
  let col = item.column;
  if (col === 'blocked') col = columnFor(item.labels.filter((l) => l !== 'factory:blocked'));
  if (col === 'queued') col = 'building'; // queued means the spec is approved and the build waits for a slot
  const index = steps.findIndex((s) => s.id === col);
  return index < 0 ? null : { index, total: steps.length, name: steps[index].name };
}

// 'yours' (waits for the owner), 'working' (agents or machines are on it) or 'queued'.
// A blocked card that only waits for the merge of other requests (`waits`, issue #298) waits in the queue lane:
// it starts again by itself, nothing is asked of the owner.
export function laneFor(item) {
  if (item.column === 'queued') return 'queued';
  if (item.column === 'release') return 'working'; // issue #370: a release in progress sits with the agents' work
  if (item.labels.includes('factory:running')) return 'working';
  // Issue #383: its launch failed for a moment, the factory relaunches it alone (until blocked after 3 hours).
  if (item.labels.includes('factory:relaunch') && item.column !== 'blocked') return 'working';
  if (item.column === 'blocked' && item.waits?.length) return 'queued';
  return COLUMNS.find((c) => c.id === item.column)?.yours ? 'yours' : 'working';
}

export const actionFor = (column) => ACTIONS[column] || null;

// « Attend #12 · Ajouter un compte » (a single request whose title is known) or « Attend #12, #15 ».
export function waitsText(waits, titles = new Map()) {
  const title = waits.length === 1 ? titles.get(waits[0]) : null;
  return `Attend ${waits.map((n) => `#${n}`).join(', ')}${title ? ` · ${title}` : ''}`;
}

// The card's time line. `waitsMerged`: all its requests are in « Terminé », the factory is about to resume it.
export const waitsEta = (c) => (c.waitsMerged ? 'Reprise imminente' : `Repart seule dès ${c.waits.length > 1 ? 'leur' : 'sa'} fusion`);

// The awaited requests not merged yet, from the « Terminé » items (a request or its PR merged; one closed by the
// agent without a merge does not count).
export function stillWaited(waits, done) {
  const merged = new Set((done || []).filter((d) => !d.reason).flatMap((d) => [d.number, d.issue]));
  return (waits || []).filter((n) => !merged.has(n));
}

// Cards whose column changed since the previous refresh (prev: Map number -> column, null on first load).
export function moves(prev, cards) {
  if (!prev) return [];
  return cards
    .filter((c) => prev.has(c.number) && prev.get(c.number) !== c.column)
    .map((c) => ({ number: c.number, title: c.title, from: prev.get(c.number), to: c.column }));
}

export function agoText(ms) {
  const s = Math.round(ms / 1000);
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  return `il y a ${Math.floor(s / 60)} min`;
}

// Text of the « En direct » line. It must never be empty: the line changes height when its text arrives,
// which pushes every card down after they were measured for the slide animation.
export function statusText(failures, ms) {
  return failures > 0
    ? 'Connexion à GitHub perdue · nouvel essai automatique'
    : `En direct · à jour ${agoText(ms)}`;
}

// Milliseconds between two refreshes: 8 s when the owner is active, 30 s when idle, doubled after each failure, at most 5 min.
export const pollDelay = (failures, idle = false) => Math.min((idle ? 30_000 : 8_000) * 2 ** failures, 300_000);

export const IDLE_AFTER = 120_000;
// A hidden browser tab is idle by definition: it keeps polling, at the calm rhythm.
export const isIdle = (lastActivity, now, hidden = false) => hidden || now - lastActivity >= IDLE_AFTER;

// Compares two Maps number -> signature (null = nothing drawn yet).
export function cardChanges(prev, next) {
  const added = [], removed = [], changed = [];
  for (const [n, sig] of next) {
    if (!prev || !prev.has(n)) added.push(n);
    else if (prev.get(n) !== sig) changed.push(n);
  }
  if (prev) for (const n of prev.keys()) if (!next.has(n)) removed.push(n);
  return { added, removed, changed };
}

// A card's HTML without the text of its time elements (marked data-time): a clock moving is not a change of the card.
export const withoutTimes = (html) => html.replace(/(<(\w+)\b[^>]*\bdata-time\b[^>]*>)[^<]*(<\/\2>)/g, '$1$3');

// Copies the text of each time element of `fresh` onto the matching one of `old`, in place.
export function syncTimes(old, fresh) {
  const a = old.querySelectorAll('[data-time]'), b = fresh.querySelectorAll('[data-time]');
  a.forEach((node, i) => { if (b[i] && node.textContent !== b[i].textContent) node.textContent = b[i].textContent; });
}

// One short line about time, from estimate() in eta.mjs.
export function timeLine(e) {
  if (e.status === 'queued') return "Démarre dès qu'une place se libère";
  if (e.status === 'yours') return `Ensuite ~${humanMinutes(e.total)} de travail des agents`;
  if (e.overrun) return 'Plus long que prévu · nouvelle estimation en cours';
  const text = rangeText(e.nextLow, e.nextHigh);
  return `${text[0].toUpperCase()}${text.slice(1)} avant la suite`;
}

// What waits for the owner, oldest wait first. reply 'go' = a plain « go » answers it (the spec), 'ok' = a plain « ok »
// answers it (the captures, the recette); 'open' = needs text or a look.
const REPLIES = { spec: 'go', visual: 'ok', acceptance: 'ok' };
export function yoursList(cards) {
  return cards
    .filter((c) => laneFor(c) === 'yours')
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
    .map((c) => ({ ...c, reply: REPLIES[c.column] || 'open' }));
}

// A card slides only when it moved by a real distance. A text that changes length ("il y a 2 min" → "il y a 3 min")
// shifts the cards below by a few pixels: that must not animate.
export const SLIDE_MIN_PX = 8;
export const shouldSlide = (a, b) => Math.abs(a.top - b.top) >= SLIDE_MIN_PX || Math.abs(a.left - b.left) >= SLIDE_MIN_PX;

// What says a card may have new comments: GitHub moves `updated_at` and the count on each new message.
export const cardSig = (card) => `${card.updated_at || ''}|${card.comments || 0}`;

// True when the board must read the card's comments again (seen: its cardSig at the last read).
// A running card's session note and a Vercel bot's preview comment are edited in place, which may not move the
// card: those are read at every refresh (an unchanged answer is a free 304 thanks to the ETag).
export function commentsStale(card, seen, { preview = null } = {}) {
  if (seen !== cardSig(card)) return true;
  if ((card.labels || []).includes('factory:running')) return true;
  return Boolean(card.pull_request) && !preview;
}
