import { fromBase64, toBase64 } from './lib.mjs';
import { errorText } from './errors.mjs';
import { readRunnersFile, ensureRunnersBranch } from './machine.mjs';
import { FACTORY_REPO, $, app, el, toast, onReset, provide, call } from './common.mjs';
import { api, mapLimit } from './github.mjs';
import { TASK_TYPES, aggregate, costBetween, engineLabel, fmtDollars, fmtTokens, fmtShare, fmtAverage } from './consumption.mjs';
import { periodOptions, weeks, weekStart, parseReading, needsQuestion, addReading, deleteLast, livePerPoint, calibrationLine, splitLines } from './quota.mjs';
import { PRICES_DATE, costOf } from './prices.mjs';

provide('openUsage', openUsage);
provide('closeUsage', closeUsage);

// ---- « Consommation » (issue #628): a page of its own, opened from « Réglages généraux » ----------------------------
// The runs of every project (usage/YYYY-MM.json on their claude/factory-usage branch, agent/scripts/usage.mjs) and the
// plan readings (`quota` in the factory's settings.json, beside the general settings).
const USAGE_REF = 'claude/factory-usage';
const runnersFile = (path) => readRunnersFile(api, path);
const DAY = 24 * 3600e3;
const SIZES = [['all', 'Toutes les demandes'], ['small', 'Petites'], ['medium', 'Moyennes'], ['large', 'Grandes']];
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const OUTSIDE_HELP = 'En dehors de la factory : vos discussions sur claude.ai, vos propres sessions, vos tâches planifiées et l\'onglet « Agent ».';
const EMPTY = 'Aucune mesure pour l\'instant. Les chiffres arrivent à la fin du prochain lancement de la factory.';

const fresh = () => ({ seq: 0, runs: [], missing: [], quota: emptyQuota(), unreadable: false, period: null, size: 'all', open: new Set(),
  reset: { all: { day: '', hour: '' }, fable: { day: '', hour: '' } }, reading: { all: '', fable: '' }, error: '', asking: null, message: '', saving: false });
const emptyQuota = () => ({ reset: { all: null, fable: null }, readings: [], calibration: null });
const usage = fresh();

// The public price of each model; tokens of a model with no price give null (« tarif inconnu »).
const cost = (tokens, model) => costOf(tokens, model);
// What the factory spent between two instants, for the gauges: every run read, whatever its size.
const quotaCost = (from, to, { fableOnly = false } = {}) => costBetween(usage.runs, from, to, { cost, fableOnly });

const validReset = (r) => (Number.isInteger(r?.day) && r.day >= 1 && r.day <= 7 && Number.isInteger(r?.hour) && r.hour >= 0 && r.hour <= 23 ? { day: r.day, hour: r.hour } : null);
const quotaFrom = (raw) => ({
  reset: { all: validReset(raw?.reset?.all), fable: validReset(raw?.reset?.fable) },
  readings: Array.isArray(raw?.readings) ? raw.readings.filter((r) => r && typeof r.at === 'string' && Number.isInteger(r.all)) : [],
  calibration: raw?.calibration && typeof raw.calibration === 'object' ? raw.calibration : null,
});
const resetDraft = (r) => ({ day: r ? String(r.day) : '', hour: r ? String(r.hour) : '' });

// The records are read from the earliest of 30 days ago, the start of the previous plan week and the calibration's
// first reading (so its dollars per point are recomputed from the same runs), never more than 3 months back.
function readFrom(now, quota) {
  let from = new Date(now - 30 * DAY);
  if (quota.reset.all) { const prev = weekStart(now, quota.reset.all); prev.setDate(prev.getDate() - 7); if (prev < from) from = prev; }
  const calibrated = Date.parse(quota.calibration?.from);
  if (!Number.isNaN(calibrated) && calibrated < from.getTime()) from = new Date(calibrated);
  const oldest = new Date(now); oldest.setMonth(oldest.getMonth() - 3);
  return from < oldest ? oldest : from;
}
// The month files ('YYYY-MM', UTC as the runs write them) from `from` to `now`.
function monthsBetween(from, now) {
  const out = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d <= now) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  return out;
}
// One project's runs; a 404 (never measured, or no run that month) is no data, anything else fails the project.
async function readProject(fullName, months) {
  const files = await Promise.all(months.map((m) => api(`/repos/${fullName}/contents/usage/${m}.json?ref=${USAGE_REF}`, { cache: 'no-store' }).catch((e) => {
    if (e?.status === 404) return null;
    throw e;
  })));
  return files.flatMap((f) => {
    if (!f?.content) return [];
    const json = JSON.parse(fromBase64(f.content));
    return Object.values(json?.runs || {}).filter((r) => r && typeof r === 'object');
  });
}

async function openUsage() {
  const seq = ++usage.seq;
  const session = app.token;
  $('general-view').hidden = true;
  $('usage-view').hidden = false;
  $('usage').setAttribute('aria-busy', 'true');
  $('usage').replaceChildren(el('p', { class: 'muted' }, 'Chargement…'));
  $('usage-title').focus();
  window.scrollTo(0, 0);
  const settings = await runnersFile('settings.json');
  const quota = quotaFrom(settings.json?.quota);
  const now = new Date();
  const months = monthsBetween(readFrom(now, quota), now);
  const repos = app.projects.map((p) => p.repo);
  if (!repos.some((r) => r.full_name === FACTORY_REPO)) repos.push({ full_name: FACTORY_REPO, name: FACTORY_REPO.split('/')[1] });
  const read = await mapLimit(repos, 4, (repo) => readProject(repo.full_name, months).then((runs) => ({ runs }), () => ({ failed: repo.name })));
  if (seq !== usage.seq || app.token !== session || $('usage-view').hidden) return; // closed, or opened again meanwhile
  Object.assign(usage, {
    runs: read.flatMap((r) => r.runs || []), missing: read.filter((r) => r.failed).map((r) => r.failed),
    quota, unreadable: settings.unreadable, reading: { all: '', fable: '' }, error: '', asking: null, message: '',
    reset: { all: resetDraft(quota.reset.all), fable: resetDraft(quota.reset.fable) },
  });
  render();
}

// Hides the page. `back`: the « ← Retour aux réglages généraux » link, which shows the general page as it was left.
function closeUsage(back = false) {
  const wasOpen = !$('usage-view').hidden;
  usage.seq += 1;
  $('usage-view').hidden = true;
  if (!back || !wasOpen) return;
  $('general-view').hidden = false;
  ($('usage-open') || $('general-title')).focus();
  window.scrollTo(0, 0);
}

// ---- The table ------------------------------------------------------------------------------------------------------
const rowKey = (r) => JSON.stringify([r.type, r.family, r.version, r.effort]);
const money = (dollars, tokens) => el('td', { class: 'fig' }, fmtDollars(dollars), el('small', {}, fmtTokens(tokens)));
const fig = (text) => el('td', { class: 'fig' }, text);

function table(rows, total, perPoint, periodId) {
  const span = weeks(periodId);
  const share = (dollars, per) => (dollars === null ? 'tarif inconnu' : fmtShare(dollars / per / span));
  // The plan columns, each once its gauge is calibrated: (row, isFable) → the cell's text.
  const gauges = [
    perPoint.fable != null && { name: 'Semaine Fable', cell: (dollars, fable, isFable) => (isFable && dollars === null ? 'tarif inconnu' : fmtShare(fable / perPoint.fable / span)) },
    perPoint.all != null && { name: 'Semaine tous moteurs', cell: (dollars) => share(dollars, perPoint.all) },
  ].filter(Boolean);
  const head = el('thead', {}, el('tr', {}, ...['Type de tâche', 'Moteur · effort', 'Tâches', 'Total', 'En moyenne', ...gauges.map((g) => g.name)]
    .map((name, i) => el('th', { scope: 'col', class: i >= 2 ? 'fig' : '' }, name))));
  const body = el('tbody', {});
  rows.forEach((r, i) => {
    const key = rowKey(r);
    const open = usage.open.has(key);
    const isFable = r.family === 'Fable';
    const kindIds = r.kinds.map((_, j) => `usage-row-${i}-${j}`);
    const toggle = el('button', { type: 'button', id: `usage-toggle-${i}`, class: 'usage-toggle', 'aria-expanded': String(open), 'aria-controls': kindIds.join(' '),
      onclick: () => { if (usage.open.has(key)) usage.open.delete(key); else usage.open.add(key); render(); } },
    el('span', { class: 'chev', 'aria-hidden': 'true' }), typeName(r.type));
    body.append(el('tr', {}, el('th', { scope: 'row' }, toggle), el('td', {}, engineLabel(r)), fig(String(r.tasks)), money(r.dollars, r.tokens),
      fig(fmtAverage(r.dollars, r.tasks)), ...gauges.map((g) => fig(g.cell(r.dollars, r.fableDollars, isFable)))));
    r.kinds.forEach((k, j) => body.append(el('tr', { id: kindIds[j], class: 'usage-kind', hidden: !open },
      el('th', { scope: 'row' }, k.name), el('td', {}, ''), fig(String(k.tasks)), money(k.dollars, k.tokens), fig(fmtAverage(k.dollars, k.tasks)),
      ...gauges.map((g) => fig(g.cell(k.dollars, isFable ? k.dollars ?? 0 : 0, isFable))))));
  });
  body.append(el('tr', { class: 'usage-total' }, el('th', { scope: 'row' }, 'Total'), el('td', {}, ''), fig(String(total.tasks)), money(total.dollars, total.tokens), fig(''),
    ...gauges.map((g) => fig(g.cell(total.dollars, total.fableDollars, false)))));
  // A region that scrolls sideways on a phone: reachable with the keyboard, named for screen readers.
  return el('div', { class: 'usage-table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Consommation par type de tâche' },
    el('table', { class: 'usage-table' }, head, body));
}
const typeName = (id) => TASK_TYPES.find((t) => t.id === id)?.name || id;

// ---- « Mon forfait » ------------------------------------------------------------------------------------------------
const select = (id, label, options, value, onchange, disabled) => el('div', { class: 'usage-field' },
  el('label', { for: id }, label),
  el('select', { id, disabled, onchange: (e) => onchange(e.target.value) }, ...options.map(([v, t]) => el('option', { value: v, selected: String(value) === v }, t))));
const field = (id, label, value, oninput, disabled) => el('div', { class: 'usage-field' },
  el('label', { for: id }, label),
  el('input', { id, type: 'text', inputmode: 'numeric', autocomplete: 'off', value, disabled, oninput: (e) => oninput(e.target.value) }));

const dayOptions = [['', '—'], ...DAYS.map((d, i) => [String(i + 1), d])];
const hourOptions = [['', '—'], ...Array.from({ length: 24 }, (_, h) => [String(h), `${h} h`])];
const draftReset = (d) => (d.day !== '' && d.hour !== '' ? { day: Number(d.day), hour: Number(d.hour) } : null);
const when = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

function plan(now) {
  const q = usage.quota;
  const off = usage.unreadable || usage.saving;
  const gauge = (id, name) => el('fieldset', { class: 'usage-gauge' }, el('legend', {}, name),
    select(`usage-reset-${id}-day`, 'Jour', dayOptions, usage.reset[id].day, (v) => { usage.reset[id].day = v; render(); }, off),
    select(`usage-reset-${id}-hour`, 'Heure', hourOptions, usage.reset[id].hour, (v) => { usage.reset[id].hour = v; render(); }, off));
  const resetChanged = JSON.stringify([draftReset(usage.reset.all), draftReset(usage.reset.fable)]) !== JSON.stringify([q.reset.all, q.reset.fable]);
  const parts = [el('legend', {}, 'Mon forfait')];
  if (usage.unreadable) parts.push(el('p', { class: 'machine-status machine-alert warn', role: 'alert' }, 'Impossible de lire les réglages actuels. Réessayez dans un instant.'));
  parts.push(el('h2', {}, 'Remise à zéro de la semaine'), el('div', { class: 'usage-resets' }, gauge('all', 'Tous moteurs'), gauge('fable', 'Fable')),
    el('button', { type: 'button', id: 'usage-reset-save', class: 'secondary', disabled: off || !draftReset(usage.reset.all) || !resetChanged, onclick: () => saveReset() }, 'Enregistrer'));
  parts.push(el('h2', {}, 'Nouveau relevé'), el('div', { class: 'usage-resets' },
    field('usage-reading-all', 'Tous moteurs (%)', usage.reading.all, (v) => { usage.reading.all = v; }, off || !!usage.asking),
    field('usage-reading-fable', 'Fable (%)', usage.reading.fable, (v) => { usage.reading.fable = v; }, off || !!usage.asking)),
  el('button', { type: 'button', id: 'usage-reading-save', class: 'secondary', disabled: off || !q.reset.all || !!usage.asking, onclick: () => noteReading() }, 'Noter le relevé'));
  if (usage.error) parts.push(el('p', { class: 'error', role: 'alert' }, usage.error));
  if (usage.asking) {
    parts.push(el('div', { class: 'usage-question' },
      el('p', { id: 'usage-question' }, 'Avez-vous utilisé Claude en dehors de la factory depuis le relevé précédent ?'),
      el('div', { class: 'actions', role: 'group', 'aria-labelledby': 'usage-question' },
        el('button', { type: 'button', id: 'usage-outside-yes', class: 'secondary', disabled: off, onclick: () => commitReading(true) }, 'Oui'),
        el('button', { type: 'button', id: 'usage-outside-no', class: 'secondary', disabled: off, onclick: () => commitReading(false) }, 'Non')),
      el('p', { class: 'muted' }, OUTSIDE_HELP)));
  }
  if (usage.message) parts.push(el('p', { role: 'status' }, usage.message));
  const last = [...q.readings].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  if (last) {
    parts.push(el('div', { class: 'usage-last' },
      el('p', {}, `Dernier relevé du ${when(last.at)} : tous moteurs ${last.all} %${last.fable != null ? `, Fable ${last.fable} %` : ''}`),
      el('button', { type: 'button', id: 'usage-reading-delete', class: 'secondary', disabled: off, onclick: () => removeLast() }, 'Supprimer ce relevé')));
  }
  parts.push(el('p', { class: 'usage-calibration' }, calibrationLine(q, now, quotaCost)));
  for (const line of splitLines(q, now, quotaCost)) parts.push(el('p', { class: 'usage-split' }, line));
  return el('fieldset', { class: 'usage-plan' }, ...parts);
}

// ---- The page -------------------------------------------------------------------------------------------------------
function render() {
  const focused = document.activeElement?.id;
  const now = new Date();
  const periods = periodOptions(now, usage.quota.reset.all);
  const period = periods.find((p) => p.id === usage.period) || periods[0];
  usage.period = period.id;
  const { rows, total } = aggregate(usage.runs, { from: period.from, to: period.to, size: usage.size, cost });
  const perPoint = livePerPoint(usage.quota, quotaCost);
  const priced = new Date(`${PRICES_DATE}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  $('usage').removeAttribute('aria-busy');
  $('usage').replaceChildren(
    ...usage.missing.map((name) => el('p', { class: 'machine-status warn' }, `Les chiffres de ${name} n'ont pas pu être lus.`)),
    el('div', { class: 'usage-filters' },
      select('usage-period', 'Période', periods.map((p) => [p.id, p.label]), period.id, (v) => { usage.period = v; render(); }, false),
      select('usage-size', 'Taille', SIZES, usage.size, (v) => { usage.size = v; render(); }, false)),
    rows.length ? table(rows, total, perPoint, period.id) : el('p', { class: 'usage-empty' }, EMPTY),
    el('p', { class: 'muted usage-note' }, `Équivalent au tarif public de Claude du ${priced}. Ce n'est pas une facture.`),
    plan(now));
  if (focused && $(focused) && !$(focused).disabled) $(focused).focus();
  else if (focused?.startsWith('usage-') && !$('usage-view').hidden && document.activeElement === document.body) $('usage-title').focus();
}

// ---- Saving the readings (settings.json of the factory, only `quota` changes) --------------------------------------
async function writeQuota(quota) {
  await ensureRunnersBranch(api);
  const current = await runnersFile('settings.json');
  if (current.unreadable) throw new Error('Impossible de lire les réglages actuels. Réessayez dans un instant.');
  const settings = { ...(current.json || call('machineSettings') || {}), quota };
  const res = await api(`/repos/${FACTORY_REPO}/contents/settings.json`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'chore(factory): plan readings from the panel', content: toBase64(JSON.stringify(settings, null, 2) + '\n'), branch: 'factory-runners', ...(current.sha ? { sha: current.sha } : {}) }),
  });
  call('generalWritten', { settings, sha: res?.content?.sha || null, general: settings.machine === 'github' ? 'github' : 'dev-server' });
}
async function save(next, after = () => {}) {
  if (usage.saving) return;
  usage.saving = true;
  render();
  try {
    await writeQuota(next);
    usage.quota = next;
    after();
  } catch (err) {
    toast(`Échec de l'enregistrement. ${errorText(err)}`);
  } finally {
    usage.saving = false;
    if (!$('usage-view').hidden) render();
  }
}

function saveReset() {
  const all = draftReset(usage.reset.all);
  if (!all) return;
  return save({ ...usage.quota, reset: { all, fable: draftReset(usage.reset.fable) } }, () => { usage.message = ''; });
}

function noteReading() {
  const all = parseReading(usage.reading.all);
  const fable = parseReading(usage.reading.fable, { optional: true });
  usage.message = '';
  usage.error = all.error || fable.error || '';
  if (usage.error) return render();
  const reading = { all: all.value, fable: fable.value };
  if (needsQuestion(usage.quota, new Date())) { usage.asking = reading; return render(); }
  return commitReading(null, reading);
}
function commitReading(outside, reading = usage.asking) {
  if (!reading) return;
  const { quota, message } = addReading(usage.quota, { ...reading, outside }, { now: new Date(), cost: quotaCost });
  return save(quota, () => { usage.asking = null; usage.reading = { all: '', fable: '' }; usage.message = message || ''; });
}
function removeLast() {
  return save(deleteLast(usage.quota), () => { usage.message = ''; usage.asking = null; });
}

onReset(() => {
  const seq = usage.seq + 1;
  Object.assign(usage, fresh(), { seq });
  closeUsage();
});

$('usage-back').addEventListener('click', () => closeUsage(true));
