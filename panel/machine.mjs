import { fromBase64 } from './lib.mjs?v=28';

// ---- The factory's runner files (settings.json, status.json on its factory-runners branch) ---------------------------
// `api(url, init)` is the panel's GitHub call. Never from the browser's cache: GitHub lets it keep `contents` 60 s and
// the PUT (no `?ref=`) does not invalidate this GET, so an old sha would fail the next save (review #556).
// `unreadable` is true when the answer is anything but the file or a 404, or when the file is not valid JSON (the
// general page must not overwrite it then).
export async function readRunnersFile(api, path) {
  try {
    const f = await api(`/repos/phoibe/factory/contents/${path}?ref=factory-runners`, { cache: 'no-store' });
    if (!f?.content) return { json: null, sha: null, unreadable: false };
    try { return { json: JSON.parse(fromBase64(f.content)), sha: f.sha, unreadable: false }; } catch { return { json: null, sha: f.sha, unreadable: true }; }
  } catch (e) {
    return { json: null, sha: null, unreadable: e?.status !== 404 };
  }
}

// True when two status files say the same, whatever the time of the check: the check rewrites `checkedAt` at least
// hourly, which alone must not rebuild « Paramètres » under the owner's fingers (review #556).
export function sameStatus(a, b) {
  const plain = (s) => JSON.stringify(s ? { ...s, checkedAt: undefined } : s);
  return plain(a) === plain(b);
}

// The « Machine des tâches » line of the settings (issue #271), from the dev server check's status file.
// `hash`: the project's key in that file (repoKey); `project`: its own setting, `default` follows `general`.
// `created`: the repository's creation date; `now`: for tests (issue #504).
export function machineLine({ status, hash, isPrivate, general, project, created = null, now = Date.now() }) {
  if (!isPrivate) return { text: 'Projet public : ses tâches tournent toujours sur les machines GitHub, gratuites pour lui.', tone: 'muted' };
  const wanted = wantedMachine(project, general);
  if (wanted === 'github') return { text: 'Ses tâches tournent sur les machines GitHub, comme demandé.', tone: 'muted' };
  if (!status) return { text: 'Serveur de dev : pas encore vérifié, machines GitHub en attendant.', tone: 'muted' };
  const entry = status.projects?.[hash];
  // A key that worked before may have left the project on the server: without it, the factory can no longer move it.
  if (status.key !== 'ok' && (status.key === 'refused' || entry?.machine === 'dev-server')) {
    return { text: "Serveur de dev : clé d'accès manquante (expirée ou refusée). Plus de secours automatique sur les machines GitHub : renouvelez la clé.", tone: 'warn' };
  }
  if (status.key !== 'ok') return { text: "Serveur de dev : clé d'accès manquante. Les tâches tournent sur les machines GitHub.", tone: 'warn' };
  if (!entry && missedBy(status, created, now)) return { text: `Ce projet ${NOT_SEEN}`, tone: 'warn', keys: true };
  if (entry?.error) return { text: "Serveur de dev : la bascule n'a pas pu se faire, nouvel essai au prochain contrôle (15 minutes au plus).", tone: 'warn' };
  const reason = entry?.reason;
  if (reason === 'online') return { text: 'Serveur de dev : en ligne.', tone: 'ok' };
  if (reason === 'offline') return { text: 'Serveur de dev : hors ligne, GitHub en secours.', tone: 'warn' };
  return { text: 'Serveur de dev : réglage pris en compte au prochain contrôle, dans 15 minutes au plus.', tone: 'muted' };
}

// A project's key in the status file, which lives on a public branch: a hash of the repository's id (never its name,
// which could be guessed and checked against the hash), so private projects never show.
export async function repoKey(fullName) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(fullName).toLowerCase()));
  return [...new Uint8Array(bytes)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- A private project the dev server's key does not see (issue #504) ------------------------------------------------
// The check only sees the projects ticked in the « factory runners » key: a forgotten one is simply absent from its
// status file, and its jobs keep running on GitHub's paid machines. Only the panel, which sees every project, can tell.
// GitHub cannot link to one token: the list of the owner's tokens, where they click « factory runners ».
export const RUNNER_KEYS_URL = 'https://github.com/settings/personal-access-tokens';
export const RUNNER_KEYS_HELP = 'Cliquez sur factory runners, cochez le projet, puis enregistrez.';
const NOT_SEEN = "n'est pas vu par le serveur de dev : ses tâches consomment vos minutes GitHub.";
// The status file is rewritten at least hourly: an older one means the check itself stopped, whose own alerts speak.
const FRESH_MS = 2 * 60 * 60_000;

// Like the check's decideMachine: an unknown value (a typo) follows the general setting.
const wantedMachine = (project, general) => (project === 'github' || project === 'dev-server' ? project : general);

// True when a recent check, made with a working key after the project was created, did not list it.
function missedBy(status, created, now) {
  if (!status || status.key !== 'ok' || !status.checkedAt || !created) return false;
  const at = Date.parse(status.checkedAt), born = Date.parse(created);
  return Number.isFinite(at) && Number.isFinite(born) && now - at < FRESH_MS && at > born;
}

// `projects`: [{ name, hash, isPrivate, created, project }] (`project`: its own machine setting, `default` follows
// `general`). Returns the names of the private projects meant for the dev server that the last check did not see.
export function forgottenProjects({ status, general, projects, now = Date.now() }) {
  return (projects || []).filter((p) => {
    if (!p.isPrivate) return false;
    return wantedMachine(p.project, general) !== 'github' && !status?.projects?.[p.hash] && missedBy(status, p.created, now);
  }).map((p) => p.name);
}

// One banner for every forgotten project.
export function runnerAlertText(names) {
  if (names.length === 1) return `${names[0]} ${NOT_SEEN}`;
  const list = `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
  return `${list} ne sont pas vus par le serveur de dev : leurs tâches consomment vos minutes GitHub.`;
}
