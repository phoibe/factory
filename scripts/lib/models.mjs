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
