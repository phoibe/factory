// A card blocked because it waits for the merge of other requests of the same project (issue #298).
// The agent notes them in its blocking message with an invisible line; the relay resumes the card once they are
// all merged, and the panel shows « Attend #12 ». Shared by the relay and the panel (copied next to it by pages.yml).
const AGENT = '<!-- factory-agent -->';
const MARKER = /<!-- factory-waits-for ([#\d,\s]+?) -->/;
// On the factory's wake or abandon message: the link is used up, a later block is a normal one.
export const WAITS_DONE_MARKER = '<!-- factory-waits-done -->';

export const waitsMarker = (numbers) => `<!-- factory-waits-for ${numbers.map((n) => `#${n}`).join(' ')} -->`;

// The requests the card waits for, from its comments (oldest first). Empty when the last marker was used up or
// the owner wrote after it (he took the matter in hand: the link is forgotten).
export function waitedFor(comments) {
  const list = comments || [];
  let i = list.length - 1;
  for (; i >= 0; i--) if (MARKER.test(String(list[i]?.body || ''))) break;
  if (i < 0) return [];
  const later = list.slice(i + 1).map((c) => String(c?.body || ''));
  if (later.some((b) => !b.includes(AGENT) || b.includes(WAITS_DONE_MARKER))) return [];
  const nums = MARKER.exec(String(list[i].body))[1].match(/\d+/g) || [];
  return [...new Set(nums.map(Number))];
}

// 'merged', 'abandoned' or 'open', from the GitHub issue (or PR) object of a waited request. A request closed as
// done (its PR merged, the factory closes it) counts as merged; one closed otherwise, or gone, as abandoned.
export function requestState(item) {
  if (!item) return 'abandoned';
  if (item.pull_request) return item.pull_request.merged_at ? 'merged' : item.state === 'closed' ? 'abandoned' : 'open';
  if (item.state !== 'closed') return 'open';
  return item.state_reason === 'completed' ? 'merged' : 'abandoned';
}
