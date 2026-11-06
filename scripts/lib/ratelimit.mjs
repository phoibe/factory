// GitHub's « too many requests » answer, read the same way by the relay (Node) and the panel (browser).
// Primary limit: 403 or 429 with x-ratelimit-remaining 0 and x-ratelimit-reset (epoch seconds).
// Secondary limit: 403 or 429 with retry-after (seconds). Any other 403 is a refused permission, not a limit.
export const MAX_PAUSE_MS = 60_000; // longer waits are not spent in place: the event is taken up again later

// How long GitHub asks to wait before the same call, in ms, or null when the answer is not a rate limit.
export function rateLimitDelay(status, headers, nowMs = Date.now()) {
  if (status !== 429 && status !== 403) return null;
  const get = (k) => headers?.get?.(k) ?? null;
  const after = get('retry-after');
  const remaining = get('x-ratelimit-remaining');
  if (status === 403 && after === null && remaining !== '0') return null;
  if (after !== null && Number.isFinite(Number(after))) return Math.max(1000, Number(after) * 1000);
  const reset = Number(get('x-ratelimit-reset'));
  if (remaining === '0' && Number.isFinite(reset) && reset > 0) return Math.max(1000, reset * 1000 - nowMs);
  return 60_000;
}

export class RateLimited extends Error {
  constructor(waitMs) {
    super(`GitHub rate limit: retry in ${Math.round(waitMs / 1000)} s`);
    this.waitMs = waitMs;
    this.rateLimited = true;
  }
}

export const isRateLimited = (e) => Boolean(e?.rateLimited);
