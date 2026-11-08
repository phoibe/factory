// A card blocked because it waits for the merge of other requests of the same project (issue #298).
// The agent notes them in its blocking message with an invisible line; the relay resumes the card once they are
// all merged, and the panel shows « Attend #12 ». Shared by the relay and the panel (copied next to it by pages.yml).
const AGENT = '<!-- factory-agent -->';
const MARKER = /<!-- factory-waits-for ([#\d,\s]+?) -->/;
// On the factory's wake or abandon message: the link is used up, a later block is a normal one.
export const WAITS_DONE_MARKER = '<!-- factory-waits-done -->';
// On the message of a queued card the factory resumes: its merged requests are used up.
export const RESUMED_MARKER = '<!-- factory-waits-resumed -->';

const MERGED = /<!-- factory-waits-merged ([#\d,\s]+?) -->/;
// The requests the agent closed by itself without a merge (already done, duplicate, obsolete).
const CLOSED_BY_AGENT = ['factory:already-done', 'factory:duplicate', 'factory:obsolete'];
const tags = (numbers) => numbers.map((n) => `#${n}`).join(' ');

export const waitsMarker = (numbers) => `<!-- factory-waits-for ${tags(numbers)} -->`;
// On the message of a card queued once its requests are merged: it resumes with them when a place frees up.
export const mergedMarker = (numbers) => `<!-- factory-waits-merged ${tags(numbers)} -->`;

// The numbers named by the last agent or factory comment matching `marker`; empty when a later comment holds `stop`
// or, with `ownerStops`, when the owner wrote after it.
function lastMarked(comments, marker, stop, ownerStops) {
  const list = comments || [];
  let i = list.length - 1;
  for (; i >= 0; i--) { const b = String(list[i]?.body || ''); if (b.includes(AGENT) && marker.test(b)) break; }
  if (i < 0) return [];
  const later = list.slice(i + 1).map((c) => String(c?.body || ''));
  if (later.some((b) => (ownerStops && !b.includes(AGENT)) || b.includes(stop))) return [];
  const nums = marker.exec(String(list[i].body))[1].match(/\d+/g) || [];
  return [...new Set(nums.map(Number))];
}

// The requests the card waits for, from its comments (oldest first). Empty when the last marker was used up or
// the owner wrote after it (he took the matter in hand: the link is forgotten).
export const waitedFor = (comments) => lastMarked(comments, MARKER, WAITS_DONE_MARKER, true);

// The merged requests a card queued by the factory resumes with (an owner message meanwhile changes nothing: the
// merge did happen), until the factory resumes it.
export const mergedWaits = (comments) => lastMarked(comments, MERGED, RESUMED_MARKER, false);

// 'merged', 'abandoned' or 'open', from the GitHub issue (or PR) object of a waited request. An issue counts as
// merged only when a merged PR closes it (`mergedIssues`); one closed otherwise (by hand, by the agent), or gone,
// as abandoned.
export function requestState(item, mergedIssues = new Set()) {
  if (!item) return 'abandoned';
  if (item.pull_request) return item.pull_request.merged_at ? 'merged' : item.state === 'closed' ? 'abandoned' : 'open';
  if (item.state !== 'closed') return 'open';
  const labels = (item.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const done = item.state_reason === 'completed' && !labels.some((l) => CLOSED_BY_AGENT.includes(l));
  return done && mergedIssues.has(item.number) ? 'merged' : 'abandoned';
}
