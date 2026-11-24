// The panel's GitHub readers (issue #560). Separate from common.mjs: trust.mjs and ratelimit.mjs only sit next to the
// panel once deployed, so Node could not load a common part importing them.
import { app, onReset, sessionExpired } from './common.mjs?v=1';
import { trustRead } from './trust.mjs?v=1';
import { rateLimitDelay, MAX_PAUSE_MS } from './ratelimit.mjs';
import { httpError, emptyOn404 } from './errors.mjs';

export const API = 'https://api.github.com';

// Issue #557: on a public project, an outsider's issue or PR loses its factory notes before anything reads it. A
// project the panel does not know counts as public.
export const guardRead = (path, data) => trustRead(path, data, (full) => app.projects.find((p) => p.repo.full_name === full)?.repo.private === true);

export async function api(path, init = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: { authorization: `Bearer ${app.token}`, accept: 'application/vnd.github+json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (res.status === 404 && emptyOn404(init)) return null; // a refused write fails: never shown as done (issue #398)
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw httpError(res.status, (await res.json().catch(() => ({}))).message, init.method);
  return res.status === 204 ? null : guardRead(path, await res.json());
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// One ETag map for the dots and the board (issue #327): a first open reuses what the dots already read.
export const etags = new Map();

onReset(() => {
  etags.clear();
});

// « Too many requests »: a short wait is spent here, then the same request goes again; a long one stops this
// refresh quietly (no « connexion perdue »), and the next one comes after the wait GitHub asked for.
export async function cachedGet(path, cache = etags) {
  const hit = cache.get(path);
  let res;
  for (let pauses = 0; ; pauses++) {
    res = await fetch(API + path, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${app.token}`, accept: 'application/vnd.github+json', ...(hit ? { 'if-none-match': hit.etag } : {}) },
    });
    const wait = rateLimitDelay(res.status, res.headers);
    if (wait === null) break;
    if (wait > MAX_PAUSE_MS || pauses >= 1) throw Object.assign(new Error('rate limited'), { rateLimited: true, waitMs: wait });
    await new Promise((ok) => setTimeout(ok, wait));
  }
  if (res.status === 304 && hit) return { data: hit.data, changed: false };
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw httpError(res.status, (await res.json().catch(() => ({}))).message);
  const data = guardRead(path, await res.json());
  const etag = res.headers.get('etag');
  if (etag) cache.set(path, { etag, data });
  return { data, changed: true };
}
