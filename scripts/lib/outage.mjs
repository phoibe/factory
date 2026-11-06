// Passing outages (network, GitHub) are not code failures (issue #213). Pure helpers: the relay does the I/O.
const MIN = 60_000;
const HOUR = 60 * MIN;

// Clear signs that a download or a GitHub call did not get an answer. Anything else is treated as the code's fault:
// a fix too many is better than a real problem ignored (owner's rule).
const NETWORK = [
  /\bE(CONNRESET|TIMEDOUT|CONNREFUSED|CONNABORTED|AI_AGAIN|NOTFOUND|NETUNREACH|HOSTUNREACH|PIPE)\b/,
  /\bERR_SOCKET_TIMEOUT\b/, /socket hang up/i, /network (timeout|aborted|error)/i, /getaddrinfo/i,
  /\bcode E5\d\d\b/, /\b50[234]\b[^\n]*(Bad Gateway|Service Unavailable|Gateway Time-?out)/i,
  /\b(Bad Gateway|Service Unavailable|Gateway Time-?out)\b/i, /Download failed/i, /request to https?:\/\/\S+ failed/i,
];
export const isNetworkFailure = (text) => NETWORK.some((re) => re.test(String(text || '')));

// The retry state of a PR's checks, kept invisible at the end of the PR's description.
export const OUTAGE_MARKER = '<!-- factory-outage';
const OUTAGE_RE = /\n*<!-- factory-outage (\{.*?\}) -->/s;
export function readOutage(body) {
  const m = OUTAGE_RE.exec(String(body || ''));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
export function writeOutage(body, state) {
  const clean = String(body || '').replace(OUTAGE_RE, '');
  return state ? `${clean}\n\n${OUTAGE_MARKER} ${JSON.stringify(state)} -->` : clean;
}

// Silent retries after about 2 then 10 minutes, then one every 30 minutes; blocked after 3 hours (owner's rules).
export const OUTAGE_RETRIES_MS = [2 * MIN, 10 * MIN];
export const OUTAGE_SLOW_MS = 30 * MIN;
export const OUTAGE_GIVE_UP_MS = 3 * HOUR;
export const OUTAGE_TOLD = "GitHub ou le réseau a un problème en ce moment, je réessaie plus tard, rien à faire de votre côté.";

// What to do after checks that failed on an outage. `state.tries` counts the retries already started; a state for
// another commit is ignored (new code, new schedule). `retryInMs`: the retry the report starts itself, shortly.
export function outageStep(state, { sha, now }) {
  const s = state && state.sha === sha ? { ...state } : { sha, since: now, tries: 0 };
  if (now - s.since >= OUTAGE_GIVE_UP_MS) return { state: { ...s, next: null, blocked: true }, action: 'block', retryInMs: null, tell: false };
  if (s.tries === 0) return { state: { ...s, next: null }, action: 'wait', retryInMs: OUTAGE_RETRIES_MS[0], tell: false };
  if (s.tries < OUTAGE_RETRIES_MS.length) return { state: { ...s, next: now + OUTAGE_RETRIES_MS[s.tries] }, action: 'wait', retryInMs: null, tell: false };
  const tell = !s.told;
  return { state: { ...s, next: now + OUTAGE_SLOW_MS, told: true }, action: 'wait', retryInMs: null, tell };
}

// The owner's « réessaie » on a card the outage blocked.
export const isRetry = (text) => /\b(r[ée]essa(ie|yer?|yez)|relance[rz]?|retry)\b/i.test(String(text || '').normalize('NFC'));

// A project's update to the factory's version: retries spaced out (5 min, 30 min, 2 h, then daily) and one alert after
// a day of failures for the same version. `state`: { fingerprint, since, tries, last, alerted }.
export const SYNC_DELAYS_MS = [5 * MIN, 30 * MIN, 2 * HOUR, 24 * HOUR];
export const SYNC_ALERT_MS = 24 * HOUR;
export function syncStep(state, { mine, theirs, now }) {
  if (theirs === mine) return { state: null, dispatch: false, alert: false, changed: Boolean(state) };
  if (!state || state.fingerprint !== mine) {
    return { state: { fingerprint: mine, since: now, tries: 1, last: now }, dispatch: true, alert: false, changed: true };
  }
  const wait = SYNC_DELAYS_MS[Math.min(state.tries - 1, SYNC_DELAYS_MS.length - 1)];
  const dispatch = now - state.last >= wait;
  const alert = !state.alerted && now - state.since >= SYNC_ALERT_MS;
  const next = { ...state, ...(dispatch ? { tries: state.tries + 1, last: now } : {}), ...(alert ? { alerted: true } : {}) };
  return { state: next, dispatch, alert, changed: dispatch || alert };
}
