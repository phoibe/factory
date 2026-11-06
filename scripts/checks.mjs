#!/usr/bin/env node
// Runs the automated checks enabled in factory.config.json inside a project checkout.
// Usage: node scripts/checks.mjs <projectDir> [--config <path>]
// The rules come from --config (the default branch's copy, so a PR cannot switch its own checks off).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './lib/config.mjs';
import { isNetworkFailure } from './lib/outage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CHECKS = [
  { id: 'typecheck', label: 'Types', script: 'typecheck' },
  { id: 'lint', label: 'Lint', script: 'lint' },
  { id: 'test', label: 'Tests', script: 'test' },
  { id: 'build', label: 'Build', script: 'build' },
  { id: 'a11y', label: 'Accessibilité', script: 'test:a11y' },
  // The user journeys written from each spec's acceptance criteria. A project from before them has none yet: the
  // next build adds the script, so its absence is noted but never turns the checks red.
  { id: 'e2e', label: 'Parcours', script: 'test:e2e', optional: true },
  { id: 'audit', label: 'Failles des dépendances', command: ['npm', 'audit', '--omit=dev', '--audit-level=high'] },
];

// Which commands to run for the enabled checks; a check whose npm script is missing is reported as missing.
export function planChecks(enabled, pkg) {
  const scripts = pkg?.scripts || {};
  return CHECKS.filter((c) => enabled[c.id]).map((c) => {
    if (c.command) return { ...c, run: c.command };
    if (!scripts[c.script]) return { ...c, missing: true, ...(c.optional ? { skipped: true } : {}) };
    return { ...c, run: ['npm', 'run', c.script] };
  });
}

export function summary(results) {
  const icon = { pass: '✅', fail: '❌', missing: '⚠️', skipped: '➖' };
  const note = { missing: (r) => `script npm « ${r.script} » absent`, skipped: () => 'pas encore de tests (ajoutés à la prochaine construction)' };
  const rows = results.map((r) => `| ${r.label} | ${icon[r.status]} ${note[r.status]?.(r) || ''} |`);
  return ['### Contrôles automatiques', '', '| Contrôle | Résultat |', '| --- | --- |', ...rows].join('\n');
}

// How to get a browser for the accessibility check. `--with-deps` used to install ~20 MB of system fonts from a slow
// Ubuntu mirror on every run (3 to 4 minutes); the GitHub runner can usually start Chromium without them, so the
// system packages are installed only when a trial launch fails.
export function browserSetup(pkg) {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const lib = deps.playwright ? 'playwright' : deps['@playwright/test'] ? '@playwright/test' : null;
  if (!lib) return null;
  const launch = `import('${lib}').then((p) => p.chromium.launch()).then((b) => b.close()).catch((e) => { console.error(e.message); process.exit(1); })`;
  return {
    install: ['npx', 'playwright', 'install', 'chromium'],
    probe: ['node', '--input-type=module', '-e', launch],
    deps: ['npx', 'playwright', 'install-deps', 'chromium'],
  };
}

// Steps that only download things (dependencies, the browser, the advisories database): when they fail with a clear
// network or GitHub error, the code is not at fault and the relay retries instead of sending the agent (issue #213).
// The project's own checks never count as an outage, even when their output mentions the network.
const DOWNLOADS = ['install', 'browser', 'audit'];
export const isOutage = (step, status, output) => status !== 0 && DOWNLOADS.includes(step) && isNetworkFailure(output);

// The factory repository: no package.json, but its own scripts and test suite.
export function isFactoryRepo(dir) {
  return ['scripts/relay.mjs', 'packs/catalog.json', 'test'].every((f) => existsSync(join(dir, f)));
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
  if (!existsSync(pkgPath) && isFactoryRepo(projectDir)) {
    // The factory itself has no app: its own check is its Node test suite.
    console.log('::group::Tests');
    const status = spawnSync('node', ['--test'], { cwd: projectDir, stdio: 'inherit', env: { ...process.env, CI: 'true' } }).status;
    console.log('::endgroup::');
    if (status !== 0) console.log('::error::Tests : échec');
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary([{ label: 'Tests', status: status === 0 ? 'pass' : 'fail' }]) + '\n');
    process.exit(status === 0 ? 0 : 1);
  }
  if (!existsSync(pkgPath)) {
    console.log("::error::Pas de package.json : il n'y a pas encore d'application à contrôler.");
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const run = (cmd) => spawnSync(cmd[0], cmd.slice(1), { cwd: projectDir, stdio: 'inherit', env: { ...process.env, CI: 'true' } }).status;
  // A download step: its output is kept to tell an outage from a real error (then shown as usual).
  const fetchStep = (cmd) => {
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: projectDir, stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, CI: 'true' }, maxBuffer: 256 * 1024 * 1024 });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    return { status: r.status ?? 1, output: `${r.stdout || ''}\n${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}` };
  };
  const outage = (what) => {
    console.log(`::error::${what} : GitHub ou le réseau n'a pas répondu (panne passagère, pas un problème de code).`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'transient=true\n');
    process.exit(1);
  };
  const install = fetchStep(existsSync(join(projectDir, 'package-lock.json')) ? ['npm', 'ci'] : ['npm', 'install']);
  if (isOutage('install', install.status, install.output)) outage("L'installation des dépendances");
  if (install.status !== 0) {
    console.log("::error::L'installation des dépendances a échoué.");
    process.exit(1);
  }
  const browser = (config.checks.a11y || (config.checks.e2e && pkg.scripts?.['test:e2e'])) && browserSetup(pkg);
  if (browser) {
    const got = fetchStep(browser.install);
    if (isOutage('browser', got.status, got.output)) outage('Le téléchargement du navigateur');
    if (run(browser.probe) !== 0) {
      console.log('Chromium ne démarre pas sans paquets système : installation (plus lente).');
      run(browser.deps);
    }
  }
  const results = [];
  for (const c of planChecks(config.checks, pkg)) {
    if (c.skipped) { results.push({ ...c, status: 'skipped' }); console.log(`::notice::Script npm « ${c.script} » absent : pas encore de ${c.label.toLowerCase()} à rejouer.`); continue; }
    if (c.missing) { results.push({ ...c, status: 'missing' }); console.log(`::error::Script npm « ${c.script} » absent.`); continue; }
    console.log(`::group::${c.label}`);
    let status;
    if (c.id === 'audit') {
      const r = fetchStep(c.run);
      if (isOutage('audit', r.status, r.output)) { console.log('::endgroup::'); outage('La vérification des failles'); }
      status = r.status === 0 ? 'pass' : 'fail';
    } else status = run(c.run) === 0 ? 'pass' : 'fail';
    console.log('::endgroup::');
    if (status === 'fail') console.log(`::error::${c.label} : échec`);
    results.push({ ...c, status });
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(results) + '\n');
  process.exit(results.every((r) => r.status === 'pass' || r.status === 'skipped') ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
