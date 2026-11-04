// Pure helpers for the panel (tested in test/panel-lib.test.mjs).
export const COLUMNS = [
  { id: 'grilling', title: 'Questions en cours', label: 'factory:grilling', yours: true },
  { id: 'spec', title: 'Spec à valider', label: 'factory:spec-review', yours: true },
  { id: 'queued', title: "File d'attente", label: 'factory:queued' },
  { id: 'building', title: 'En construction', label: 'factory:building' },
  { id: 'visual', title: 'Captures à valider', label: 'factory:visual-review', yours: true },
  { id: 'checks', title: 'Contrôles', label: 'factory:checks' },
  { id: 'acceptance', title: 'Recette', label: 'factory:acceptance', yours: true },
  { id: 'blocked', title: 'Bloqué', label: 'factory:blocked', yours: true },
  { id: 'done', title: 'Terminé' }, // no label: a merged item has left the pipeline, see doneItems
];
const PRIORITY = ['blocked', 'acceptance', 'visual', 'checks', 'spec', 'grilling', 'queued', 'building'];

// The single board column for an issue or PR, from its labels. Null when it is not a factory item.
export function columnFor(labels) {
  const set = new Set(labels);
  if (set.has('factory:fixing')) return 'checks';
  for (const id of PRIORITY) if (set.has(COLUMNS.find((c) => c.id === id).label)) return id;
  return null;
}

// True when the item waits for the owner (and no agent is working on it right now).
export function waitsForOwner(labels) {
  if (labels.includes('factory:running')) return false;
  const col = columnFor(labels);
  return Boolean(col && COLUMNS.find((c) => c.id === col).yours);
}

// An issue whose PR is already open shows only once, on the PR's column.
export function boardItems(items) {
  const linked = new Set();
  for (const it of items) {
    if (!it.pull_request) continue;
    const m = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(it.body || '');
    if (m && columnFor(it.labels) && columnFor(it.labels) !== 'building') linked.add(Number(m[1]));
  }
  return items
    .map((it) => ({ ...it, column: columnFor(it.labels) }))
    .filter((it) => it.column && !(linked.has(it.number) && !it.labels.includes('factory:blocked')));
}

// How many finished items the « Terminé » column keeps.
export const DONE_LIMIT = 10;

// The « Terminé » column, from closed pull requests: only the merged ones that close a request
// (feature, bug or project; questions have no PR), most recently merged first, at most `limit`.
// Closed without a merge (abandoned) never counts. Each item opens the original request.
export function doneItems(pulls, limit = DONE_LIMIT) {
  return (pulls || [])
    .filter((p) => p.merged_at)
    .map((p) => {
      const m = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(p.body || '');
      return m ? { number: p.number, issue: Number(m[1]), title: p.title, mergedAt: p.merged_at, url: String(p.html_url || '').replace(/\/pull\/\d+$/, `/issues/${m[1]}`) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
    .slice(0, limit);
}

// « il y a 2 h », « hier » or « le 3 nov. » for the finish date of a done item.
export function doneAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  const ms = now - t;
  if (!(ms >= 0) || ms < 60_000) return "à l'instant";
  if (ms < 3_600_000) return `il y a ${Math.floor(ms / 60_000)} min`;
  const day = (x) => new Date(x).toDateString();
  if (day(t) === day(now)) return `il y a ${Math.floor(ms / 3_600_000)} h`;
  if (day(t) === day(now - 86_400_000)) return 'hier';
  return `le ${new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

export function toggleSkill(config, packId, skillId, on) {
  const next = structuredClone(config);
  next.skills[packId].skills[skillId] = on;
  return next;
}

export function setPath(config, path, value) {
  const next = structuredClone(config);
  const keys = path.split('.');
  let o = next;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
  return next;
}

// UTF-8 safe base64 for the GitHub Contents API.
export const toBase64 = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
export const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

// Token carried by a phone link (#jeton=…). The fragment never reaches a server.
export function tokenFromHash(hash) {
  const m = /^#jeton=([A-Za-z0-9_]+)$/.exec(hash || '');
  return m ? m[1] : null;
}

// Link that signs a phone in with the same token.
export const phoneLink = (pageUrl, token) => `${pageUrl.split('#')[0]}#jeton=${token}`;

// Preview link of a PR, from its comments (oldest first): the Vercel bot's latest "[Preview](…)"
// or "[Visit Preview](…)" link, else the factory's « Tu peux tester … ici : https://… » message.
// Only trusted authors count: on a public project anyone can comment, and a link planted that way must never
// show up as the project's preview. Trusted = the Vercel bot, the factory's own bot, or someone with write access.
const OWNER_ROLES = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
export const fromOwnerOrFactory = (c) => c?.user?.login === 'github-actions[bot]' || OWNER_ROLES.has(c?.author_association);

export function previewFrom(comments) {
  for (const c of [...(comments || [])].reverse()) {
    const body = c.body || '';
    let m = null;
    if (c.user?.login === 'vercel[bot]') m = /\[(?:Visit )?Preview\]\((https:\/\/[^)\s]+)\)/.exec(body);
    else if (fromOwnerOrFactory(c)) m = /tester la nouvelle version ici : (https:\/\/\S+)/.exec(body);
    if (m) return m[1];
  }
  return null;
}

// Link to the message a card should open on: the latest comment written by a person or by the
// factory's agent (bots such as Vercel or GitHub Actions are skipped). Null when there is none.
export function focusComment(comments) {
  const last = [...(comments || [])].reverse().find((c) => c.user?.type !== 'Bot' && !/\[bot\]$/.test(c.user?.login || ''));
  return last?.html_url || null;
}

// Plain list of the project's open issues (GitHub's default view, no filter).
export const issuesUrl = (repoUrl) => `${repoUrl.replace(/\/+$/, '')}/issues`;

// The repositories worth checking for a factory.config.json: not archived, and not a template (the factory's
// template holds one too, but it is the model new projects are copied from, not a project).
export const projectCandidates = (repos) => repos.filter((r) => !r.archived && !r.is_template);

// The link to the agent's latest Claude session, from the comment the factory keeps on the card.
export function sessionFrom(comments) {
  const note = (comments || []).find((c) => c.user?.login === 'github-actions[bot]' && (c.body || '').includes('<!-- factory-session -->'));
  return /\((https:\/\/claude\.ai\/[^)\s]+)\)/.exec(note?.body || '')?.[1] || null;
}

// The chat server's address comes from a file published with the panel, and the GitHub token is sent to it:
// only a Modal address (or a local one, for development) is accepted.
export const chatServerUrl = (url) => (/^(https:\/\/[a-z0-9-]+\.modal\.run|http:\/\/localhost:\d+)$/.test(String(url || '')) ? url : null);

// All pages of a GitHub list (100 per page), up to `max` pages. `get(page)` returns one page's array.
export async function allPages(get, max = 10) {
  const out = [];
  for (let page = 1; page <= max; page++) {
    const batch = await get(page);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

// Rules saved while someone else changed the file meanwhile: keep their changes and apply only what this
// session changed (compared with `base`, the version it loaded). On the same setting, this session wins.
export function mergeConfig(base, mine, theirs) {
  const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!plain(mine) || !plain(base) || !plain(theirs)) return JSON.stringify(mine) === JSON.stringify(base) ? theirs : mine;
  const out = { ...theirs };
  for (const k of new Set([...Object.keys(base), ...Object.keys(mine)])) {
    if (JSON.stringify(mine[k]) === JSON.stringify(base[k])) continue;
    if (!(k in mine)) delete out[k];
    else out[k] = mergeConfig(base[k], mine[k], theirs[k]);
  }
  return out;
}
