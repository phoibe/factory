// An agent launch that failed for a passing reason (issue #383): what to start again and when, kept invisible at the
// end of the card's description. Shared by the relay (scripts/lib/relaunch.mjs) and the panel (« Relance prévue à »).
export const RELAUNCH_MARKER = '<!-- factory-relaunch';
const RE = /\n*<!-- factory-relaunch (\{.*?\}) -->/s;

export function readRelaunch(body) {
  const m = RE.exec(String(body || ''));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// `<` and `>` are escaped: the saved follow-up messages carry hidden comments of their own, whose `-->` would end
// this one.
export function writeRelaunch(body, state) {
  const clean = String(body || '').replace(RE, '');
  if (!state) return clean;
  const json = JSON.stringify(state).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `${clean}\n\n${RELAUNCH_MARKER} ${json} -->`;
}

// Once its time has passed (the tick runs late), the relaunch is imminent: a time in the past would read as forgotten.
export function relaunchLine(state, timeZone, now = Date.now()) {
  if (!state?.next) return null;
  if (now >= state.next) return 'Relance imminente';
  const time = new Date(state.next).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
  return `Relance prévue à ${time}`;
}
