// Which machine runs a project's factory jobs: the owner's dev server (self-hosted runners) or GitHub's machines.
// Pure helpers shared by the 15-minute check (scripts/runners.mjs) and the panel. See docs/adr/0001.
export const MACHINES = ['dev-server', 'github'];
export const DEFAULT_LABELS = ['self-hosted'];
// The variable each workflow's `runs-on` reads in the project (relay.yml, sync.yml). Absent = GitHub's machines.
export const RUNS_ON_VAR = 'FACTORY_RUNS_ON';
// Where the factory keeps the general setting and the last check (a branch of the factory, never main).
export const STATUS_BRANCH = 'factory-runners';
export const EXPIRY_WARN_MS = 7 * 24 * 3600_000;
export const EXPIRY_ALERT = "La clé d'accès des runners expire le";

const lower = (s) => String(s).toLowerCase();

// The general setting (settings.json on the status branch). Anything unreadable falls back to the defaults.
export function readSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const labels = Array.isArray(r.labels) && r.labels.length && r.labels.every((l) => typeof l === 'string' && l.trim()) ? r.labels : DEFAULT_LABELS;
  return { machine: MACHINES.includes(r.machine) ? r.machine : 'dev-server', labels };
}

// Runners connected to GitHub that carry every wanted label. A busy runner is online: its jobs wait their turn.
export function onlineRunners(runners, labels) {
  const want = labels.map(lower);
  return (runners || []).filter((r) => r.status === 'online' && want.every((w) => (r.labels || []).some((l) => lower(l.name ?? l) === w))).length;
}

// `project`: the project's own setting (`default` follows `general`). `key`: ok, missing or refused.
export function decideMachine({ isPrivate, project, general, key, online }) {
  if (!isPrivate) return { machine: 'github', reason: 'public' };
  const wanted = MACHINES.includes(project) ? project : general;
  if (wanted !== 'dev-server') return { machine: 'github', reason: 'setting' };
  if (key !== 'ok') return { machine: 'github', reason: 'no-key' };
  return online > 0 ? { machine: 'dev-server', reason: 'online' } : { machine: 'github', reason: 'offline' };
}

export const runsOnValue = (labels) => JSON.stringify(labels);

// Jobs of a run still waiting for (or held by) a self-hosted runner: cancelled and re-run on GitHub after a switch.
// `labels`: those the project's jobs asked for (its FACTORY_RUNS_ON); a job asking for all of them, or for any
// self-hosted runner, is one of the server's.
export function stuckJobs(jobs, labels = DEFAULT_LABELS) {
  const want = labels.map(lower);
  return (jobs || []).filter((j) => {
    if (!['queued', 'in_progress', 'waiting', 'pending'].includes(j.status)) return false;
    const has = (j.labels || []).map(lower);
    return has.includes('self-hosted') || want.every((w) => has.includes(w));
  });
}

// The phone alerts between two checks: a project losing or getting back its server, a key lost or about to expire.
export function alertsFor(prev, next, now = Date.now()) {
  const out = [];
  if (prev && prev.key === 'ok' && next.key !== 'ok') {
    out.push("La clé d'accès des runners ne marche plus : vos projets privés ne basculent plus tout seuls sur les machines GitHub si le serveur s'éteint. Créez-en une nouvelle (voir le guide du serveur de dev).");
  }
  if (next.key === 'ok' && next.keyExpires && !(prev?.expiryAlerted && prev.keyExpires === next.keyExpires) && Date.parse(next.keyExpires) - now < EXPIRY_WARN_MS) {
    out.push(`${EXPIRY_ALERT} ${new Date(next.keyExpires).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} : renouvelez-la avant, sinon vos projets privés repasseront sur les machines GitHub.`);
  }
  if (!prev) return out;
  for (const [k, p] of Object.entries(next.projects || {})) {
    const before = prev.projects?.[k]?.reason;
    if (before === 'online' && p.reason === 'offline') out.push(`Serveur de dev hors ligne pour ${p.name} : ses tâches passent sur les machines GitHub en secours.`);
    if (before === 'offline' && p.reason === 'online') out.push(`Serveur de dev de nouveau en ligne pour ${p.name} : ses tâches y retournent.`);
  }
  return out;
}

// A project's key in the status file (on a public branch): a hash, shared with the panel.
export { repoKey } from '../../panel/machine.mjs';
