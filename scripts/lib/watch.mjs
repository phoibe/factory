// A check the factory started in its own run (the preview before the recette, the live site after a « Mise en
// production ») and whose report it waits for (issue #396). Noted invisibly at the end of the PR's or the request's
// description when it starts, cleared when its report comes; the tick starts a check again that never reported (its
// run stopped on a GitHub limit, a time limit, a lost runner), and gives up after a few tries. Pure helpers.
const MIN = 60_000;

export const WATCH_MARKER = '<!-- factory-watch';
const WATCH_RE = /\n*<!-- factory-watch (\{.*?\}) -->/s;
export function readWatch(body) {
  const m = WATCH_RE.exec(String(body || ''));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
export function writeWatch(body, state) {
  const clean = String(body || '').replace(WATCH_RE, '');
  // < and > escaped: an address or a version holding « --> » must not end the comment early.
  return state ? `${clean}\n\n${WATCH_MARKER} ${JSON.stringify(state).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')} -->` : clean;
}

// How long a check may take before it counts as lost: its jobs' time limits in relay.yml, plus the wait for runners.
// Preview: decide (15 min), preview-open (20), preview (30) = 65. Live site: decide (15), production-open (35),
// production-smoke (35), production (15) = 100. A late report after a restart is dropped by the relay anyway.
export const WATCH_LOST_MS = { preview: 90 * MIN, production: 2 * 60 * MIN };
// Checks started again before the factory gives up on one and goes on without it.
export const WATCH_MAX_TRIES = 2;

// What the tick does with a noted check: wait, start it again, or give up.
export function watchStep(state, now) {
  const lostMs = WATCH_LOST_MS[state?.kind];
  if (!lostMs || now - Number(state.at || 0) < lostMs) return 'wait';
  return (state.tries || 0) < WATCH_MAX_TRIES ? 'retry' : 'give-up';
}
