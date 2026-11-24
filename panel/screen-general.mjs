import { toBase64 } from './lib.mjs';
import { errorText } from './errors.mjs';
import { readRunnersFile } from './machine.mjs';
import { MODEL_ROLES, MODEL_FAMILIES, familyLabel, roleModel } from './models.mjs';
import { FACTORY_REPO, MACHINE_CHOICES, $, app, el, toast, machineRadios, onReset, onUnsaved, onView, shown, setGeneralOpen, provide, call } from './common.mjs';
import { api } from './github.mjs';

provide('openGeneral', openGeneral);
provide('closeGeneral', closeGeneral);

// The general setting and the dev server check live on a branch of the factory (written by scripts/runners.mjs).
const RUNNERS_BRANCH = 'factory-runners';
const runnersFile = (path) => readRunnersFile(api, path);

// Writes the general settings (machine and models) on the factory's branch (created if it does not exist yet).
async function writeGeneral({ machine: choice, models }) {
  if (!(await api(`/repos/${FACTORY_REPO}/branches/${RUNNERS_BRANCH}`).catch(() => null))) {
    const tree = await api(`/repos/${FACTORY_REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ tree: [
      { path: 'README.md', mode: '100644', type: 'blob', content: 'Réglage général et état du serveur de dev, écrits par la factory et le panneau. Ne pas fusionner.\n' },
    ] }) });
    const commit = await api(`/repos/${FACTORY_REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'chore(factory): dev server branch', tree: tree.sha, parents: [] }) });
    await api(`/repos/${FACTORY_REPO}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${RUNNERS_BRANCH}`, sha: commit.sha }) }).catch((e) => { if (e.status !== 422) throw e; });
  }
  const fresh = await runnersFile('settings.json');
  // Keeps what changed there since the page loaded (runner labels): only the machine and the models are written from here.
  const body = JSON.stringify({ ...(fresh.json || call('machineSettings') || {}), machine: choice, models }, null, 2) + '\n';
  const res = await api(`/repos/${FACTORY_REPO}/contents/settings.json`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'chore(factory): general settings from the panel', content: toBase64(body), branch: RUNNERS_BRANCH, ...(fresh.sha ? { sha: fresh.sha } : {}) }),
  });
  call('generalWritten', { settings: JSON.parse(body), sha: res?.content?.sha || null, general: choice });
}

// ---- « Réglages généraux » (issue #544): a page of its own, for every project ----------------------------------------
// `saved` is what the factory's branch holds, as text, to know when something changed.
// `read`: the read on its way, with the session and the project it was started for.
const general = { machine: 'dev-server', models: {}, saved: '', unreadable: false, from: null, read: null, shown: null };
const generalValue = () => JSON.stringify({ machine: general.machine, models: general.models });
const generalDirty = () => !general.unreadable && general.saved !== '' && generalValue() !== general.saved;
const generalFrom = (raw) => ({ machine: raw?.machine === 'github' ? 'github' : 'dev-server', models: Object.fromEntries(MODEL_ROLES.map((r) => [r.id, roleModel(raw, r.id)])) });

// `from` is the element to give the focus back to on closing (the top button, or the Paramètres link). The page opens
// at once, with « Chargement… » inside it while the settings are read (review #556): on a phone the top button lives in
// « Plus », which closes on the tap.
async function openGeneral(from = $('general-open')) {
  const open = !$('general-view').hidden;
  if (!open) general.from = from;
  const session = app.token, project = app.current;
  // What was edited stays while the page is dirty: it is read again only when clean (or when it could not be read).
  const clean = !generalDirty() || general.unreadable;
  const read = clean && general.read?.session === session && general.read.project === project ? general.read : null;
  const mine = clean && !read ? { session, project } : null;
  general.shown = { session, project };
  // The full screen removes the page's side margins: the general page never opens in it (review #556).
  setGeneralOpen(true);
  $('project-view').classList.add('on-general');
  $('general-view').hidden = false;
  $('general-open').setAttribute('aria-pressed', 'true');
  if (read || mine) {
    $('general').setAttribute('aria-busy', 'true');
    $('general').replaceChildren(el('p', { class: 'muted' }, 'Chargement…'));
  } else renderGeneral();
  $('general-title').focus();
  window.scrollTo(0, 0);
  if (!mine) return; // nothing to read, or a read already on its way fills the page
  general.read = mine;
  let settings;
  try { settings = await runnersFile('settings.json'); } finally { if (general.read === mine) general.read = null; }
  // Logged out, or another screen or project meanwhile: the late answer is dropped, and a page still shown for that
  // session or project is closed (review #556).
  if (app.token !== session || app.current !== project || shown().screen !== 'project-view') {
    if (general.shown?.session !== app.token || general.shown?.project !== app.current || shown().screen !== 'project-view') closeGeneral();
    return;
  }
  Object.assign(general, generalFrom(settings.json), { unreadable: settings.unreadable });
  general.saved = generalValue();
  if (!$('general-view').hidden) renderGeneral();
}
function closeGeneral(giveFocusBack = false) {
  const wasOpen = !$('general-view').hidden;
  $('project-view').classList.remove('on-general');
  $('general-view').hidden = true;
  $('general-open').setAttribute('aria-pressed', 'false');
  setGeneralOpen(false);
  if (wasOpen && giveFocusBack) {
    let target = general.from?.isConnected ? general.from : $('general-open');
    // On a phone the top button sits inside the closed « Plus » menu: its summary takes the focus instead.
    const menu = target.closest('details');
    if (menu && !menu.open) target = menu.querySelector('summary');
    target.focus();
  }
}

function renderGeneral() {
  $('general').removeAttribute('aria-busy');
  const modelRows = MODEL_ROLES.map((r) => el('div', { class: 'row model-row' }, el('div', {},
    el('label', { for: `model-${r.id}` }, r.name),
    el('p', { id: `model-${r.id}-help` }, r.help),
    el('select', { id: `model-${r.id}`, disabled: general.unreadable, 'aria-describedby': `model-${r.id}-help`, onchange: (e) => { general.models[r.id] = e.target.value; renderGeneral(); } },
      ...MODEL_FAMILIES.map((f) => el('option', { value: f.id, selected: general.models[r.id] === f.id }, familyLabel(f)))))));
  const models = el('fieldset', {}, el('legend', {}, 'Modèles'), ...modelRows,
    el('p', { class: 'models-note' }, 'L’agent qui pilote chaque lancement garde le modèle de la routine du projet sur claude.ai : la factory ne peut pas le changer, choisissez-le dans la routine. Il confie toujours le plan et l’écriture du code aux rôles ci-dessus, même pour une petite retouche.'));
  const tasks = el('fieldset', { class: 'machine' }, el('legend', {}, 'Machine des tâches'),
    ...machineRadios('machine-general', MACHINE_CHOICES, general.machine, (v) => { general.machine = v; renderGeneral(); }, general.unreadable));
  const dirty = generalDirty();
  const failed = general.unreadable ? [el('p', { class: 'machine-status machine-alert warn', role: 'alert' }, 'Impossible de lire les réglages actuels. Réessayez dans un instant.')] : [];
  $('general').replaceChildren(...failed, models, tasks, el('div', { class: 'savebar' },
    el('button', { type: 'submit', class: 'secondary', disabled: !dirty || general.unreadable }, 'Enregistrer'),
    el('span', { class: 'muted' }, general.unreadable ? '' : dirty ? 'Modifications non enregistrées' : 'Tout est enregistré')));
}

let savingGeneral = false;
async function saveGeneral(e) {
  e.preventDefault();
  if (savingGeneral || general.unreadable) return;
  savingGeneral = true;
  try {
    const machineChanged = general.machine !== JSON.parse(general.saved).machine;
    await writeGeneral({ machine: general.machine, models: Object.fromEntries(MODEL_ROLES.filter((r) => general.models[r.id] !== r.default).map((r) => [r.id, general.models[r.id]])) });
    general.saved = generalValue();
    // The dev server check applies the change now instead of at its next run (15 minutes at most).
    if (machineChanged) api(`/repos/${FACTORY_REPO}/actions/workflows/runners.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) }).catch(() => {});
    renderGeneral();
    if (app.current) call('renderRules');
    toast(`Réglages généraux enregistrés : ils servent dès le prochain lancement.${machineChanged ? ' Le changement de machine s\'applique dans une minute environ.' : ''}`);
  } finally { savingGeneral = false; }
}

onReset(() => {
  Object.assign(general, { machine: 'dev-server', models: {}, saved: '', unreadable: false, from: null, read: null, shown: null }); closeGeneral();
});
onView((e) => {
  if (e.what !== 'screen') return;
  if (e.screen !== 'project-view') closeGeneral();
  $('general-open').hidden = e.screen !== 'project-view'; // the page lives inside the project screen
});
onUnsaved(() => generalDirty());

$('general-open').addEventListener('click', () => openGeneral($('general-open')).catch((err) => toast(errorText(err))));
$('general-back').addEventListener('click', () => closeGeneral(true));
$('general').addEventListener('submit', (e) => saveGeneral(e).catch((err) => toast(`Échec de l'enregistrement. ${errorText(err)}`)));
