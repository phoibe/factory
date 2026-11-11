#!/usr/bin/env node
// Installs the factory into a project: enabled skills -> .claude/skills/<id>, agent instructions -> .factory/.
// Usage: node scripts/sync.mjs <projectDir>
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig, enabledSkills, parseRawConfig } from './lib/config.mjs';
import { workBranch } from './lib/config-core.mjs';
import { hookCommand } from '../agent/scripts/run-root.mjs';
import { syncFingerprint } from './lib/fingerprint.mjs';

const FACTORY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGE_LABELS = {
  grilling: 'grilling', specReview: 'validation de chaque spec', plan: 'plan', tdd: 'TDD', review: 'revue de code', designPass: 'passe design (impeccable)',
  screenshots: 'captures avant/après', checks: 'contrôles automatiques', acceptance: 'recette',
};

// The journal records what the agent does; the gate refuses to let a PR move on while a step is missing.
const FACTORY_HOOKS = [
  ['UserPromptSubmit', null, 'journal.mjs'], ['PostToolUse', 'Skill|Bash|Agent|Task', 'journal.mjs'], ['PostToolUseFailure', 'Bash', 'journal.mjs'],
  ['PreToolUse', 'Bash|mcp__github__.*', 'gate.mjs'], ['Stop', null, 'gate.mjs'],
];
const isFactoryHook = (g) => (g.hooks || []).some((h) => /\.factory\/scripts\/(journal|gate)\.mjs/.test(String(h.command || '')));

// Adds the factory hooks to the project's Claude Code settings, keeping everything else in the file.
export function withJournalHook(settings = {}) {
  const hooks = {};
  for (const [event, groups] of Object.entries(settings.hooks || {})) hooks[event] = groups.filter((g) => !isFactoryHook(g));
  for (const [event, matcher, script] of FACTORY_HOOKS) {
    hooks[event] = [...(hooks[event] || []), { ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: hookCommand(script) }] }];
  }
  return { ...settings, hooks };
}

// One-off changes to a project's own config. `docs-grilling`: grill-with-docs (and the domain-modeling skill it
// needs) become the default; a project that had them off gets them on once, and a later opt-out is respected.
const MIGRATIONS = [
  { id: 'docs-grilling', apply(raw) {
    const pack = raw.skills?.['matt-pocock'];
    if (!pack || pack.enabled === false) return false;
    let changed = false;
    for (const id of ['grill-with-docs', 'domain-modeling']) {
      if (pack.skills && pack.skills[id] === false) { pack.skills[id] = true; changed = true; }
    }
    return changed;
  } },
];

export function render(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const readJson = (p, fallback) => {
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) {
    console.warn(`sync: ${p} est illisible (${e.message}) : valeur par défaut utilisée`);
    return fallback;
  }
};
const safeId = (id) => typeof id === 'string' && /^[\w.-]+$/.test(id) && !/^\.+$/.test(id) && !id.includes('..');

export function sync({ projectDir, factoryDir = FACTORY_DIR }) {
  const catalog = readJson(join(factoryDir, 'packs/catalog.json'));
  const configPath = join(projectDir, 'factory.config.json');
  const parsed = parseRawConfig(existsSync(configPath) ? readFileSync(configPath, 'utf8') : null);
  // Only a config file the project already has is migrated; the marker lives beside the installed skills.
  const donePath = join(projectDir, '.factory/migrations.json');
  const done = readJson(donePath, { done: [] }).done;
  let migrated = false;
  const evaluated = !parsed.warning && existsSync(configPath);
  if (evaluated) {
    for (const m of MIGRATIONS.filter((x) => !done.includes(x.id))) { if (m.apply(parsed.raw)) migrated = true; }
    if (migrated) writeFileSync(configPath, JSON.stringify(parsed.raw, null, 2) + '\n');
  }
  const { config, warnings } = resolveConfig(parsed.raw, catalog);
  if (parsed.warning) warnings.push(parsed.warning);
  const skills = enabledSkills(config, catalog);

  const skillsDir = join(projectDir, '.claude/skills');
  const manifestPath = join(projectDir, '.factory/installed-skills.json');
  const manifest = readJson(manifestPath, { skills: [] });
  const previous = (Array.isArray(manifest?.skills) ? manifest.skills : []).filter((id) => {
    if (safeId(id)) return true;
    console.warn(`sync: identifiant de skill ignoré dans ${manifestPath} : ${JSON.stringify(id)}`);
    return false;
  });
  const wanted = new Set(skills.map((s) => s.id));
  const removed = previous.filter((id) => !wanted.has(id));
  for (const id of removed) rmSync(join(skillsDir, id), { recursive: true, force: true });
  mkdirSync(skillsDir, { recursive: true });
  for (const s of skills) {
    rmSync(join(skillsDir, s.id), { recursive: true, force: true });
    cpSync(join(factoryDir, s.path), join(skillsDir, s.id), { recursive: true });
  }

  const vars = {
    // The branch the agent starts from and opens its PRs against: preprod on « Sur mon accord », main otherwise.
    base: workBranch(config.production, 'main'),
    stack: config.stack,
    maxLoops: config.review.maxLoops,
    stages: Object.entries(config.stages).map(([k, on]) => `${STAGE_LABELS[k]} ${on ? '✅' : '❌'}`).join(', '),
    skills: skills.map((s) => `\`${s.id}\``).join(', ') || '(aucun)',
  };
  const outDir = join(projectDir, '.factory');
  rmSync(join(outDir, 'stages'), { recursive: true, force: true });
  mkdirSync(join(outDir, 'stages'), { recursive: true });
  mkdirSync(join(outDir, 'scripts'), { recursive: true });
  writeFileSync(join(outDir, 'AGENT.md'), render(readFileSync(join(factoryDir, 'agent/AGENT.md'), 'utf8'), vars));
  for (const f of readdirSync(join(factoryDir, 'agent/stages'))) {
    writeFileSync(join(outDir, 'stages', f), render(readFileSync(join(factoryDir, 'agent/stages', f), 'utf8'), vars));
  }
  cpSync(join(factoryDir, 'agent/scripts/shots.mjs'), join(outDir, 'scripts/shots.mjs'));
  for (const f of ['journal.mjs', 'fabrication.mjs', 'journal-check.mjs', 'gate.mjs', 'run-root.mjs', 'transcript.mjs']) cpSync(join(factoryDir, 'agent/scripts', f), join(outDir, 'scripts', f));
  const settingsPath = join(projectDir, '.claude/settings.json');
  writeFileSync(settingsPath, JSON.stringify(withJournalHook(readJson(settingsPath, {})), null, 2) + '\n');
  writeFileSync(donePath, JSON.stringify({ done: evaluated || done.length ? [...new Set([...done, ...MIGRATIONS.map((m) => m.id)])] : done }, null, 2) + '\n');
  writeFileSync(manifestPath, JSON.stringify({ skills: skills.map((s) => s.id) }, null, 2) + '\n');
  writeFileSync(join(outDir, 'config.resolved.json'), JSON.stringify(config, null, 2) + '\n');
  writeFileSync(join(outDir, 'synced.json'), JSON.stringify({ fingerprint: syncFingerprint(factoryDir) }, null, 2) + '\n');
  return { installed: skills.map((s) => s.id), removed, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = sync({ projectDir: resolve(process.argv[2] || '.') });
  console.log(`installed: ${res.installed.length} skills; removed: ${res.removed.join(', ') || 'none'}`);
  for (const w of res.warnings) console.log(`::warning::${w}`);
}
