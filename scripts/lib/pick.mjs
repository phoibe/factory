import { L } from './labels.mjs';

const names = (labels = []) => labels.map((l) => (typeof l === 'string' ? l : l.name));
// Labels that mean the card is already taken, waits for the owner, or must never be started alone.
const EXCLUDED = [L.question, L.project, 'factory:release', L.grilling, L.specReview, L.queued, L.building, L.blocked, L.running, L.noPick];

export function isPickable(labels) {
  const set = names(labels);
  if (!set.includes(L.feature) && !set.includes(L.bug) && !set.includes(L.audit)) return false;
  return !EXCLUDED.some((l) => set.includes(l));
}

// Urgent cards first, then bugs, then the rest; oldest first within each group.
export function pickOrder(issues) {
  const rank = (i) => {
    const set = names(i.labels);
    return set.includes(L.urgent) ? 0 : set.includes(L.bug) ? 1 : 2;
  };
  return issues
    .filter((i) => !i.pull_request && isPickable(i.labels))
    .sort((a, b) => rank(a) - rank(b) || Date.parse(a.created_at) - Date.parse(b.created_at) || a.number - b.number);
}
