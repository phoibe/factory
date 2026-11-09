// Pure config resolution, shared by Node scripts and the browser panel.
export const RUNNERS = ['claude-cloud', 'github-actions'];
// The machine of the project's factory jobs (issue #271): `default` follows the general setting of the factory.
export const PROJECT_MACHINES = ['default', 'dev-server', 'github'];
// When a validated change goes live (issue #294): at once, or when the owner presses « Mise en production », or
// outside the factory (`external`: a merge deploys nothing, the owner does it his own way, as on Pulsar Wheel).
export const PRODUCTION_MODES = ['auto', 'approval', 'external'];

// The mode in force. A project that never chose one follows its stack sheet (STACK.md, « Mise en production »):
// « Manuelle » means external, anything else automatic. `delivery` is what panel/stack.mjs deliveryOf() read, or null.
export function effectiveProduction(config, delivery) {
  if (PRODUCTION_MODES.includes(config?.production)) return config.production;
  return delivery?.mode === 'manual' ? 'external' : 'auto';
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function boolMap(defaults, raw = {}) {
  const out = {};
  for (const k of Object.keys(defaults)) out[k] = typeof raw[k] === 'boolean' ? raw[k] : defaults[k];
  return out;
}

// Merges a project's factory.config.json over the defaults. Never throws on bad input: it warns and falls back.
export function resolveConfig(raw, catalog, DEFAULTS) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const warnings = [];
  const config = {
    version: 1,
    runner: DEFAULTS.runner,
    machine: 'default',
    maxParallel: DEFAULTS.maxParallel,
    autoPick: DEFAULTS.autoPick === true,
    maxQuestions: DEFAULTS.maxQuestions,
    stack: typeof input.stack === 'string' && input.stack.trim() ? input.stack : DEFAULTS.stack,
    stages: boolMap(DEFAULTS.stages, input.stages),
    review: { maxLoops: DEFAULTS.review.maxLoops },
    checks: boolMap(DEFAULTS.checks, input.checks),
    skills: {},
  };
  // Address of the live site, shown in the panel. Only https links are kept.
  if (input.siteUrl !== undefined && input.siteUrl !== '') {
    if (typeof input.siteUrl === 'string' && /^https:\/\/\S+$/.test(input.siteUrl)) config.siteUrl = input.siteUrl;
    else warnings.push(`siteUrl invalide (${JSON.stringify(input.siteUrl)}), ignoré`);
  }
  if (input.runner !== undefined) {
    if (RUNNERS.includes(input.runner)) config.runner = input.runner;
    else warnings.push(`runner "${input.runner}" inconnu, "${DEFAULTS.runner}" utilisé`);
  }
  if (input.machine !== undefined) {
    if (PROJECT_MACHINES.includes(input.machine)) config.machine = input.machine;
    else warnings.push(`machine "${input.machine}" inconnue, réglage général utilisé`);
  }
  if (input.production !== undefined) {
    if (PRODUCTION_MODES.includes(input.production)) config.production = input.production;
    else warnings.push(`production "${input.production}" inconnu, mise en production automatique`);
  }
  if (input.maxParallel !== undefined) {
    if (isPosInt(input.maxParallel)) config.maxParallel = input.maxParallel;
    else warnings.push(`maxParallel invalide (${JSON.stringify(input.maxParallel)}), ${DEFAULTS.maxParallel} utilisé`);
  }
  if (input.autoPick !== undefined) {
    if (typeof input.autoPick === 'boolean') config.autoPick = input.autoPick;
    else warnings.push(`autoPick invalide (${JSON.stringify(input.autoPick)}), désactivé`);
  }
  if (input.maxQuestions !== undefined) {
    if (isPosInt(input.maxQuestions) && input.maxQuestions <= 10) config.maxQuestions = input.maxQuestions;
    else warnings.push(`maxQuestions invalide (${JSON.stringify(input.maxQuestions)}), ${DEFAULTS.maxQuestions} utilisé`);
  }
  const loops = input.review?.maxLoops;
  if (loops !== undefined) {
    if (isPosInt(loops)) config.review.maxLoops = loops;
    else warnings.push(`review.maxLoops invalide (${JSON.stringify(loops)}), ${DEFAULTS.review.maxLoops} utilisé`);
  }
  const rawSkills = input.skills && typeof input.skills === 'object' ? input.skills : {};
  const packIds = new Set(catalog.packs.map((p) => p.id));
  for (const id of Object.keys(rawSkills)) if (!packIds.has(id)) warnings.push(`pack de skills inconnu : "${id}"`);
  for (const pack of catalog.packs) {
    const r = rawSkills[pack.id] || {};
    const known = new Set(pack.skills.map((s) => s.id));
    for (const id of Object.keys(r.skills || {})) if (!known.has(id)) warnings.push(`skill inconnu dans ${pack.id} : "${id}"`);
    const skills = {};
    for (const s of pack.skills) {
      const v = r.skills?.[s.id];
      skills[s.id] = typeof v === 'boolean' ? v : s.defaultEnabled;
    }
    config.skills[pack.id] = { enabled: typeof r.enabled === 'boolean' ? r.enabled : true, skills };
  }
  return { config, warnings };
}

export function enabledSkills(config, catalog) {
  return catalog.packs.flatMap((pack) => {
    const c = config.skills[pack.id];
    if (!c?.enabled) return [];
    return pack.skills.filter((s) => c.skills[s.id]).map((s) => ({ packId: pack.id, id: s.id, path: s.path }));
  });
}

// Reads the text of factory.config.json without ever throwing: a broken file falls back to the defaults
// (with a warning) so that one bad edit cannot stop every run of the factory.
export function parseRawConfig(text) {
  if (text == null) return { raw: {}, warning: null };
  try {
    const raw = JSON.parse(text);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { raw, warning: null };
  } catch { /* fall through */ }
  return { raw: {}, warning: 'factory.config.json est illisible : les réglages par défaut sont utilisés.' };
}
