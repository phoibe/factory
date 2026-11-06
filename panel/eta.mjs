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
  // A run that began just before the stay counts too: the relay adds « running » a few seconds before the column label.
  const inside = runs.filter((r) => r.end > stay.start && r.start < stay.end);
  const used = col === 'building' ? inside.slice(0, 1) : inside; // later runs on a built issue are PR fixes
  return used.reduce((s, r) => s + (Math.min(r.end, stay.end) - Math.max(r.start, stay.start)) / MIN, 0);
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

// Starting building times per feature size (minutes), until the project has its own history.
export const BUILD_DEFAULTS = { small: 20, medium: 45, large: 90 };
const SIZES = Object.keys(BUILD_DEFAULTS);
const MARKER = /<!--\s*factory-estimate\s+size=(\w+)\s+min=(\d+)\s+max=(\d+)\s*-->/;

// The agent's latest estimate from an issue's comments: {size, min, max, at} or null.
// Made sane: min >= 1, min <= max, max at most 2.5 times min.
export function parseEstimate(comments) {
  let best = null;
  for (const c of comments || []) {
    if (!(c.body || '').includes('<!-- factory-agent -->') || c.body.includes('<!-- factory-notified -->')) continue; // only the agent's own comments
    const m = MARKER.exec(c.body || '');
    if (!m || !SIZES.includes(m[1])) continue;
    const at = Date.parse(c.created_at);
    if (!Number.isFinite(at) || (best && at < best.at)) continue;
    const lo = Math.min(480, Math.max(1, Math.min(+m[2], +m[3])));
    const hi = Math.min(480, Math.max(1, Math.max(+m[2], +m[3])));
    best = { size: m[1], min: lo, max: Math.min(hi, Math.max(lo, Math.floor(lo * 2.5))), at };
  }
  return best;
}

// Typical minutes of agent time in "building" per size: median once 2+ builds of that size are done.
// `sizes` maps issue number -> size (from the agent's estimate comments).
export function buildingMinutes(events, now, sizes = {}) {
  const samples = { small: [], medium: [], large: [] };
  const numbers = [...new Set(events.map((e) => e.issue?.number).filter(Boolean))];
  for (const n of numbers) {
    const size = sizes[n];
    if (!samples[size]) continue;
    const runs = labelIntervals(events, n, RUNNING, now);
    for (const stay of labelIntervals(events, n, labelOf('building'), now)) {
      if (stay.open) continue;
      const w = workIn('building', stay, runs);
      if (w > 0) samples[size].push(w);
    }
  }
  return Object.fromEntries(SIZES.map((s) => [s, samples[s].length >= 2 ? median(samples[s]) : BUILD_DEFAULTS[s]]));
}

// A believable range around a typical duration: 30 % under, 40 % over.
const around = (m) => {
  const low = Math.max(1, Math.round(m * 0.7));
  return [low, Math.max(low + 1, Math.round(m * 1.4))];
};

// What a card shows about time. `item` has number, labels, column and pull_request (truthy for a PR).
// `agent` is the agent's estimate for this issue (see parseEstimate), used while the issue is being built.
export function estimate(item, events, minutes, now, agent = null) {
  const col = item.column;
  const stay = labelIntervals(events, item.number, labelOf(col), now).at(-1);
  const since = stay ? Math.max(0, Math.round((now - stay.start) / MIN)) : null;
  const running = item.labels.includes(RUNNING);
  const isBug = ['factory:bug', 'factory:audit', 'factory:stack'].some((l) => item.labels.includes(l)); // no questions, no spec
  if (col === 'queued') return { since, status: 'queued' };
  const yours = COLUMNS.find((c) => c.id === col)?.yours && !running;
  const flow = FLOW.filter((c) => !(isBug && (c === 'grilling' || c === 'spec')));
  const idx = flow.indexOf(col);
  const later = idx >= 0 ? flow.slice(idx + 1) : [];
  // For an issue still in "building", the PR steps are all ahead.
  const ahead = later.reduce((s, c) => s + minutes[c], 0);
  const aheadLow = Math.round(ahead * 0.8);
  const aheadHigh = Math.round(ahead * 1.3);
  if (yours) {
    return { since, status: 'yours', next: null, total: Math.round(ahead), totalLow: aheadLow, totalHigh: aheadHigh, endAt: null };
  }
  const runs = labelIntervals(events, item.number, RUNNING, now);
  const done = stay ? workIn(col, { start: stay.start, end: now }, runs) : 0;
  const planned = col === 'building' && agent && (!stay || agent.at >= stay.start) ? agent : null;
  let low;
  let high;
  let overrun;
  let next;
  if (planned) {
    // The agent's range counts from the moment it was posted, so a fresh estimate restarts the clock.
    let spent = runs.reduce((t, r) => t + Math.max(0, Math.min(r.end, now) - Math.max(r.start, planned.at)), 0) / MIN;
    if (!stay && !runs.length) spent = Math.max(0, (now - planned.at) / MIN); // label history too old to be loaded
    // Agents overestimate (e.g. 30-70 min for builds that take 10-20): the measured history of builds of this
    // size, when lower, wins over their range.
    const [histLow, histHigh] = around(minutes.building);
    const planMin = Math.min(planned.min, histLow);
    const planMax = Math.max(planMin + 1, Math.min(planned.max, histHigh));
    overrun = spent >= planMax;
    low = Math.max(0, Math.round(planMin - spent));
    high = Math.max(0, Math.round(planMax - spent));
  } else {
    const left = minutes[col] - done;
    overrun = left <= 0;
    [low, high] = overrun ? [0, 0] : around(left);
    next = Math.max(0, Math.round(left));
  }
  if (!overrun) high = Math.max(high, low + 1);
  if (overrun) next = 0;
  else if (next === undefined) next = Math.round((low + high) / 2);
  const total = Math.round(next + ahead);
  return {
    since,
    status: 'working',
    overrun,
    next,
    nextLow: low,
    nextHigh: high,
    total,
    totalLow: low + aheadLow,
    totalHigh: high + aheadHigh,
    endAt: now + total * MIN,
  };
}

// « entre 20 et 40 min », « entre 50 min et 1 h 20 », « environ 5 min ».
export function rangeText(low, high) {
  if (Math.round(low) <= 1 && Math.round(high) > 2) return `moins de ${humanMinutes(high)}`;
  if (Math.round(low) === Math.round(high)) return `environ ${humanMinutes(low)}`;
  if (high < 60) return `entre ${Math.round(low)} et ${Math.round(high)} min`;
  return `entre ${humanMinutes(low)} et ${humanMinutes(high)}`;
}

// Short French text for a duration in minutes.
export function humanMinutes(m) {
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

// One line about time, e.g. « entre 20 et 40 min avant l'étape suivante (hors vos réponses) ».
export function etaText(e) {
  const since = e.since !== null && e.since !== undefined ? ` depuis ${humanMinutes(e.since)}` : '';
  if (e.status === 'queued') return `En file${since} : démarre dès qu'une place se libère`;
  if (e.status === 'yours') return `Attend votre réponse${since} · ensuite ~${humanMinutes(e.total)} de travail jusqu'à la fin`;
  if (e.overrun) return "Plus long que prévu · nouvelle estimation en cours (hors vos réponses)";
  return `${rangeText(e.nextLow, e.nextHigh)} avant l'étape suivante (hors vos réponses)`;
}
