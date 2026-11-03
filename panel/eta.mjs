// Time estimates for the board (pure, tested in test/panel-eta.test.mjs).
// Only agent and machine time is estimated: the owner's own answer time is never guessed.
import { COLUMNS } from './lib.mjs';

const MIN = 60_000;
const RUNNING = 'factory:running';
// Order of the steps a feature goes through. Bugs skip the first two.
export const FLOW = ['grilling', 'spec', 'building', 'visual', 'checks', 'acceptance'];
// Starting values (minutes of agent or machine work per step) until the project has its own history.
export const DEFAULT_MINUTES = { grilling: 10, spec: 5, building: 45, visual: 3, checks: 6, acceptance: 2, blocked: 5 };
const labelOf = (col) => COLUMNS.find((c) => c.id === col)?.label;

// [{start, end}] in ms while `label` was on item `number`, from repository issue events (any order).
export function labelIntervals(events, number, label, now) {
  const evs = events
    .filter((e) => e.issue?.number === number && e.label?.name === label && (e.event === 'labeled' || e.event === 'unlabeled'))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const out = [];
  let start = null;
  for (const e of evs) {
    const t = Date.parse(e.created_at);
    if (e.event === 'labeled' && start === null) start = t;
    if (e.event === 'unlabeled' && start !== null) { out.push({ start, end: t }); start = null; }
  }
  if (start !== null) out.push({ start, end: now, open: true });
  return out;
}

// Agent or machine minutes spent in one stay in a column.
function workIn(col, stay, runs) {
  if (col === 'checks') return (stay.end - stay.start) / MIN; // checks run on Actions, without the running label
  const inside = runs.filter((r) => r.start >= stay.start && r.start < stay.end);
  const used = col === 'building' ? inside.slice(0, 1) : inside; // later runs on a built issue are PR fixes
  return used.reduce((s, r) => s + (Math.min(r.end, stay.end) - r.start) / MIN, 0);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Typical minutes of work per column: the median of finished stays once there are 2 or more, else the default.
export function stageMinutes(events, now) {
  const numbers = [...new Set(events.map((e) => e.issue?.number).filter(Boolean))];
  const samples = Object.fromEntries(FLOW.map((c) => [c, []]));
  for (const n of numbers) {
    const runs = labelIntervals(events, n, RUNNING, now);
    for (const col of FLOW) {
      for (const stay of labelIntervals(events, n, labelOf(col), now)) {
        if (stay.open) continue;
        const w = workIn(col, stay, runs);
        if (w > 0) samples[col].push(w);
      }
    }
  }
  return Object.fromEntries(Object.entries(DEFAULT_MINUTES).map(([c, d]) => [c, samples[c]?.length >= 2 ? median(samples[c]) : d]));
}

// What a card shows about time. `item` has number, labels, column and pull_request (truthy for a PR).
export function estimate(item, events, minutes, now) {
  const col = item.column;
  const stay = labelIntervals(events, item.number, labelOf(col), now).at(-1);
  const since = stay ? Math.max(0, Math.round((now - stay.start) / MIN)) : null;
  const running = item.labels.includes(RUNNING);
  const isBug = item.labels.includes('factory:bug');
  if (col === 'queued') return { since, status: 'queued' };
  const yours = COLUMNS.find((c) => c.id === col)?.yours && !running;
  const flow = FLOW.filter((c) => !(isBug && (c === 'grilling' || c === 'spec')));
  const idx = flow.indexOf(col);
  const later = idx >= 0 ? flow.slice(idx + 1) : [];
  // For an issue still in "building", the PR steps are all ahead.
  const ahead = later.reduce((s, c) => s + minutes[c], 0);
  let current = 0;
  if (!yours) {
    const runs = labelIntervals(events, item.number, RUNNING, now);
    const done = stay ? workIn(col, { start: stay.start, end: now }, runs) : 0;
    current = Math.max(minutes[col] - done, 2);
  }
  const total = Math.round(current + ahead);
  return {
    since,
    status: yours ? 'yours' : 'working',
    next: yours ? null : Math.round(current),
    total,
    endAt: yours ? null : now + total * MIN,
  };
}

// Short French text for a duration in minutes.
export function humanMinutes(m) {
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

// One line for the card, e.g. « ~12 min avant la suite · fin vers 20:40 ».
export function etaText(e, clock = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })) {
  const since = e.since !== null && e.since !== undefined ? ` depuis ${humanMinutes(e.since)}` : '';
  if (e.status === 'queued') return `En file${since} : démarre dès qu'une place se libère`;
  if (e.status === 'yours') return `Attend ta réponse${since} · ensuite ~${humanMinutes(e.total)} de travail jusqu'à la fin`;
  return `~${humanMinutes(e.next)} avant l'étape suivante · fin estimée vers ${clock(e.endAt)} (hors tes réponses)`;
}
