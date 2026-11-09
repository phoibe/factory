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
import { isManifest, stackVerdict, STACK_FILE } from './lib/stack.mjs';

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

// The project's own checks, set in the panel (« Contrôles supplémentaires »): run after the usual ones, by bash at the
// root of the project. The rules come from the default branch, so a PR can neither add nor change one.
export function planExtraChecks(config) {
  return (config.extraChecks || []).filter((x) => x.enabled).map((x) => ({ id: 'extra', label: x.label, run: ['bash', '-c', x.command] }));
}

export function summary(results) {
  const icon = { pass: '✅', fail: '❌', missing: '⚠️', skipped: '➖' };
  const note = { missing: (r) => `script npm « ${r.script} » absent`, skipped: () => 'pas encore de tests (ajoutés à la prochaine construction)' };
  const rows = results.map((r) => `| ${r.label} | ${icon[r.status]} ${r.note || note[r.status]?.(r) || ''} |`);
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

// The stack sheet check (issue #242): the PR's manifests and STACK.md against where it started (`baseRef`, its merge base, fetched
// by relay.yml). Without that branch at hand the check is skipped, never red.
export function stackFromGit(dir, baseRef) {
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const side = (ref) => {
    const list = git('ls-tree', '-r', '--name-only', ref);
    if (list.status !== 0) return null;
    const paths = list.stdout.split('\n').filter(Boolean);
    const show = (p) => { const r = git('show', `${ref}:${p}`); return r.status === 0 ? r.stdout : null; };
    const files = Object.fromEntries(paths.filter(isManifest).map((p) => [p, show(p)]));
    return { files, sheet: paths.includes(STACK_FILE) ? show(STACK_FILE) : null };
  };
  const base = baseRef ? side(baseRef) : null;
  const head = side('HEAD');
  if (!base || !head) return { status: 'skip', added: [], removed: [] };
  return stackVerdict({ base, head });
}

// One line for the owner when the sheet was forgotten (shown in the checks' log and summary).
export function stackMessage(v) {
  if (v.sheetLost) return `La fiche stack (${STACK_FILE}) a été supprimée : remettez-la.`;
  const names = (l) => l.map((x) => x.replace(/^\w+:/, '')).join(', ');
  const what = [v.added.length ? `ajoutées : ${names(v.added)}` : '', v.removed.length ? `retirées : ${names(v.removed)}` : ''].filter(Boolean).join(' ; ');
  return `Fiche stack pas mise à jour (bibliothèques ${what}) : mettez à jour ${STACK_FILE} dans la même PR.`;
}

// The factory repository: no package.json, but its own scripts and test suite.
export function isFactoryRepo(dir) {
  return ['scripts/relay.mjs', 'packs/catalog.json', 'test'].every((f) => existsSync(join(dir, f)));
}

function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  const bi = args.indexOf('--base');
  const projectDir = resolve(args.find((a, i) => !a.startsWith('--') && !['--config', '--base'].includes(args[i - 1])) || '.');
  // Always on, whatever the rules: the sheet must follow the libraries (issue #242).
  const stack = stackFromGit(projectDir, bi >= 0 ? args[bi + 1] : null);
  const stackResult = { label: 'Fiche stack', status: stack.status === 'fail' ? 'fail' : stack.status === 'skip' ? 'skipped' : 'pass', note: stack.status === 'skip' ? 'pas de fiche à comparer' : '' };
  if (stack.status === 'fail') console.log(`::error::${stackMessage(stack)}`);
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
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary([{ label: 'Tests', status: status === 0 ? 'pass' : 'fail' }, stackResult]) + '\n');
    process.exit(status === 0 && stackResult.status !== 'fail' ? 0 : 1);
  }
  if (!existsSync(pkgPath)) {
    console.log("::error::Pas de package.json : aucun script ne lance les contrôles de ce projet (typecheck, lint, test, build, test:a11y). Un projet sans npm les branche par un package.json sans dépendance qui lance ses propres outils (voir l'étape « fiche stack »).");
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
  const results = [stackResult];
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
  for (const c of planExtraChecks(config)) {
    console.log(`::group::${c.label} (contrôle supplémentaire)`);
    console.log(`$ ${c.run[2]}`);
    const status = run(c.run) === 0 ? 'pass' : 'fail';
    console.log('::endgroup::');
    if (status === 'fail') console.log(`::error::${c.label} : échec (contrôle supplémentaire du projet)`);
    results.push({ ...c, status });
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(results) + '\n');
  process.exit(results.every((r) => r.status === 'pass' || r.status === 'skipped') ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
