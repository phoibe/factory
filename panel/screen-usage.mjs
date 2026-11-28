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
  reset: { all: { day: '', hour: '' }, fable: { day: '', hour: '' } }, reading: { all: '', fable: '' }, error: '', resetError: '', asking: null, message: '', saving: null, focus: null, editReset: false, confirmDelete: false });
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
    quota, unreadable: settings.unreadable, reading: { all: '', fable: '' }, error: '', resetError: '', asking: null, message: '', focus: null, editReset: false, confirmDelete: false,
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
// A figure cell; a phrase in place of a figure (« trop peu de mesures », « tarif inconnu », « — ») stays in the text's
// font, small and grey: only digits are mono (numbers.mjs).
const fig = (text) => el('td', { class: 'fig' }, /\d/.test(text) || text === '' ? text : el('span', { class: 'usage-word' }, text));

function table(rows, total, perPoint, periodId) {
  const span = weeks(periodId);
  const share = (dollars, per) => (dollars === null ? 'tarif inconnu' : fmtShare(dollars / per / span));
  // The plan columns, each once its gauge is calibrated: (row, isFable) → the cell's text.
  const gauges = [
    perPoint.fable != null && { name: 'Semaine Fable', cell: (dollars, fable, isFable) => (isFable && dollars === null ? 'tarif inconnu' : fmtShare(fable / perPoint.fable / span)) },
    perPoint.all != null && { name: 'Semaine tous moteurs', cell: (dollars) => share(dollars, perPoint.all) },
  ].filter(Boolean);
  const head = el('thead', {}, el('tr', {}, ...['Type de tâche', 'Moteur · effort', 'Tâches', 'Total', 'En moyenne', ...gauges.map((g) => g.name)]
    .map((name, i) => el('th', { scope: 'col', class: i >= 2 ? 'fig' : i === 1 ? 'usage-engine' : '' }, name))));
  const body = el('tbody', {});
  rows.forEach((r, i) => {
    const key = rowKey(r);
    const open = usage.open.has(key);
    const isFable = r.family === 'Fable';
    const kindIds = r.kinds.map((_, j) => `usage-row-${i}-${j}`);
    const toggle = el('button', { type: 'button', id: `usage-toggle-${i}`, class: 'usage-toggle', 'aria-expanded': String(open), 'aria-controls': kindIds.join(' '),
      onclick: () => { disarm(); if (usage.open.has(key)) usage.open.delete(key); else usage.open.add(key); render(); } },
    el('span', { class: 'chev', 'aria-hidden': 'true' }), typeName(r.type));
    // On a phone the engine goes under the type (style.css): the first figures fit on the first screen.
    body.append(el('tr', {}, el('th', { scope: 'row' }, toggle, el('span', { class: 'usage-engine-inline' }, engineLabel(r))),
      el('td', { class: 'usage-engine' }, engineLabel(r)), fig(String(r.tasks)), money(r.dollars, r.tokens),
      fig(fmtAverage(r.dollars, r.tasks)), ...gauges.map((g) => fig(g.cell(r.dollars, r.fableDollars, isFable)))));
    r.kinds.forEach((k, j) => body.append(el('tr', { id: kindIds[j], class: 'usage-kind', hidden: !open },
      el('th', { scope: 'row' }, k.name), el('td', { class: 'usage-engine' }, ''), fig(String(k.tasks)), money(k.dollars, k.tokens),
      fig(r.tasks < 5 ? '—' : fmtAverage(k.dollars, k.tasks)), // the row already says « trop peu de mesures »
      ...gauges.map((g) => fig(g.cell(k.dollars, isFable ? k.dollars ?? 0 : 0, isFable))))));
  });
  body.append(el('tr', { class: 'usage-total' }, el('th', { scope: 'row' }, 'Total'), el('td', { class: 'usage-engine' }, ''), fig(String(total.tasks)), money(total.dollars, total.tokens), fig(''),
    ...gauges.map((g) => fig(g.cell(total.dollars, total.fableDollars, false)))));
  // A region that scrolls sideways on a phone: reachable with the keyboard, named for screen readers.
  // `more`: columns lie beyond the right edge, which then fades (style.css) to show the frame scrolls.
  // The frame keeps its border; only the scrolling content inside it fades.
  return el('div', { class: 'usage-table-frame' }, el('div', { class: 'usage-table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Consommation par type de tâche', onscroll: (e) => showMore(e.currentTarget) },
    el('table', { class: 'usage-table' }, head, body)));
}
function showMore(wrap) {
  if (wrap) wrap.classList.toggle('more', wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1);
}
addEventListener('resize', () => showMore(document.querySelector('.usage-table-wrap')));
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

// « Confirmer la suppression » holds only until another action: then it is « Supprimer ce relevé » again.
function disarm() {
  if (!usage.confirmDelete) return false;
  usage.confirmDelete = false;
  return true;
}
const resetText = (r) => `${DAYS[r.day - 1]} ${r.hour} h`;
const button = (id, label, onclick, { disabled = false, kind = 'secondary' } = {}) => el('button', { type: 'button', id, class: kind,
  disabled: disabled || (!!usage.saving && usage.saving !== id) || usage.unreadable, 'aria-disabled': usage.saving === id ? 'true' : null,
  onclick: () => { if (usage.saving === id) return; if (id !== 'usage-reading-delete') disarm(); onclick(); } }, usage.saving === id ? 'Enregistrement…' : label);

// The weekly reset is set once: a form until it is saved (or « Modifier »), then one line.
function resetPart() {
  const q = usage.quota;
  const off = usage.unreadable || !!usage.saving;
  if (q.reset.all && !usage.editReset) {
    const text = `Remise à zéro : ${resetText(q.reset.all)}${q.reset.fable ? ` · Fable : ${resetText(q.reset.fable)}` : ''}`;
    return [el('div', { class: 'usage-reset-line' }, el('p', {}, text),
      button('usage-reset-edit', 'Modifier', () => { usage.editReset = true; usage.reset = { all: resetDraft(q.reset.all), fable: resetDraft(q.reset.fable) }; usage.focus = 'usage-reset-all-day'; render(); }))];
  }
  const pick = (id, part) => (v) => { disarm(); usage.reset[id][part] = v; usage.resetError = ''; render(); };
  const gauge = (id, name) => el('fieldset', { class: 'usage-gauge' }, el('legend', {}, name),
    select(`usage-reset-${id}-day`, 'Jour', dayOptions, usage.reset[id].day, pick(id, 'day'), off),
    select(`usage-reset-${id}-hour`, 'Heure', hourOptions, usage.reset[id].hour, pick(id, 'hour'), off));
  const resetChanged = JSON.stringify(usage.reset) !== JSON.stringify({ all: resetDraft(q.reset.all), fable: resetDraft(q.reset.fable) });
  const parts = [el('h3', {}, 'Remise à zéro de la semaine'), el('div', { class: 'usage-resets' }, gauge('all', 'Tous moteurs'), gauge('fable', 'Fable')),
    el('div', { class: 'actions' }, button('usage-reset-save', 'Enregistrer', () => saveReset(), { disabled: !resetChanged }),
      q.reset.all ? button('usage-reset-cancel', 'Annuler', () => { usage.editReset = false; usage.resetError = ''; usage.focus = 'usage-reset-edit'; render(); }) : null)];
  if (usage.resetError) parts.push(el('p', { class: 'error', role: 'alert' }, usage.resetError));
  return parts;
}

function readingPart() {
  const off = usage.unreadable || !!usage.saving;
  const parts = [el('h3', {}, 'Nouveau relevé'), el('div', { class: 'usage-resets' },
    field('usage-reading-all', 'Tous moteurs (%)', usage.reading.all, (v) => { usage.reading.all = v; if (disarm()) render(); }, off || !!usage.asking),
    field('usage-reading-fable', 'Fable (%)', usage.reading.fable, (v) => { usage.reading.fable = v; if (disarm()) render(); }, off || !!usage.asking)),
  button('usage-reading-save', 'Noter le relevé', () => noteReading(), { disabled: !!usage.asking })];
  if (usage.error) parts.push(el('p', { class: 'error', role: 'alert' }, usage.error));
  if (usage.asking) {
    parts.push(el('div', { class: 'usage-question' },
      el('p', { id: 'usage-question', tabindex: '-1' }, 'Avez-vous utilisé Claude en dehors de la factory depuis le relevé précédent ?'),
      el('div', { class: 'actions', role: 'group', 'aria-labelledby': 'usage-question' },
        button('usage-outside-yes', 'Oui', () => commitReading(true)),
        button('usage-outside-no', 'Non', () => commitReading(false)),
        button('usage-outside-cancel', 'Annuler', () => { usage.asking = null; usage.focus = 'usage-reading-all'; render(); })),
      el('p', { class: 'muted' }, OUTSIDE_HELP)));
  }
  if (usage.message) parts.push(el('p', { id: 'usage-message', role: 'status', tabindex: '-1' }, usage.message));
  return parts;
}

function plan(now) {
  const q = usage.quota;
  const parts = [el('legend', {}, el('h2', {}, 'Mon forfait'))];
  if (usage.unreadable) parts.push(el('p', { class: 'machine-status machine-alert warn', role: 'alert' }, 'Impossible de lire les réglages actuels. Réessayez dans un instant.'));
  // What is done each time (the reading) comes first once the reset, done once, is saved.
  if (q.reset.all) parts.push(...readingPart());
  else parts.push(...resetPart(), ...readingPart());
  const last = [...q.readings].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  if (last) {
    // « Supprimer ce relevé » may undo a calibration: a second touch confirms it.
    parts.push(el('div', { class: 'usage-last' },
      el('p', {}, `Dernier relevé du ${when(last.at)} : tous moteurs ${last.all} %${last.fable != null ? `, Fable ${last.fable} %` : ''}`),
      button('usage-reading-delete', usage.confirmDelete ? 'Confirmer la suppression' : 'Supprimer ce relevé',
        () => { if (usage.confirmDelete) removeLast(); else { usage.confirmDelete = true; render(); } })));
  }
  // The answer first (the week's split), then the calibration it comes from, in grey.
  for (const line of splitLines(q, now, quotaCost)) parts.push(el('p', { class: 'usage-split' }, line));
  parts.push(el('p', { class: 'usage-calibration muted' }, calibrationLine(q, now, quotaCost)));
  if (q.reset.all) parts.push(...resetPart());
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
  // No measure at all: nothing to filter or to price, only the sentence.
  const measured = usage.runs.length > 0;
  $('usage').replaceChildren(
    ...usage.missing.map((name) => el('p', { class: 'machine-status warn' }, `Les chiffres de ${name} n'ont pas pu être lus.`)),
    // replaceChildren would print a null as the text « null »: absent parts are left out.
    ...[measured ? el('div', { class: 'usage-filters' },
      select('usage-period', 'Période', periods.map((p) => [p.id, p.label]), period.id, (v) => { disarm(); usage.period = v; render(); }, false),
      select('usage-size', 'Taille', SIZES, usage.size, (v) => { disarm(); usage.size = v; render(); }, false)) : null,
    rows.length ? table(rows, total, perPoint, period.id) : el('p', { class: 'usage-empty' }, EMPTY),
    measured ? el('p', { class: 'muted usage-note' }, `Équivalent au tarif public de Claude du ${priced}. Ce n'est pas une facture.`) : null,
    plan(now)].filter(Boolean));
  showMore(document.querySelector('.usage-table-wrap'));
  // After an action of « Mon forfait », the focus goes to what it produced (the question, the message), never back to
  // the top of the page past the whole table.
  const target = usage.focus && !usage.saving ? $(usage.focus) : null;
  if (target) { usage.focus = null; target.focus(); } else if (focused && $(focused) && !$(focused).disabled) $(focused).focus();
  else if (focused?.startsWith('usage-') && !$('usage-view').hidden && document.activeElement === document.body) $('usage-title').focus();
}

// ---- Saving the readings (settings.json of the factory, only `quota` changes) --------------------------------------
// `change(quota) → quota` is applied to the quota read just before the write, never to the page's copy: a reading
// noted on another device meanwhile is kept (final review 1 of #628). Returns the quota written.
async function writeQuota(change) {
  await ensureRunnersBranch(api);
  const current = await runnersFile('settings.json');
  if (current.unreadable) throw new Error('Impossible de lire les réglages actuels. Réessayez dans un instant.');
  const quota = change(quotaFrom(current.json?.quota));
  const settings = { ...(current.json || call('machineSettings') || {}), quota };
  const res = await api(`/repos/${FACTORY_REPO}/contents/settings.json`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'chore(factory): plan readings from the panel', content: toBase64(JSON.stringify(settings, null, 2) + '\n'), branch: 'factory-runners', ...(current.sha ? { sha: current.sha } : {}) }),
  });
  call('generalWritten', { settings, sha: res?.content?.sha || null, general: settings.machine === 'github' ? 'github' : 'dev-server' });
  return quota;
}
// `by`: the button saving, which reads « Enregistrement… » meanwhile.
async function save(by, change, after = () => {}) {
  if (usage.saving) return;
  usage.saving = by;
  usage.confirmDelete = false;
  render();
  try {
    const quota = await writeQuota(change);
    usage.quota = quota;
    after(quota);
  } catch (err) {
    toast(`Échec de l'enregistrement. ${errorText(err)}`);
  } finally {
    usage.saving = null;
    if (!$('usage-view').hidden) render();
  }
}

// A gauge's reset is a day and an hour, or nothing for Fable; « tous moteurs » is needed.
const half = (d) => (d.day === '') !== (d.hour === '');
function saveReset() {
  const all = draftReset(usage.reset.all);
  usage.resetError = !all || half(usage.reset.fable) ? 'Choisissez un jour et une heure.' : '';
  if (usage.resetError) return render();
  const fable = draftReset(usage.reset.fable);
  // Only a reset save brings the drafts back to what is saved: a reading leaves an unsaved choice as it is.
  return save('usage-reset-save', (q) => ({ ...q, reset: { all, fable } }), (quota) => {
    usage.message = ''; usage.editReset = false; usage.focus = 'usage-reset-edit';
    usage.reset = { all: resetDraft(quota.reset.all), fable: resetDraft(quota.reset.fable) };
  });
}

function noteReading() {
  const all = parseReading(usage.reading.all);
  const fable = parseReading(usage.reading.fable, { optional: true });
  usage.message = '';
  usage.error = !usage.quota.reset.all ? 'Choisissez d\'abord la remise à zéro.' : all.error || fable.error || '';
  if (usage.error) return render();
  const reading = { all: all.value, fable: fable.value };
  if (needsQuestion(usage.quota, new Date())) { usage.asking = reading; usage.focus = 'usage-question'; return render(); }
  return commitReading(null, reading);
}
function commitReading(outside, reading = usage.asking) {
  if (!reading) return;
  let message = null;
  const change = (q) => { const out = addReading(q, { ...reading, outside }, { now: new Date(), cost: quotaCost }); message = out.message; return out.quota; };
  return save(outside === null ? 'usage-reading-save' : outside ? 'usage-outside-yes' : 'usage-outside-no', change, () => {
    usage.asking = null; usage.reading = { all: '', fable: '' }; usage.message = message || '';
    usage.focus = usage.message ? 'usage-message' : 'usage-reading-all';
  });
}
function removeLast() {
  return save('usage-reading-delete', (q) => deleteLast(q), () => { usage.message = ''; usage.asking = null; usage.focus = 'usage-reading-all'; });
}

onReset(() => {
  const seq = usage.seq + 1;
  Object.assign(usage, fresh(), { seq });
  closeUsage();
});

$('usage-back').addEventListener('click', () => closeUsage(true));
