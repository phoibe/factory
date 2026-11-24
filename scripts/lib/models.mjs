// The models of the factory's agents (issue #544): one family per role, chosen once for every project in the
// « Réglages généraux » of the panel and saved in settings.json on the factory-runners branch. Pure, shared by the
// relay (which hands the result to each run) and the panel. See docs/adr/0012.

// The families offered, each with its version of the moment. Rewritten by the monthly update (scripts/models.mjs):
// keep the markers and one family per line.
// catalog:start
export const MODEL_FAMILIES = [
  { id: 'fable', name: 'Fable', version: '5.2' },
  { id: 'opus', name: 'Opus', version: '5.5' },
  { id: 'sonnet', name: 'Sonnet', version: '5.5' },
  { id: 'haiku', name: 'Haiku', version: '5.5' },
];
// catalog:end

// The four roles, in the order of the page. `effort` is fixed (not a setting); escalation goes simple → code → review.
export const MODEL_ROLES = [
  { id: 'plan', name: 'Plans et organisation', help: 'Écrit les plans et organise le développement.', effort: 'high', default: 'fable' },
  { id: 'code', name: 'Écriture du code', help: 'Écrit le code, fait les petites relectures de chaque tâche et la critique du design.', effort: 'medium', default: 'opus' },
  { id: 'review', name: 'Revue', help: 'Relecture finale du code avant chaque PR, revue de sécurité, synthèse d’une review générale.', effort: 'high', default: 'fable' },
  { id: 'simple', name: 'Tâches simples', help: 'Recherches, lectures et petites écritures mécaniques, captures.', effort: 'low', default: 'sonnet' },
];

export const familyLabel = (family) => `${family.name} (${family.version} aujourd’hui)`;

// The family of one role from the parsed settings.json (anything): the saved one when it is still offered, else the default.
export function roleModel(raw, roleId, families = MODEL_FAMILIES) {
  const role = MODEL_ROLES.find((r) => r.id === roleId);
  const saved = raw && typeof raw === 'object' && raw.models && typeof raw.models === 'object' ? raw.models[roleId] : null;
  return families.some((f) => f.id === saved) ? saved : role.default;
}

// { plan: { model, effort }, code, review, simple }: what each run receives in its payload (`models`).
export function resolveModels(raw, families = MODEL_FAMILIES) {
  return Object.fromEntries(MODEL_ROLES.map((r) => [r.id, { model: roleModel(raw, r.id, families), effort: r.effort }]));
}

// The monthly catalog update (scripts/models.mjs). Pure: text in, text out.
const versionParts = (v) => String(v).split('.').map(Number);
// > 0 when version a is newer than b ("6" > "5.5" > "5.2" > "4.8"; no minor reads as 0).
export function compareVersions(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

// The latest version of each family named in a text, from ids like claude-<family>-<major>[-<minor>][-YYYYMMDD].
// Legacy ids (claude-3-5-sonnet-20241022, claude-3-opus) have the digit first and are ignored, as are the products
// that share the prefix (claude-code-2, claude-instant-1...).
const NOT_FAMILIES = new Set(['code', 'instant', 'agent', 'sdk', 'api', 'app', 'desktop', 'ai', 'cli', 'docs']);
export function parseModelIds(text) {
  const latest = new Map();
  for (const m of String(text).matchAll(/(?<![A-Za-z0-9])claude-([a-z]+)-(\d+)(?:-(\d{1,2})(?!\d))?/g)) {
    const [, id, major, minor] = m;
    if (NOT_FAMILIES.has(id)) continue;
    const version = minor === undefined ? major : `${major}.${minor}`;
    if (!latest.has(id) || compareVersions(version, latest.get(id)) > 0) latest.set(id, version);
  }
  return [...latest].map(([id, version]) => ({ id, version }));
}

// The new text of this file: only the lines between the catalog markers change. A family is bumped when newer, a new
// one is appended (its name is the capitalised id); none is removed nor downgraded.
export function updateCatalog(source, found) {
  const start = source.indexOf('// catalog:start');
  const end = source.indexOf('// catalog:end');
  if (start < 0 || end < start) return source;
  const from = source.indexOf('\n', start) + 1;
  const lines = source.slice(from, end).split('\n');
  const line = /^(\s*\{ id: ')([^']+)(', name: '[^']*', version: ')([^']+)(' \},?)$/;
  const seen = new Set();
  const out = lines.map((l) => {
    const m = line.exec(l);
    if (!m) return l;
    seen.add(m[2]);
    const newer = found.find((f) => f.id === m[2] && compareVersions(f.version, m[4]) > 0);
    return newer ? `${m[1]}${m[2]}${m[3]}${newer.version}${m[5]}` : l;
  });
  const added = found.filter((f) => !seen.has(f.id)).map((f) => `  { id: '${f.id}', name: '${f.id[0].toUpperCase()}${f.id.slice(1)}', version: '${f.version}' },`);
  if (added.length) {
    const close = out.findIndex((l) => l.startsWith('];'));
    out.splice(close < 0 ? out.length : close, 0, ...added);
  }
  return source.slice(0, from) + out.join('\n') + source.slice(end);
}
