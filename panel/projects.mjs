// Pure helpers for the project list and its status dots (issue #314, tested in test/panel-projects.test.mjs).
import { boardItems } from './lib.mjs?v=25';
import { laneFor } from './live.mjs?v=12';

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

// ---- The project list remembered on this device (issue #399) -------------------------------------------------
// Opening the panel used to read factory.config.json in every repository. Now the list shows at once from the last
// visit, and a repository is read again only when something was pushed to it since (`pushed_at` changed): adding,
// changing or removing its settings file is a push. A repository read again carries its last ETag, so an unchanged
// file is a 304 that GitHub does not count against the hourly limit.
const REPO_FIELDS = ['id', 'name', 'full_name', 'html_url', 'homepage', 'private', 'default_branch', 'archived', 'is_template', 'pushed_at'];
export const slimRepo = (r) => Object.fromEntries(REPO_FIELDS.filter((k) => k in r).map((k) => [k, r[k]]));
const slimFile = (f) => (f ? { content: f.content, sha: f.sha } : null);

// What to do for one repository: `skip` (nothing pushed since the last read: its known file, or none, still holds),
// otherwise a read carrying the known `etag`, whose 304 means the known `file`.
export function configCheck(repo, known) {
  const k = known.get(repo.full_name);
  if (!k) return { skip: false, etag: null, file: null };
  return { skip: Boolean(repo.pushed_at) && k.pushed === repo.pushed_at, etag: k.etag || null, file: k.file || null };
}

// `tag` ties the memory to the account (a digest of the token, never the token): another account never sees it.
export const writeProjectsCache = (tag, projects, known) => JSON.stringify({
  v: 1, tag,
  projects: projects.map((p) => ({ repo: slimRepo(p.repo), file: slimFile(p.file) })),
  known: [...known].map(([name, k]) => [name, { pushed: k.pushed, etag: k.etag || null, file: slimFile(k.file) }]),
});

export function readProjectsCache(text, tag) {
  try {
    const c = JSON.parse(text);
    if (c?.v !== 1 || !tag || c.tag !== tag || !Array.isArray(c.projects) || !Array.isArray(c.known)) return null;
    return { projects: c.projects.filter((p) => p?.repo?.full_name), known: new Map(c.known) };
  } catch { return null; }
}

// A short digest of the token, to tell accounts apart without keeping the token a second time.
export async function tokenTag(token) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token))));
  return [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
