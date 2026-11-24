import { toggleSkill, setPath, toBase64, fromBase64, mergeConfig } from './lib.mjs';
import { resolveConfig, parseRawConfig, effectiveProduction, MAX_EXTRA_CHECKS } from './config-core.mjs';
import { errorText, saidError } from './errors.mjs';
import { machineLine, repoKey, forgottenProjects, runnerAlertText, RUNNER_KEYS_URL, RUNNER_KEYS_HELP, readRunnersFile } from './machine.mjs';
import { TRIGGER_FILE, upgradeTrigger, knownTrigger, wakeErrorText, TRIGGER_REFUSED } from './trigger.mjs';
import { advancedSummary, effectiveMachine, ADVANCED_KEY } from './settings.mjs';
import { FACTORY_REPO, MACHINE_CHOICES, $, store, app, el, toast, machineRadios, onReset, onUnsaved, selectTab, boardFirst, provide, call } from './common.mjs';
import { api } from './github.mjs';

provide('renderRules', renderRules);
provide('machineSettings', () => machine.settings);
provide('generalWritten', ({ settings, sha, general }) => Object.assign(machine, { settings, sha, general }));
provide('wakeFactory', wakeFactory);
provide('refreshRunnerAlert', refreshRunnerAlert);
provide('forgotten', () => forgotten);

const STAGES = [
  ['grilling', 'Questions préalables'],
  ['specReview', 'Valider chaque spec par « go »'],
  ['plan', 'Plan de construction'],
  ['tdd', 'Tests avant le code'],
  ['review', 'Revue de code par un second agent'],
  ['designPass', 'Revue de l\'apparence'],
  ['screenshots', 'Captures avant/après à valider'],
  ['checks', 'Contrôles avant fusion'],
  ['acceptance', 'Recette avant la mise en ligne'],
];
const CHECKS = [
  ['typecheck', 'Types'], ['lint', 'Style du code'], ['test', 'Tests'], ['build', 'Construction'], ['a11y', 'Accessibilité de base'], ['e2e', 'Parcours rejoués à chaque livraison'], ['audit', 'Failles connues des dépendances'],
];

// Private projects the dev server's check did not see, and the timer of their banner (issue #504).
let forgotten = new Set(), runnerTimer = null, runnerRound = 0;

// The projects whose trigger the panel checked this session, and those known up to date (issue #427, see updateTrigger).
const triggers = { done: new Set(), fresh: new Set() };

function checkbox(id, checked, onchange) {
  return el('input', { type: 'checkbox', id, checked, onchange: (e) => onchange(e.target.checked) });
}

// ---- Machine of the factory jobs (issue #271) -------------------------------------------------------------------------
// `held`: a status read while the focus was in « Paramètres », shown when it leaves; `shown`: the line on screen.
const machine = { settings: null, sha: null, general: 'dev-server', status: null, hash: null, repo: null, held: null, shown: null };

// One read of the runner files, past the browser cache (review #556): see machine.mjs.
const runnersFile = (path) => readRunnersFile(api, path);
// Both files for the settings line and the banner: a read already on its way is shared, never sent twice.
let runnersReading = null;
function runnersFiles() {
  if (runnersReading?.session === app.token) return runnersReading.files;
  const read = { session: app.token, files: Promise.all([runnersFile('settings.json'), runnersFile('status.json')]) };
  runnersReading = read;
  read.files.finally(() => { if (runnersReading === read) runnersReading = null; });
  return read.files;
}

export async function loadMachine(project) {
  // Never the previous project's state while this one loads (or if it cannot be read), nor a status held for it.
  Object.assign(machine, { status: null, hash: null, repo: project.repo.full_name, held: null });
  await boardFirst(); // the board's cards first (review #556)
  if (app.current !== project) return;
  const [[settings, status], hash] = await Promise.all([runnersFiles(), repoKey(String(project.repo.id))]);
  if (app.current !== project) return;
  const general = settings.json?.machine === 'github' ? 'github' : 'dev-server';
  Object.assign(machine, { settings: settings.json, sha: settings.sha, general, status: status.json, hash, repo: project.repo.full_name, held: null });
  renderRules();
}

// The « Machine des tâches » line for this project, with the dev server's state for it.
const currentMachineLine = () => machineLine({ status: machine.status, hash: machine.hash, isPrivate: app.current.repo.private, general: machine.general, project: app.current.config.machine || 'default', created: app.current.repo.created_at || null });

// A fresh status file: « Paramètres » is rebuilt when the line it shows changes (the time of the check counts, the
// line depends on it), never when only the file does (review #556).
function showMachineStatus(status) {
  machine.held = null;
  machine.status = status;
  if (JSON.stringify(currentMachineLine()) !== machine.shown) renderRules();
}

// The button to the owner's GitHub tokens, with the one sentence that says what to do there (issue #504).
// Message, then the step, then the button (design pass): the same orange box in the banner and in the settings.
const runnerAlertBox = (text, attrs = {}) => el('div', { class: 'runner-alert', ...attrs },
  el('p', { class: 'runner-alert-text' }, text),
  el('p', { class: 'runner-alert-help muted small' }, RUNNER_KEYS_HELP),
  el('a', { class: 'button secondary', href: RUNNER_KEYS_URL, target: '_blank', rel: 'noopener' }, 'Ajouter à la clé factory runners', el('span', { 'aria-hidden': 'true' }, ' ↗')));

// ---- Private projects the dev server does not see (issue #504) --------------------------------------------------------
// Read for every project at once: a banner above whichever project is open, and an orange mark in the project list.
export async function refreshRunnerAlert() {
  clearTimeout(runnerTimer);
  runnerTimer = setTimeout(() => refreshRunnerAlert().catch(() => {}), 15 * 60_000);
  if (!app.token || !app.projects.length) return;
  const session = app.token, round = ++runnerRound;
  await boardFirst(); // the board's cards first (review #556)
  if (app.token !== session || round !== runnerRound) return;
  const [settings, status] = await runnersFiles();
  const list = await Promise.all(app.projects.map(async (p) => {
    let own = 'default';
    try { own = JSON.parse(fromBase64(p.file?.content || '')).machine || 'default'; } catch { /* unreadable rules: the general setting */ }
    return { name: p.repo.name, hash: await repoKey(String(p.repo.id)), isPrivate: Boolean(p.repo.private), created: p.repo.created_at || null, project: own };
  }));
  if (app.token !== session || round !== runnerRound) return; // a newer round answers instead
  const names = forgottenProjects({ status: status.json, general: settings.json?.machine === 'github' ? 'github' : 'dev-server', projects: list });
  // The settings line follows the same fresh status (it was read when the project opened).
  if (app.current && status.json && machine.repo === app.current.repo.full_name && machine.hash) {
    // Never under the owner's fingers: a field being typed in keeps its text and the focus (review #556). The new
    // status waits until the focus leaves the form (focusout below), then shows at once.
    if ($('rules').contains(document.activeElement)) machine.held = status.json;
    else showMachineStatus(status.json);
  }
  // Rebuilt only when the names change: a screen reader does not hear it again, a focused link keeps the focus.
  if (names.join('\n') === [...forgotten].join('\n')) return;
  forgotten = new Set(names);
  const box = $('runner-alert');
  box.hidden = !names.length;
  box.replaceChildren(...(names.length ? [runnerAlertBox(runnerAlertText(names))] : []));
  call('renderProjectList');
}

// This project's machine. A warning is shown above « Avancé » instead (issue #342), never twice.
function machineFieldset(update, line) {
  const c = app.current.config;
  const general = machine.general;
  const generalName = MACHINE_CHOICES.find(([v]) => v === general)[1].toLowerCase();
  return el('fieldset', { class: 'machine' }, el('legend', {}, 'Machine des tâches'),
    ...(line.tone === 'warn' ? [] : [el('p', { class: `machine-status ${line.tone}`, role: 'status' }, line.text)]),
    el('div', { role: 'radiogroup', 'aria-label': 'Machine des tâches de ce projet' },
      ...machineRadios('machine-project', [['default', `Comme le réglage de tous les projets (${generalName})`], ...MACHINE_CHOICES], c.machine || 'default', (v) => update(setPath(c, 'machine', v)))));
}

// A part of the settings: this project only, or every project.
function rulesSection(id, title, children) {
  return el('section', { class: 'rules-section', 'aria-labelledby': id },
    el('h2', { id, class: 'rules-section-title' }, title),
    ...children);
}

export function renderRules() {
  const c = app.current.config;
  // Rebuilt anyway: a dev server status held back while the owner typed shows now.
  if (machine.held && machine.hash && machine.repo === app.current.repo.full_name) { machine.status = machine.held; machine.held = null; }
  const update = (next) => { app.current.config = next; renderRules(); };
  const form = $('rules');
  const site = el('fieldset', {}, el('legend', {}, 'Site en ligne'),
    el('label', { for: 'site-url' }, 'Adresse du site'),
    el('input', { type: 'url', id: 'site-url', placeholder: 'https://…', value: c.siteUrl || '', inputmode: 'url',
      onchange: (e) => {
        const v = e.target.value.trim();
        if (v && !/^https:\/\/\S+$/.test(v)) { toast('L\'adresse doit commencer par https://'); return; }
        const next = structuredClone(c);
        if (v) next.siteUrl = v; else delete next.siteUrl;
        update(next);
      } }));
  // Never chosen: the stack sheet decides, and says so in one short line.
  const mode = effectiveProduction(c, app.current.delivery);
  const bySheet = !c.production && app.current.delivery?.mode === 'manual' ? [el('p', { id: 'production-sheet', class: 'muted small' }, 'Proposé par la fiche stack.')] : [];
  const production = el('fieldset', {}, el('legend', {}, 'Mise en production'),
    ...[['auto', 'Automatique, dès qu\'une modification est validée'],
      ['approval', 'Sur mon accord, avec le bouton « Mise en production »'],
      ['external', 'Externe, faite hors de la factory']]
      .map(([v, t]) => el('div', { class: 'row' },
        el('input', { type: 'radio', name: 'production', id: `production-${v}`, checked: mode === v, onchange: () => update(setPath(c, 'production', v)) }),
        el('label', { for: `production-${v}` }, t))),
    ...bySheet);
  const engine = el('fieldset', {}, el('legend', {}, 'Moteur des agents'),
    ...[['claude-cloud', 'Cloud Claude (abonnement)'],
      ['github-actions', 'GitHub Actions (vos minutes GitHub)']]
      .map(([v, t]) => el('div', { class: 'row' },
        el('input', { type: 'radio', name: 'runner', id: `runner-${v}`, checked: c.runner === v, onchange: () => update(setPath(c, 'runner', v)) }),
        el('label', { for: `runner-${v}` }, t))));
  const parallel = el('fieldset', {}, el('legend', {}, 'Demandes en parallèle'),
    el('div', { class: 'row' },
      el('div', {}, el('label', { for: 'maxParallel' }, 'Fonctionnalités construites en même temps'),
        el('input', { type: 'number', id: 'maxParallel', min: '1', max: '10', value: String(c.maxParallel),
          onchange: (e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1) update(setPath(c, 'maxParallel', v)); } }))),
    el('div', { class: 'row' }, checkbox('autoPick', c.autoPick === true, (on) => update(setPath(c, 'autoPick', on))),
      el('div', {}, el('label', { for: 'autoPick' }, 'Prendre une demande ouverte quand une place se libère'),
        // Only acts on picked features: nested under the switch, and off while picking is off.
        el('div', { class: 'sub-setting', 'aria-disabled': c.autoPick === true ? 'false' : 'true' },
          el('label', { for: 'maxQuestions' }, 'En attente de vos réponses, au plus'),
          el('input', { type: 'number', id: 'maxQuestions', min: '1', max: '10', inputmode: 'numeric', disabled: c.autoPick !== true, value: String(c.maxQuestions ?? 2),
            onchange: (e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 1 && v <= 10) return update(setPath(c, 'maxQuestions', v));
              e.target.value = String(c.maxQuestions ?? 2);
              toast('Entre 1 et 10.');
            } })))));
  const stages = el('fieldset', {}, el('legend', {}, 'Étapes'),
    STAGES.map(([k, t]) => el('div', { class: 'row' }, checkbox(`stage-${k}`, c.stages[k], (on) => update(setPath(c, `stages.${k}`, on))),
      el('label', { for: `stage-${k}` }, t))));
  const checks = el('fieldset', {}, el('legend', {}, 'Contrôles automatiques'),
    CHECKS.map(([k, t]) => el('div', { class: 'row' }, checkbox(`check-${k}`, c.checks[k], (on) => update(setPath(c, `checks.${k}`, on))),
      el('label', { for: `check-${k}` }, t))),
    el('div', { class: 'row' },
      el('div', {}, el('label', { for: 'checksMinutes' }, 'Durée maximale des contrôles (minutes)'),
        el('input', { type: 'number', id: 'checksMinutes', min: '5', max: '180', inputmode: 'numeric', value: String(c.checksMinutes ?? 30),
          onchange: (e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 5 && v <= 180) return update(setPath(c, 'checksMinutes', v));
            e.target.value = String(c.checksMinutes ?? 30);
            toast('Entre 5 et 180 minutes.');
          } }))));
  const extras = extraChecksFieldset(c, update);
  // One « Savoir-faire » block, one row per pack: its switch, its name, how many of its skills are on, and the fold to pick them.
  const packs = el('fieldset', {}, el('legend', {}, 'Savoir-faire'),
    app.catalog.packs.map((p) => {
      const pc = c.skills[p.id];
      const on = p.skills.filter((s) => pc.skills[s.id]).length;
      return el('div', { class: 'row pack-row' }, checkbox(`pack-${p.id}`, pc.enabled, (v) => update(setPath(c, `skills.${p.id}.enabled`, v))),
        el('div', { class: 'pack-main' }, el('label', { for: `pack-${p.id}` }, p.name), el('p', {}, `${on} sur ${p.skills.length}`),
          el('details', { open: p.skills.length <= 3, 'data-pack': p.id }, el('summary', {}, 'Choisir les savoir-faire'),
            el('div', { class: 'pack-skills', 'aria-disabled': String(!pc.enabled) },
              p.skills.map((s) => el('div', { class: 'row' },
                checkbox(`skill-${s.id}`, pc.skills[s.id], (v) => update(toggleSkill(c, p.id, s.id, v))),
                el('label', { for: `skill-${s.id}` }, s.id)))))));
    }));
  const dirty = JSON.stringify(c) !== app.current.saved;
  const bar = el('div', { class: 'savebar' },
    el('button', { type: 'submit', class: 'secondary', disabled: !dirty }, 'Enregistrer'),
    el('span', { class: 'muted' }, dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'));
  const open = new Set([...form.querySelectorAll('details[data-pack][open]')].map((d) => d.dataset.pack));
  const name = app.current.repo.name;
  // Issue #342: the everyday choices stay in view, everything technical folds under « Avancé » (remembered per device).
  const line = currentMachineLine();
  machine.shown = JSON.stringify(line);
  const alert = line.keys ? [runnerAlertBox(line.text, { role: 'status' })]
    : line.tone === 'warn' ? [el('p', { class: 'machine-status machine-alert warn', role: 'status' }, line.text)] : [];
  const summary = advancedSummary({
    machine: effectiveMachine({ isPrivate: app.current.repo.private, project: c.machine, general: machine.general }),
    checksOn: CHECKS.filter(([k]) => c.checks[k]).length, checksTotal: CHECKS.length,
    packsOn: app.catalog.packs.filter((p) => c.skills[p.id]?.enabled).length,
  });
  // Kept open across re-renders from the page itself, so a blocked storage never folds it under the finger.
  const wasOpen = form.querySelector('details.advanced')?.open;
  const advanced = el('details', { class: 'advanced', open: wasOpen ?? store.get(ADVANCED_KEY) === 'open',
    ontoggle: (e) => { if (e.target.open) store.set(ADVANCED_KEY, 'open'); else store.del(ADVANCED_KEY); } },
    el('summary', {}, el('span', { class: 'advanced-title' }, 'Avancé'), el('span', { class: 'advanced-summary' }, summary)),
    machineFieldset(update, line),
    el('p', { class: 'rules-more' }, el('button', { type: 'button', class: 'link-button', onclick: (e) => call('openGeneral', e.currentTarget).catch((err) => toast(errorText(err))) }, 'Changer le réglage de tous les projets')),
    engine, checks, extras, packs);
  form.replaceChildren(
    rulesSection('rules-project', `Ce projet : ${name}`, [production, site, stages, parallel, ...alert, advanced]),
    bar);
  for (const d of form.querySelectorAll('details[data-pack]')) if (open.has(d.dataset.pack)) d.open = true;
}

let savingRules = false;
// « Contrôles supplémentaires »: the project's own checks, run after the usual ones (scripts/checks.mjs). Each one is a
// name, the command run at the root of the project, and a switch. A project without any keeps no trace in its settings.
function extraChecksFieldset(c, update) {
  const list = c.extraChecks || [];
  const set = (next) => {
    const out = structuredClone(c);
    if (next.length) out.extraChecks = next; else delete out.extraChecks;
    update(out);
  };
  const edit = (i, patch) => set(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const items = list.map((x, i) => el('div', { class: 'row extra-check' },
    el('input', { type: 'checkbox', id: `extra-on-${i}`, checked: x.enabled !== false, 'aria-label': `Activer ${x.label || 'ce contrôle'}`, onchange: (e) => edit(i, { enabled: e.target.checked }) }),
    el('div', { class: 'extra-fields' },
      el('label', { for: `extra-on-${i}`, class: 'extra-switch' }, 'Activé'),
      el('label', { for: `extra-label-${i}` }, 'Nom'),
      el('input', { type: 'text', id: `extra-label-${i}`, value: x.label || '', maxlength: '60', autocomplete: 'off',
        onchange: (e) => edit(i, { label: e.target.value.trim() }) }),
      el('label', { for: `extra-command-${i}` }, 'Commande'),
      el('input', { type: 'text', id: `extra-command-${i}`, class: 'mono', value: x.command || '', maxlength: '500', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
        onchange: (e) => edit(i, { command: e.target.value.trim() }) }),
      el('button', { type: 'button', class: 'secondary', 'aria-label': `Retirer ${x.label || 'ce contrôle'}`, onclick: () => set(list.filter((_, j) => j !== i)) }, 'Retirer'))));
  return el('fieldset', {}, el('legend', {}, 'Contrôles supplémentaires'),
    ...items,
    el('button', { type: 'button', class: 'secondary', disabled: list.length >= MAX_EXTRA_CHECKS,
      onclick: () => { set([...list, { label: '', command: '', enabled: true }]); $(`extra-label-${list.length}`)?.focus(); } }, 'Ajouter un contrôle'));
}

async function saveRules(e) {
  e.preventDefault();
  if ((app.current.config.extraChecks || []).some((x) => !x.label?.trim() || !x.command?.trim())) {
    toast('Chaque contrôle supplémentaire a besoin d\'un nom et d\'une commande.');
    return;
  }
  if (savingRules) return; // a second tap would send the same version twice, and GitHub refuses the second one
  savingRules = true;
  try { await writeRules(); } finally { savingRules = false; }
}
async function writeRules() {
  const projectDirty = JSON.stringify(app.current.config) !== app.current.saved;
  const machineChanged = app.current.config.machine !== JSON.parse(app.current.saved || '{}').machine;
  const wasMode = effectiveProduction(JSON.parse(app.current.saved || '{}'), app.current.delivery);
  if (projectDirty) await writeProjectRules();
  const released = projectDirty ? await call('productionModeChanged', wasMode, effectiveProduction(app.current.config, app.current.delivery)) : 0;
  // The dev server check applies the change now instead of at its next run (15 minutes at most).
  if (machineChanged) {
    api(`/repos/${FACTORY_REPO}/actions/workflows/runners.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) }).catch(() => {});
  }
  renderRules();
  call('drawSite');
  call('drawSub');
  // A new production mode: the line read for the former one hides at once and is read again (issue #397).
  if (wasMode !== effectiveProduction(app.current.config, app.current.delivery)) { call('drawGap'); call('refreshGap', true).catch(() => {}); }
  toast(released ? `Paramètres enregistrés. ${released} modification${released > 1 ? 's' : ''} mise${released > 1 ? 's' : ''} en ligne.` : 'Paramètres enregistrés. Ils s\'appliquent dans une minute environ.');
}
async function writeProjectRules() {
  const fresh = await api(`/repos/${app.current.repo.full_name}/contents/factory.config.json`);
  if (!fresh) throw saidError('Les paramètres de ce projet ont disparu de GitHub\u00a0: rechargez la page.');
  // The file changed since it was loaded (the factory, or another device): keep those changes and apply only
  // what was modified here, instead of overwriting them.
  if (fresh.sha !== app.current.file.sha) {
    const theirs = resolveConfig(parseRawConfig(fromBase64(fresh.content)).raw, app.catalog, app.defaults).config;
    app.current.config = mergeConfig(JSON.parse(app.current.saved), app.current.config, theirs);
  }
  const body = JSON.stringify(app.current.config, null, 2) + '\n';
  const res = await api(`/repos/${app.current.repo.full_name}/contents/factory.config.json`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'chore(factory): update rules from the panel', content: toBase64(body), sha: fresh.sha }),
  });
  const before = JSON.parse(app.current.saved || '{}').maxParallel;
  app.current.file = { ...res.content, content: toBase64(body) };
  app.current.saved = JSON.stringify(app.current.config);
  // The next visit opens with these settings, and reads the file again (its push date is not known yet).
  call('settingsSaved', app.current);
  // More places: ask the factory to look at the queue now instead of at its next regular check.
  if (app.current.config.maxParallel > (before || 0)) wakeFactory(app.current.repo);
}

// Asks the factory to look at its free places now rather than at its next regular check (« tick »).
// A refused wake-up after « Garder » is said, never silent (issue #427), unless the project's own trigger is known to be
// up to date: the kept label already woke the factory there.
function wakeFactory(repo, { say = false } = {}) {
  api(`/repos/${repo.full_name}/actions/workflows/factory.yml/dispatches`, {
    method: 'POST', body: JSON.stringify({ ref: repo.default_branch, inputs: { payload: '{"tick":true}' } }),
  }).catch((e) => { if (say && e.status !== 401 && !triggers.fresh.has(repo.full_name)) toast(wakeErrorText(e)); });
}

// The project's trigger is copied at install and never synced by the factory (GitHub forbids it): an old one drops
// « Garder » and other label events. The panel adds the missing labels with the owner's token (issue #427), on the
// default branch and on preprod (main is merged into preprod by the factory, whose token may not carry a workflow
// change). Once per session and project, after a clear outcome: written, already up to date, or refused.
export async function updateTrigger(repo) {
  const name = repo.full_name;
  if (triggers.done.has(name)) return;
  const session = app.token;
  const upgrade = async (branch) => {
    const file = await api(`/repos/${name}/contents/${TRIGGER_FILE}${branch ? `?ref=${branch}` : ''}`, { cache: 'no-store' });
    const text = file?.content ? fromBase64(file.content) : null;
    const upgraded = upgradeTrigger(text);
    if (!upgraded) return text != null && knownTrigger(text);
    if (app.token !== session) return false;
    await api(`/repos/${name}/contents/${TRIGGER_FILE}`, {
      method: 'PUT',
      body: JSON.stringify({ message: 'chore(factory): let every factory label wake the factory (from the panel)', content: toBase64(upgraded), sha: file.sha, ...(branch ? { branch } : {}) }),
    });
    return true;
  };
  try {
    const fresh = await upgrade(null);
    if (app.token !== session) return;
    if (fresh) triggers.fresh.add(name);
    await upgrade('preprod');
    if (app.token === session) triggers.done.add(name);
  } catch (e) {
    if (app.token !== session) return;
    if (e.status === 403 || e.status === 404) { triggers.done.add(name); toast(TRIGGER_REFUSED); }
    throw e;
  }
}

onReset(() => {
  triggers.done.clear(); triggers.fresh.clear();
  forgotten = new Set(); clearTimeout(runnerTimer); $('runner-alert').hidden = true;
});
onUnsaved(() => app.current && JSON.stringify(app.current.config) !== app.current.saved);

$('tab-rules').addEventListener('click', () => selectTab('rules'));
// The focus left « Paramètres » (after the browser moved it): a dev server status held back meanwhile shows now.
$('rules').addEventListener('focusout', () => setTimeout(() => {
  if (!machine.held || !machine.hash || !app.current || machine.repo !== app.current.repo.full_name || $('rules').contains(document.activeElement)) return;
  showMachineStatus(machine.held);
}));
$('rules').addEventListener('submit', (e) => saveRules(e).catch((err) => toast(`Échec de l'enregistrement. ${errorText(err)}`)));
