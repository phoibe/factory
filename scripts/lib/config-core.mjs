// Pure config resolution, shared by Node scripts and the browser panel.
export const RUNNERS = ['claude-cloud', 'github-actions'];

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
    maxParallel: DEFAULTS.maxParallel,
    stack: typeof input.stack === 'string' && input.stack.trim() ? input.stack : DEFAULTS.stack,
    stages: boolMap(DEFAULTS.stages, input.stages),
    review: { maxLoops: DEFAULTS.review.maxLoops },
    checks: boolMap(DEFAULTS.checks, input.checks),
    skills: {},
  };
  if (input.runner !== undefined) {
    if (RUNNERS.includes(input.runner)) config.runner = input.runner;
    else warnings.push(`runner "${input.runner}" inconnu, "${DEFAULTS.runner}" utilisé`);
  }
  if (input.maxParallel !== undefined) {
    if (isPosInt(input.maxParallel)) config.maxParallel = input.maxParallel;
    else warnings.push(`maxParallel invalide (${JSON.stringify(input.maxParallel)}), ${DEFAULTS.maxParallel} utilisé`);
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
