// Pure helpers for the live board (tested in test/panel-live.test.mjs).
import { COLUMNS, columnFor } from './lib.mjs';
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
  acceptance: 'Testez la preview',
  blocked: "Débloquez l'agent",
};

// The steps an item goes through. Bugs and general reviews have no questions and no spec.
export function stepsFor(labels) {
  return labels.includes('factory:bug') || labels.includes('factory:audit') ? STEPS.slice(2) : STEPS;
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
export function laneFor(item) {
  if (item.column === 'queued') return 'queued';
  if (item.labels.includes('factory:running')) return 'working';
  return COLUMNS.find((c) => c.id === item.column)?.yours ? 'yours' : 'working';
}

export const actionFor = (column) => ACTIONS[column] || null;

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
export const isIdle = (lastActivity, now) => now - lastActivity >= IDLE_AFTER;

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

// One short line about time, from estimate() in eta.mjs.
export function timeLine(e) {
  if (e.status === 'queued') return "Démarre dès qu'une place se libère";
  if (e.status === 'yours') return `Ensuite ~${humanMinutes(e.total)} de travail des agents`;
  if (e.overrun) return 'Plus long que prévu · nouvelle estimation en cours';
  const text = rangeText(e.nextLow, e.nextHigh);
  return `${text[0].toUpperCase()}${text.slice(1)} avant la suite`;
}

// What waits for the owner, oldest wait first. reply 'go' = a plain « go » answers it; 'open' = needs text or a look.
export function yoursList(cards) {
  return cards
    .filter((c) => laneFor(c) === 'yours')
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
    .map((c) => ({ ...c, reply: c.column === 'spec' ? 'go' : 'open' }));
}

// A card slides only when it moved by a real distance. A text that changes length ("il y a 2 min" → "il y a 3 min")
// shifts the cards below by a few pixels: that must not animate.
export const SLIDE_MIN_PX = 8;
export const shouldSlide = (a, b) => Math.abs(a.top - b.top) >= SLIDE_MIN_PX || Math.abs(a.left - b.left) >= SLIDE_MIN_PX;
