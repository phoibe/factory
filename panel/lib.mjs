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
export function previewFrom(comments) {
  for (const c of [...(comments || [])].reverse()) {
    const body = c.body || '';
    const m = c.user?.login === 'vercel[bot]'
      ? /\[(?:Visit )?Preview\]\((https:\/\/[^)\s]+)\)/.exec(body)
      : /tester la nouvelle version ici : (https:\/\/\S+)/.exec(body);
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
