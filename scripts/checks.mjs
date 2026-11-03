#!/usr/bin/env node
// Runs the automated checks enabled in factory.config.json inside a project checkout.
// Usage: node scripts/checks.mjs <projectDir> [--config <path>]
// The rules come from --config (the default branch's copy, so a PR cannot switch its own checks off).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './lib/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CHECKS = [
  { id: 'typecheck', label: 'Types', script: 'typecheck' },
  { id: 'lint', label: 'Lint', script: 'lint' },
  { id: 'test', label: 'Tests', script: 'test' },
  { id: 'build', label: 'Build', script: 'build' },
  { id: 'a11y', label: 'Accessibilité', script: 'test:a11y' },
  { id: 'audit', label: 'Failles des dépendances', command: ['npm', 'audit', '--omit=dev', '--audit-level=high'] },
];

// Which commands to run for the enabled checks; a check whose npm script is missing is reported as missing.
export function planChecks(enabled, pkg) {
  const scripts = pkg?.scripts || {};
  return CHECKS.filter((c) => enabled[c.id]).map((c) => {
    if (c.command) return { ...c, run: c.command };
    if (!scripts[c.script]) return { ...c, missing: true };
    return { ...c, run: ['npm', 'run', c.script] };
  });
}

export function summary(results) {
  const icon = { pass: '✅', fail: '❌', missing: '⚠️' };
  const rows = results.map((r) => `| ${r.label} | ${icon[r.status]} ${r.status === 'missing' ? `script npm « ${r.script} » absent` : ''} |`);
  return ['### Contrôles automatiques', '', '| Contrôle | Résultat |', '| --- | --- |', ...rows].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  const projectDir = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--config') || '.');
  const catalog = JSON.parse(readFileSync(join(ROOT, 'packs/catalog.json'), 'utf8'));
  const cfgPath = ci >= 0 ? args[ci + 1] : join(projectDir, 'factory.config.json');
  let raw = {};
  try { raw = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { console.log('::warning::Règles illisibles, valeurs par défaut utilisées.'); }
  const { config } = resolveConfig(raw, catalog);
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    console.log("::error::Pas de package.json : il n'y a pas encore d'application à contrôler.");
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const run = (cmd) => spawnSync(cmd[0], cmd.slice(1), { cwd: projectDir, stdio: 'inherit', env: { ...process.env, CI: 'true' } }).status;
  if (run(existsSync(join(projectDir, 'package-lock.json')) ? ['npm', 'ci'] : ['npm', 'install']) !== 0) {
    console.log("::error::L'installation des dépendances a échoué.");
    process.exit(1);
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (config.checks.a11y && (deps.playwright || deps['@playwright/test'])) run(['npx', 'playwright', 'install', '--with-deps', 'chromium']);
  const results = [];
  for (const c of planChecks(config.checks, pkg)) {
    if (c.missing) { results.push({ ...c, status: 'missing' }); console.log(`::error::Script npm « ${c.script} » absent.`); continue; }
    console.log(`::group::${c.label}`);
    const status = run(c.run) === 0 ? 'pass' : 'fail';
    console.log('::endgroup::');
    if (status === 'fail') console.log(`::error::${c.label} : échec`);
    results.push({ ...c, status });
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(results) + '\n');
  process.exit(results.every((r) => r.status === 'pass') ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
