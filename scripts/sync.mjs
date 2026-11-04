#!/usr/bin/env node
// Installs the factory into a project: enabled skills -> .claude/skills/<id>, agent instructions -> .factory/.
// Usage: node scripts/sync.mjs <projectDir>
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig, enabledSkills } from './lib/config.mjs';
import { hookCommand } from '../agent/scripts/run-root.mjs';

const FACTORY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGE_LABELS = {
  grilling: 'grilling', specReview: 'validation de chaque spec', plan: 'plan', tdd: 'TDD', review: 'revue de code', designPass: 'passe design (impeccable)',
  screenshots: 'captures avant/après', checks: 'contrôles automatiques', acceptance: 'recette',
};

// The journal records what the agent does; the gate refuses to let a PR move on while a step is missing.
const FACTORY_HOOKS = [
  ['UserPromptSubmit', null, 'journal.mjs'], ['PostToolUse', 'Skill|Bash', 'journal.mjs'], ['PostToolUseFailure', 'Bash', 'journal.mjs'],
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

export function render(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);

export function sync({ projectDir, factoryDir = FACTORY_DIR }) {
  const catalog = readJson(join(factoryDir, 'packs/catalog.json'));
  const raw = readJson(join(projectDir, 'factory.config.json'), {});
  const { config, warnings } = resolveConfig(raw, catalog);
  const skills = enabledSkills(config, catalog);

  const skillsDir = join(projectDir, '.claude/skills');
  const manifestPath = join(projectDir, '.factory/installed-skills.json');
  const previous = readJson(manifestPath, { skills: [] }).skills;
  const wanted = new Set(skills.map((s) => s.id));
  const removed = previous.filter((id) => !wanted.has(id));
  for (const id of removed) rmSync(join(skillsDir, id), { recursive: true, force: true });
  mkdirSync(skillsDir, { recursive: true });
  for (const s of skills) {
    rmSync(join(skillsDir, s.id), { recursive: true, force: true });
    cpSync(join(factoryDir, s.path), join(skillsDir, s.id), { recursive: true });
  }

  const vars = {
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
  for (const f of ['journal.mjs', 'fabrication.mjs', 'journal-check.mjs', 'gate.mjs', 'run-root.mjs']) cpSync(join(factoryDir, 'agent/scripts', f), join(outDir, 'scripts', f));
  const settingsPath = join(projectDir, '.claude/settings.json');
  writeFileSync(settingsPath, JSON.stringify(withJournalHook(readJson(settingsPath, {})), null, 2) + '\n');
  writeFileSync(manifestPath, JSON.stringify({ skills: skills.map((s) => s.id) }, null, 2) + '\n');
  writeFileSync(join(outDir, 'config.resolved.json'), JSON.stringify(config, null, 2) + '\n');
  return { installed: skills.map((s) => s.id), removed, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = sync({ projectDir: resolve(process.argv[2] || '.') });
  console.log(`installed: ${res.installed.length} skills; removed: ${res.removed.join(', ') || 'none'}`);
  for (const w of res.warnings) console.log(`::warning::${w}`);
}
