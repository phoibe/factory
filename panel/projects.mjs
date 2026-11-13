// Pure helpers for the project list and its status dots (issue #314, tested in test/panel-projects.test.mjs).
import { boardItems } from './lib.mjs?v=25';
import { laneFor } from './live.mjs?v=11';

export const DOT_LABELS = { blocked: 'Bloqué', yours: 'À vous de jouer', working: 'En cours' };
const RANK = { blocked: 3, yours: 2, working: 1 };

// Alphabetical, as a French reader expects: « Alpha », « beta », « été », « zeta ».
export const sortProjects = (projects) => [...projects].sort((a, b) => a.repo.name.localeCompare(b.repo.name, 'fr', { sensitivity: 'base' }));

const names = (labels) => (labels || []).map((l) => (typeof l === 'string' ? l : l.name));

// The project's single dot, from its open issues and PRs, with the same lanes as the board:
// red = a blocked card waiting for the owner; blue = any other card in « À vous de jouer »;
// grey = a card in « Les agents travaillent » or « En file d'attente » (a block that only waits for other
// merges, `waits`, is in the queue). Ideas and pending releases have no board column: no dot.
export function projectDot(issues, waits = new Map()) {
  let best = null;
  for (const c of boardItems((issues || []).map((i) => ({ ...i, labels: names(i.labels) })))) {
    const w = c.column === 'blocked' ? waits.get(c.number) || [] : [];
    const lane = laneFor(w.length ? { ...c, waits: w } : c);
    const dot = lane === 'yours' ? (c.column === 'blocked' ? 'blocked' : 'yours') : 'working';
    if (!best || RANK[dot] > RANK[best]) best = dot;
  }
  return best;
}

// The blocked requests no agent is working on: only their comments tell a real block from « Attend #… ».
export const blockedNumbers = (issues) => (issues || [])
  .filter((i) => { const l = names(i.labels); return l.includes('factory:blocked') && !l.includes('factory:running'); })
  .map((i) => i.number);

// The most urgent red or blue dot among the other projects (never grey), for the phone's project button.
export function othersDot(dots, current) {
  let best = null;
  for (const [repo, dot] of dots) if (repo !== current && (dot === 'blocked' || dot === 'yours') && (!best || RANK[dot] > RANK[best])) best = dot;
  return best;
}

// New dots from a round of checks: `undefined` means GitHub did not answer, so the last known dot stays.
export function nextDots(prev, results) {
  const out = new Map(prev);
  for (const [repo, dot] of results) if (dot !== undefined) out.set(repo, dot);
  return out;
}

// Milliseconds before the next check of the other projects: 30 s, or the wait GitHub asked for when it limits
// the calls (at most 5 min, like the board).
export const dotsDelay = (limitedMs = 0) => Math.min(Math.max(limitedMs, 30_000), 300_000);
