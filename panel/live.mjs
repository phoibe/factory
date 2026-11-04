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
  grilling: 'Réponds aux questions',
  spec: 'Valide la spec',
  visual: 'Valide les captures',
  acceptance: 'Teste la preview',
  blocked: "Débloque l'agent",
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

// Seconds between two refreshes: 15 s, doubled after each failure, at most 5 min.
export const pollDelay = (failures) => Math.min(15_000 * 2 ** failures, 300_000);

// One short line about time, from estimate() in eta.mjs.
export function timeLine(e) {
  if (e.status === 'queued') return "Démarre dès qu'une place se libère";
  if (e.status === 'yours') return `Ensuite ~${humanMinutes(e.total)} de travail des agents`;
  if (e.overrun) return 'Plus long que prévu · nouvelle estimation en cours';
  const text = rangeText(e.nextLow, e.nextHigh);
  return `${text[0].toUpperCase()}${text.slice(1)} avant la suite`;
}
