// The « Consommation » page (issue #628): sums the runs' token use (usage/YYYY-MM.json of each project, written by
// agent/scripts/usage.mjs) per task type, model, effort and kind, and formats the figures. Pure: no DOM, prices injected
// (`cost(tokens, modelId) → dollars|null`).

// The type names repeat MODEL_ROLES (scripts/lib/models.mjs; a test keeps them equal), plus the agent that pilots.
const other = { id: 'other', name: 'autres' };
export const TASK_TYPES = [
  { id: 'plan', name: 'Plans et organisation', kinds: [
    { id: 'questions', name: 'questions et fiche' }, { id: 'plan', name: 'plan' }, { id: 'bug', name: 'analyse d’un bug' },
    { id: 'framing', name: 'cadrage d’un projet' }, other] },
  { id: 'code', name: 'Écriture du code', kinds: [
    { id: 'build', name: 'construction' }, { id: 'task-review', name: 'relectures de tâche' }, { id: 'design-critique', name: 'critique du design' },
    { id: 'review-fix', name: 'corrections après relecture' }, { id: 'owner-fix', name: 'corrections après vos retours (captures, recette)' },
    { id: 'checks-fix', name: 'corrections après les contrôles automatiques' }, other] },
  { id: 'review', name: 'Revue', kinds: [
    { id: 'final-review', name: 'relecture finale' }, { id: 'review-round', name: 'relectures 2 et 3' }, { id: 'scope-check', name: 'vérification de portée' },
    { id: 'security', name: 'revue de sécurité' }, { id: 'audit', name: 'review générale' }, other] },
  { id: 'audit', name: 'Relectures d’une review générale', kinds: [
    { id: 'parts', name: 'code partie par partie' }, { id: 'history', name: 'historique du projet' }, other] },
  { id: 'simple', name: 'Tâches simples', kinds: [{ id: 'research', name: 'recherches' }, { id: 'screenshots', name: 'captures' }, other] },
  { id: 'pilot', name: 'Agent qui pilote', kinds: [
    { id: 'questions', name: 'questions et fiche' }, { id: 'build', name: 'construction' }, { id: 'fixes', name: 'corrections' },
    { id: 'audit', name: 'review générale et amélioration UI' }, other] },
];

export const EFFORT_NAMES = { low: 'faible', medium: 'moyen', high: 'élevé' };

const HOUR = 3600e3;
const isFable = (model) => String(model).startsWith('claude-fable-');

// claude-fable-5-2[-YYYYMMDD] → { family: 'Fable', version: '5.2' }; anything else keeps its id as the family.
export function modelFamily(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(String(id));
  if (!m) return { family: String(id), version: '' };
  return { family: m[1][0].toUpperCase() + m[1].slice(1), version: m[3] === undefined ? m[2] : `${m[2]}.${m[3]}` };
}

// « Fable · élevé », « Opus 5.5 · moyen » when two Opus versions share the table, « Sonnet » with no effort.
export function engineLabel(row) {
  const engine = row.showVersion && row.version ? `${row.family} ${row.version}` : row.family;
  return EFFORT_NAMES[row.effort] ? `${engine} · ${EFFORT_NAMES[row.effort]}` : engine;
}

// The share of one hour bucket ('YYYY-MM-DDTHH', UTC) inside [from, to).
function overlap(hour, from, to) {
  const start = Date.parse(`${hour}:00:00Z`);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.min(start + HOUR, to.getTime()) - Math.max(start, from.getTime())) / HOUR;
}

// Each use line inside the period, prorated: { run, taskIndex, model, tokens: { input, cw5, cw1, cacheRead, output }, total }.
function* uses(runs, from, to) {
  for (const run of runs || []) {
    for (const line of Array.isArray(run?.use) ? run.use : []) {
      const [hour, taskIndex, model, ...counts] = line;
      const f = overlap(hour, from, to);
      if (!f) continue;
      const [input, cw5, cw1, cacheRead, output] = counts.map((n) => (Number(n) || 0) * f);
      const total = input + cw5 + cw1 + cacheRead + output;
      if (total > 0) yield { run, taskIndex, model, tokens: { input, cw5, cw1, cacheRead, output }, total };
    }
  }
}

// Dollars of the tokens and the tasks they belong to, kept null once any of them has no price.
const bucket = () => ({ tasks: new Set(), tokens: 0, dollars: 0, fableDollars: 0 });
function add(b, key, u, dollars) {
  b.tasks.add(key);
  b.tokens += u.total;
  b.dollars = b.dollars === null || dollars === null ? null : b.dollars + dollars;
  if (dollars !== null && isFable(u.model)) b.fableDollars += dollars;
}

const typeOrder = (id) => { const i = TASK_TYPES.findIndex((t) => t.id === id); return i < 0 ? TASK_TYPES.length : i; };

export function aggregate(runs, { from, to, size = 'all', cost }) {
  const kept = (runs || []).filter((r) => size === 'all' || r?.size === size);
  const rows = new Map();
  const total = bucket();
  const taskIds = new Map(); // a task is the pair (run, index)
  for (const u of uses(kept, from, to)) {
    const t = u.run.tasks?.[u.taskIndex];
    if (!t) continue;
    if (!taskIds.has(u.run)) taskIds.set(u.run, new Map());
    const perRun = taskIds.get(u.run);
    if (!perRun.has(u.taskIndex)) perRun.set(u.taskIndex, {});
    const id = perRun.get(u.taskIndex);
    const { family, version } = modelFamily(t.model);
    const effort = t.effort ?? null;
    const key = JSON.stringify([t.type, family, version, effort]);
    if (!rows.has(key)) rows.set(key, { type: t.type, family, version, effort, ...bucket(), kinds: new Map() });
    const row = rows.get(key);
    const type = TASK_TYPES.find((x) => x.id === t.type);
    const kind = type?.kinds.some((k) => k.id === t.kind) ? t.kind : 'other';
    if (!row.kinds.has(kind)) row.kinds.set(kind, bucket());
    const dollars = cost(u.tokens, u.model) ?? null;
    add(row, id, u, dollars);
    add(row.kinds.get(kind), id, u, dollars);
    add(total, id, u, dollars);
  }
  const versions = new Map();
  for (const r of rows.values()) versions.set(r.family, (versions.get(r.family) || new Set()).add(r.version));
  const out = [...rows.values()].map((r) => {
    const kinds = TASK_TYPES.find((x) => x.id === r.type)?.kinds || [other];
    return {
      type: r.type, family: r.family, version: r.version, showVersion: versions.get(r.family).size > 1, effort: r.effort,
      tasks: r.tasks.size, tokens: r.tokens, dollars: r.dollars, fableDollars: r.fableDollars,
      kinds: kinds.filter((k) => r.kinds.has(k.id)).map((k) => {
        const b = r.kinds.get(k.id);
        return { kind: k.id, name: k.name, tasks: b.tasks.size, tokens: b.tokens, dollars: b.dollars };
      }),
    };
  });
  const money = (x) => (x === null ? -Infinity : x);
  out.sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || money(b.dollars) - money(a.dollars) || b.tokens - a.tokens);
  return { rows: out, total: { tasks: total.tasks.size, tokens: total.tokens, dollars: total.dollars, fableDollars: total.fableDollars } };
}

// Dollars spent in [from, to) by every run (all sizes); tokens with no price are left out.
export function costBetween(runs, from, to, { cost, fableOnly = false }) {
  let sum = 0;
  for (const u of uses(runs, from, to)) {
    if (fableOnly && !isFable(u.model)) continue;
    sum += cost(u.tokens, u.model) ?? 0;
  }
  return sum;
}

// Figures with a French decimal comma and spaces between thousands.
const groups = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const decimals = (x, d) => x.toFixed(d).replace('.', ',');
const oneDecimal = (x) => decimals(x, 1).replace(/,0$/, '');

export function fmtDollars(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return 'tarif inconnu';
  return x >= 10 ? `${groups(x)} $` : `${decimals(x, 2)} $`;
}

export function fmtTokens(n) {
  if (n >= 9.95e6) return `${groups(n / 1e6)} M de tokens`;
  if (n >= 1e6) return `${oneDecimal(n / 1e6)} M de tokens`;
  const r = Math.round(n);
  return `${groups(r)} token${r > 1 ? 's' : ''}`;
}

// A share of a gauge, in percent: an estimate, so always « ≈ » (« 0 % » for a row that does not use it).
export function fmtShare(p) {
  if (!p) return '0 %';
  if (p < 0.05) return '< 0,1 %';
  return p < 9.95 ? `≈ ${oneDecimal(p)} %` : `≈ ${groups(p)} %`;
}

export function fmtAverage(dollars, tasks) {
  if (!(tasks >= 5)) return 'trop peu de mesures';
  return fmtDollars(dollars === null ? null : dollars / tasks);
}
