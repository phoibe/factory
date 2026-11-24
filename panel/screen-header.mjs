import { fromBase64, phoneLink, releaseButton, siteLink, stableView } from './lib.mjs?v=28';
import { gapView, deploymentState, isLiveEnv, tagged } from './production.mjs?v=3';
import { effectiveProduction } from './config-core.mjs';
import { errorText } from './errors.mjs';
import { parisMidnight, runsToday, runsText } from './runs.mjs';
import { parseStack, inlineParts, stackDate, frenchSpaces, deliveryOf, STACK_FILE } from './stack.mjs';
import { CHANGELOG_PATHS, readChangelog, versionProblem, versionLine } from './changelog.mjs';
import { FACTORY_REPO, $, app, el, toast, onReset, onView, shown, selectTab, boardFirst, provide, call } from './common.mjs?v=1';
import { api, cachedGet, mapLimit } from './github.mjs?v=1';

provide('refreshRuns', refreshRuns);
provide('refreshRelease', refreshRelease);
provide('refreshGap', refreshGap);
provide('drawSite', drawSite);
provide('drawSub', drawSub);
provide('drawGap', drawGap);
provide('productionModeChanged', productionModeChanged);

const REVIEW_BODY = ['Review générale demandée depuis le tableau.', '',
  '1. Passe design : critique impeccable de tous les écrans, puis correction de tout ce qu\'elle trouve.',
  '2. Revue de code générale de toute l\'appli, puis correction.', '',
  'Ce qui demande une vraie nouvelle feature devient une issue à part.'].join('\n');
const UI_POLISH_BODY = ['Amélioration UI demandée depuis le tableau.', '',
  'Jusqu\'à 3 tours de critique design de tous les écrans (états vide, erreur, chargement et téléphone compris), chacun suivi de la correction de tout ce qu\'il a trouvé.', '',
  'Seulement l\'apparence et la clarté des écrans : un vrai manque fonctionnel devient une idée à trier.'].join('\n');

// A phone screen (the same width as the CSS's phone rules).
const PHONE = '(max-width: 600px)';

function drawSite() {
  const url = siteLink(app.current.config.siteUrl, app.current.repo.homepage);
  const a = $('site');
  if (url) {
    a.href = url;
    a.textContent = `${url.replace(/^https:\/\//, '').replace(/\/$/, '')} ↗`;
    a.target = '_blank';
    a.classList.remove('add');
  } else {
    a.href = '#site-url';
    a.textContent = 'Ajouter l\'adresse du site en ligne';
    a.removeAttribute('target');
    a.classList.add('add');
  }
}

// Agent starts of the day, all projects together, refreshed every 5 minutes (the routines have a daily limit).
let runsTimer = null;
export async function refreshRuns() {
  clearTimeout(runsTimer);
  runsTimer = setTimeout(refreshRuns, 5 * 60_000);
  await boardFirst();
  if (!app.token || !app.projects.length) return;
  const from = parisMidnight();
  try {
    const counts = await mapLimit(app.projects, 2, async (p) => {
      const events = [];
      for (let page = 1; page <= 5; page++) {
        // A project GitHub no longer shows (404) counts no start, as before; it never stops the whole counter.
        const batch = (await cachedGet(`/repos/${p.repo.full_name}/issues/events?per_page=100&page=${page}`).catch((e) => { if (e.status === 404) return { data: [] }; throw e; })).data || [];
        events.push(...batch);
        if (batch.length < 100 || Date.parse(batch.at(-1).created_at) < from) break;
      }
      return runsToday(events);
    });
    $('runs').textContent = runsText(counts.reduce((a, b) => a + b, 0));
    $('runs').hidden = false;
    $('runs-sep').hidden = false;
  } catch { /* the next try is in 5 minutes */ }
}

// ---- How the project goes to production, read in its stack sheet (STACK.md, « Mise en production ») ----------------
// A project that never chose its mode follows the sheet: « Manuelle » (a merge deploys nothing, Pulsar Wheel) means
// « Externe ». The mode in force shows under the project name when it is external, and is pre-selected in the settings.
export function drawSub() {
  const manual = effectiveProduction(app.current.config, app.current.delivery) === 'external';
  $('project-sub').textContent = `${app.current.repo.private ? 'Privé' : 'Public'} · ${app.current.config.maxParallel} en parallèle${manual ? ' · Mise en production externe' : ''}`;
}
export async function loadDelivery(project) {
  // A failed read keeps the mode known from the last visit; only a missing sheet (404, null) forgets it.
  const file = await api(`/repos/${project.repo.full_name}/contents/${STACK_FILE}`).catch(() => undefined);
  if (app.current !== project || file === undefined) return;
  const delivery = file?.content ? deliveryOf(fromBase64(file.content)) : null;
  if (JSON.stringify(delivery) === JSON.stringify(app.current.delivery)) return;
  app.current.delivery = delivery;
  drawSub();
  drawGap(); // a line read for the former mode is hidden at once
  drawRelease();
  refreshGap(true).catch(() => {});
  if (!$('rules').contains(document.activeElement)) call('renderRules');
}

// ---- Écart de production (issue #369) ---------------------------------------------------------------------------
// Under the project's name: is the live site up to date with the validated changes? A version is live only once its
// host reported a successful publication (production.mjs). Read at most once a minute, with ETags.
const GAP_MS = 60_000;
// Kept per project while this tab stays open (issue #397): `views` its last line with the mode it was read for, `at`
// when it was read, `busy` the read going and `again` the forced read waiting for it.
const gap = { at: new Map(), busy: new Map(), again: new Map(), views: new Map() };
export function refreshGap(force = false) {
  const project = app.current;
  const repo = project.repo.full_name;
  // One read at a time per project: opening a project and its first refresh must not fire the same requests twice.
  // A forced read (its production mode just read) waits for the one going, never lost behind it. A read of another
  // project never holds this one up.
  const busy = gap.busy.get(repo);
  if (busy) {
    if (!force) return busy;
    if (!gap.again.has(repo)) {
      const next = busy.catch(() => {}).then(() => { if (gap.again.get(repo) === next) gap.again.delete(repo); return app.current === project ? refreshGap(true) : null; });
      gap.again.set(repo, next);
    }
    return gap.again.get(repo);
  }
  const run = readGap(force).finally(() => { if (gap.busy.get(repo) === run) gap.busy.delete(repo); });
  gap.busy.set(repo, run);
  return run;
}
const gapMode = (project) => effectiveProduction(project.config, project.delivery);
async function readGap(force) {
  const project = app.current;
  await boardFirst();
  if (app.current !== project) return; // another project opened meanwhile: its own read comes with it
  const repo = project.repo.full_name;
  if (!force && Date.now() - (gap.at.get(repo) || 0) < GAP_MS) return;
  gap.at.set(repo, Date.now());
  const mode = effectiveProduction(project.config, project.delivery);
  const hasSite = Boolean(siteLink(project.config.siteUrl, project.repo.homepage));
  let view;
  try {
    // A preview deployment is created on every push: read a wide page, or the live ones may all be pushed out of it.
    const deployments = mode === 'external' ? [] : (await cachedGet(`/repos/${repo}/deployments?per_page=100`)).data || [];
    const statusesById = {};
    const live = deployments.filter((d) => isLiveEnv(d.environment))
      .sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 10);
    for (const d of live) {
      statusesById[d.id] = (await cachedGet(`/repos/${repo}/deployments/${d.id}/statuses?per_page=20`)).data || [];
      if (statusesById[d.id].some((x) => x.state === 'success')) break;
    }
    // External production or a silent host: the site's version tag (issue #372), kept by the relay in refs/factory/live.
    const byTag = tagged({ mode, hasSite, deployments });
    const tagSha = byTag ? await cachedGet(`/repos/${repo}/git/ref/factory/live`)
      .then((r) => r.data?.object?.sha || null, (e) => { if (e?.status === 404) return null; throw e; }) : null;
    const liveSha = byTag ? tagSha : deploymentState(live, statusesById).liveSha;
    let aheadShas = new Set();
    let pulls = [];
    let truncated = false;
    if (liveSha) {
      const preprod = mode === 'approval' && await cachedGet(`/repos/${repo}/git/ref/heads/preprod`).catch((e) => { if (e?.rateLimited) throw e; return null; });
      const branch = preprod ? 'preprod' : project.repo.default_branch || 'main';
      const [cmp, prs] = await Promise.all([
        cachedGet(`/repos/${repo}/compare/${liveSha}...${encodeURIComponent(branch)}`),
        cachedGet(`/repos/${repo}/pulls?state=closed&base=${encodeURIComponent(branch)}&sort=updated&direction=desc&per_page=50`),
      ]);
      aheadShas = new Set((cmp.data?.commits || []).map((c) => c.sha));
      // GitHub stops the comparison at 250 commits, the oldest ones: the newest merges would look live.
      truncated = Number(cmp.data?.total_commits || 0) > aheadShas.size;
      pulls = Array.isArray(prs.data) ? prs.data : [];
      // A PR the factory undid may have left the 50 most recently updated: read it alone, so it still comes back.
      for (const r of pulls) {
        const undone = Number(/^claude\/revert-pr-(\d+)$/.exec(r.head?.ref || '')?.[1]);
        // Only a revert that is live hides a change; one still waiting changes nothing to read.
        if (undone && r.merged_at && !aheadShas.has(r.merge_commit_sha) && !pulls.some((p) => p.number === undone)) {
          const original = (await cachedGet(`/repos/${repo}/pulls/${undone}`).catch((e) => { if (e?.rateLimited) throw e; return null; }))?.data;
          if (original?.number) pulls = [...pulls, original];
        }
      }
    }
    view = gapView({ mode, hasSite, deployments, statusesById, aheadShas, pulls, truncated, tagSha });
  } catch (err) {
    // A pause asked by GitHub belongs to the whole refresh (it backs off); the line keeps what it said.
    if (err?.rateLimited) throw err;
    // A project that was showing something keeps a line (« version inconnue »), it does not vanish on one failure.
    const shown = gap.views.get(repo)?.view?.kind && gap.views.get(repo).view.kind !== 'none';
    view = gapView({ mode, hasSite: hasSite || shown, error: true });
  }
  // A line read for another project, or before its stack sheet changed its mode, is never shown (issue #397).
  if (app.current !== project || gapMode(project) !== mode) return;
  gap.views.set(repo, { mode, view });
  drawGap();
}
export function drawGap() {
  const kept = app.current && gap.views.get(app.current.repo.full_name);
  const view = kept && kept.mode === gapMode(app.current) ? kept.view : null;
  const on = Boolean(view && view.kind !== 'none');
  $('prod-gap').hidden = !on;
  $('prod-gap-sep').hidden = !on;
  if (!on) return;
  $('prod-gap').textContent = view.text;
  $('prod-gap').classList.toggle('failed', view.kind === 'failed');
}
const gapDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
$('prod-gap').addEventListener('click', () => {
  const view = gap.views.get(app.current.repo.full_name)?.view;
  if (!view) return;
  const base = app.current.repo.html_url;
  // Only the reason of an unknown version, or a one-line empty state: the list speaks for itself.
  const why = view.why || (view.items.length ? '' : view.kind === 'deploying' ? 'Publication en cours.' : 'Tout est en ligne.');
  $('gap-title').textContent = view.items.length ? 'Pas encore en ligne' : view.kind === 'unknown' ? 'Version en ligne inconnue' : view.kind === 'deploying' ? 'Publication en cours' : 'Site en ligne';
  $('gap-why').textContent = why;
  $('gap-why').hidden = !why;
  $('gap-list').hidden = !view.items.length;
  $('gap-list').replaceChildren(...view.items.map((i) => el('li', {},
    el('a', { href: `${base}/issues/${i.issue}`, target: '_blank', rel: 'noopener' }, i.title), ' ',
    el('span', { class: 'gap-date' }, `validée le ${gapDate(i.mergedAt)}`))));
  $('gap-dialog').showModal();
});
$('gap-close').addEventListener('click', () => $('gap-dialog').close());

// ---- « Mise en production » (issue #294) ----------------------------------------------------------------------
// On a project set to « sur mon accord », validated changes are merged but wait (label factory:awaiting-production on
// their PR) until the owner sends them live together. The button opens an issue the relay acts on.
const AWAITING = 'factory:awaiting-production';
// `sent`: changes already asked for (key → time), hidden from the count until the relay takes their label off. Forgotten
// after 5 minutes, so that a release the relay could not do shows its changes again.
const SENT_MS = 5 * 60_000;
// `changelog`: the project's versioned CHANGELOG as preprod holds it ({ text, last }), or null: then the dialog asks for
// a version number, which the relay writes into it and tags (Pulsar alignment).
const release = { repo: null, pending: [], sent: new Map(), changelog: null };
const wasSent = (key) => Date.now() - (release.sent.get(key) || 0) < SENT_MS;
const awaitingOf = (repo, list) => (list || []).filter((i) => (i.labels || []).some((l) => (l.name || l) === AWAITING) && !wasSent(`${repo}#${i.number}`))
  .sort((a, b) => Date.parse(a.pull_request?.merged_at || a.closed_at || 0) - Date.parse(b.pull_request?.merged_at || b.closed_at || 0));
export async function refreshRelease() {
  const repo = app.current.repo.full_name;
  if (app.current.config.production !== 'approval') { release.pending = []; return drawRelease(); }
  const res = await cachedGet(`/repos/${repo}/issues?state=closed&labels=${encodeURIComponent(AWAITING)}&per_page=100`);
  if (app.current.repo.full_name !== repo) return;
  release.repo = repo;
  release.pending = awaitingOf(repo, res.data);
  release.changelog = release.pending.length ? await versionedChangelog(repo) : null;
  if (app.current.repo.full_name !== repo) return;
  drawRelease();
}
async function versionedChangelog(repo) {
  for (const path of CHANGELOG_PATHS) {
    const res = await cachedGet(`/repos/${repo}/contents/${path}?ref=preprod`).catch(() => null);
    const text = res?.data?.content ? fromBase64(res.data.content) : null;
    const log = readChangelog(text);
    if (log) return { text, last: log.last };
  }
  return null;
}
export function drawRelease() {
  const btn = $('release');
  const on = app.current?.config.production === 'approval';
  btn.hidden = !on;
  placeNewFeature();
  if (!on) return;
  const pending = release.repo === app.current.repo.full_name ? release.pending : [];
  // Issue #370: a release is on its way while its request is still open on the board (one at a time).
  const running = (call('board').issues || []).some((i) => i.labels.includes('factory:production'));
  const b = releaseButton(pending, running);
  // The count in the mono face (Mono Numbers Rule).
  const m = /^(.*) \((\d+)\)$/.exec(b.text);
  btn.replaceChildren(...(m ? [`${m[1]} `, el('span', { class: 'num' }, `(${m[2]})`)] : [b.text]));
  btn.setAttribute('aria-disabled', String(b.disabled));
  btn.title = b.hint;
}
async function sendRelease(pending, version) {
  const repo = app.current.repo.full_name;
  const list = pending.map((p) => `- ${p.title} (#${p.number})`).join('\n');
  const body = `Demandé depuis le tableau de bord.\n\n${version ? `${versionLine(version)}\n\n` : ''}${list}`;
  await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: version ? `Mise en production : version ${version}` : 'Mise en production', labels: ['factory:production'], body }) });
  for (const p of pending) release.sent.set(`${repo}#${p.number}`, Date.now());
  release.pending = release.pending.filter((p) => !wasSent(`${repo}#${p.number}`));
  drawRelease();
}
$('release').addEventListener('click', () => {
  if ($('release').getAttribute('aria-disabled') === 'true') return toast($('release').title || 'Rien en attente');
  const n = release.pending.length;
  $('release-title').textContent = n === 1 ? 'Mettre en production cette modification\u00a0?' : `Mettre en production ces ${n} modifications\u00a0?`;
  $('release-error').hidden = true;
  $('release-list').replaceChildren(...release.pending.map((p) => el('li', {}, p.title)));
  const log = release.repo === app.current.repo.full_name ? release.changelog : null;
  $('release-version').hidden = !log;
  $('release-version-input').value = '';
  $('release-version-hint').textContent = log?.last ? `Dernière version : ${log.last}` : '';
  $('release-dialog').showModal();
});
$('release-cancel').addEventListener('click', () => $('release-dialog').close());
$('release-confirm').addEventListener('click', async () => {
  const btn = $('release-confirm');
  if (btn.disabled) return;
  // A versioned project: the number is always given, never deduced; checked here as the relay will.
  const log = $('release-version').hidden ? null : release.changelog;
  // A phone keyboard may only offer the comma: « 0,18,0 » reads as « 0.18.0 ».
  const version = log ? $('release-version-input').value.trim().replace(/,/g, '.') : null;
  const problem = log ? (version ? versionProblem(log.text, version) : 'Indiquez le numéro de version.') : null;
  if (problem) {
    $('release-error').textContent = problem.charAt(0).toUpperCase() + problem.slice(1);
    $('release-error').hidden = false;
    $('release-version-input').setAttribute('aria-invalid', 'true');
    $('release-version-input').focus();
    return;
  }
  $('release-version-input').removeAttribute('aria-invalid');
  btn.disabled = true;
  $('release-cancel').disabled = true;
  btn.textContent = 'Envoi…';
  $('release-error').hidden = true;
  try {
    await sendRelease(release.pending.slice(), version);
    $('release-dialog').close();
    toast('Mise en production lancée : suivez-la dans l\'onglet Suivi.');
  } catch (e) {
    // Shown inside the dialog: a toast would sit under its backdrop, out of reach of a screen reader.
    $('release-error').textContent = `L'envoi a échoué. ${errorText(e)}`;
    $('release-error').hidden = false;
  } finally {
    btn.disabled = false;
    $('release-cancel').disabled = false;
    btn.textContent = 'Confirmer';
  }
});
// Switching to « sur mon accord » creates the branch the host will publish, on what is live now (main). Switching
// back to « automatique » sends what was waiting at once: otherwise it would stay stuck with no button.
async function productionModeChanged(was, now) {
  if (was === now) return 0;
  const repo = app.current.repo.full_name;
  if (now === 'approval') {
    // Validated changes now wait on preprod, started from main (the relay creates it too if this fails).
    const main = app.current.repo.default_branch || 'main';
    const has = await api(`/repos/${repo}/git/ref/heads/preprod`).catch(() => null);
    if (!has?.object?.sha) {
      const sha = (await api(`/repos/${repo}/git/ref/heads/${encodeURIComponent(main)}`).catch(() => null))?.object?.sha;
      if (sha) await api(`/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/preprod', sha }) }).catch(() => {});
    }
    await refreshRelease().catch(() => {});
    return 0;
  }
  // Read afresh: the board's copy may not be loaded yet, and a change left labelled would have no button any more.
  const fresh = await cachedGet(`/repos/${repo}/issues?state=closed&labels=${encodeURIComponent(AWAITING)}&per_page=100`).then((r) => r.data, () => null);
  const waiting = awaitingOf(repo, fresh || (release.repo === repo ? release.pending : []));
  let sent = 0;
  if (waiting.length) {
    try { await sendRelease(waiting); sent = waiting.length; } catch { toast('Les modifications en attente n\'ont pas pu partir. Repassez en « sur mon accord » puis utilisez le bouton.'); }
  }
  drawRelease();
  return sent;
}

// « Déclarer stable »: projects follow the factory's `stable` branch; this shows the real changes waiting on main
// (the factory's automatic `chore(factory)` commits excluded).
let stableChanges = [];
export async function refreshStable() {
  await boardFirst();
  const cmp = await api(`/repos/${FACTORY_REPO}/compare/stable...main`);
  const view = stableView(cmp);
  stableChanges = view.changes;
  const btn = $('stable');
  btn.hidden = view.hidden;
  btn.textContent = 'Déclarer stable';
  if (view.count !== null) btn.append(' (', el('span', { class: 'num' }, String(view.count)), ')');
}

$('stable').addEventListener('click', async () => {
  const list = stableChanges.slice(-8).map((s) => `• ${s}`).join('\n');
  if (!confirm(`Déclarer stable la version en cours de la factory ?\n\n${list}`)) return;
  const btn = $('stable');
  btn.disabled = true;
  try {
    const issue = await api(`/repos/${FACTORY_REPO}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Déclarer stable', labels: ['factory:release'], body: `Demandé depuis le tableau.\n\n${list}` }),
    });
    toast('Tests en cours : la version stable sera prête dans 2 minutes environ');
    if (issue?.html_url) window.open(issue.html_url, '_blank', 'noopener');
    btn.hidden = true;
  } catch (e) {
    toast(`Impossible de déclarer stable. ${errorText(e)}`);
  } finally {
    btn.disabled = false;
  }
});

function loadScript(src) {
  return new Promise((ok, ko) => document.head.append(el('script', { src, onload: ok, onerror: ko })));
}

async function openPhone() {
  const link = phoneLink(location.href, app.token, app.readToken);
  if (!window.qrcode) await loadScript('vendor/qrcode.js');
  const qr = window.qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  $('phone-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  $('phone-copy').onclick = () => navigator.clipboard.writeText(link).then(() => toast('Lien copié. Ouvrez-le sur votre téléphone.'), () => toast('Copie impossible : scannez le code.'));
  $('phone').showModal();
}

$('site').addEventListener('click', (e) => {
  if (!$('site').classList.contains('add')) return;
  e.preventDefault();
  selectTab('rules');
  $('site-url')?.focus();
});
$('phone-open').addEventListener('click', () => openPhone().catch((err) => toast(errorText(err))));
$('phone-close').addEventListener('click', () => $('phone').close());

$('general-review').addEventListener('click', () => startGeneralReview());
$('ui-polish').addEventListener('click', () => startUiPolish());
$('stack-open').addEventListener('click', () => openStack().catch(() => toast("La fiche ne s'est pas chargée.")));
// A click on the dimmed page around the sheet closes it too (it only shows something).
$('stack').addEventListener('click', (e) => { if (e.target === $('stack')) $('stack').close(); });
$('stack-close').addEventListener('click', () => $('stack').close());

// ---- Stack sheet (issue #242) -----------------------------------------------------------------
// The project's STACK.md, written and kept up to date by the agent; the panel only shows it. The last sheet read is
// shown at once while a fresh copy loads. With no sheet, « Établir la fiche » opens a factory:stack card.
const stackCache = new Map();
const STACK_CARD = { title: 'Établir la fiche stack technique', labels: ['factory:stack'],
  body: 'Fiche stack demandée depuis le tableau : les technologies du projet, la façon dont les données sont stockées, les bibliothèques et les services nécessaires.' };

const stackInline = (text) => inlineParts(frenchSpaces(text)).map((p) => (p.bold ? el('strong', {}, p.text) : document.createTextNode(p.text)));
function stackNodes({ intro, sections }) {
  const nodes = intro.map((t) => el('p', { class: 'stack-intro' }, ...stackInline(t)));
  for (const s of sections) {
    nodes.push(el('h3', {}, frenchSpaces(s.title)));
    for (const b of s.blocks) {
      if (b.type === 'h') nodes.push(el('h4', {}, frenchSpaces(b.text)));
      else if (b.type === 'p') nodes.push(el('p', {}, ...stackInline(b.text)));
      else nodes.push(el('ul', {}, ...b.items.map((i) => el('li', {}, ...stackInline(i)))));
    }
  }
  return nodes;
}

// One short state in place of the sheet (no sheet, sheet on its way, loading error). `focus` takes the keyboard there.
function stackState(text, action = null, focus = false) {
  if ($('stack-body').contains(document.activeElement)) $('stack-close').focus(); // never leave the keyboard on nothing
  $('stack-date').textContent = '';
  $('stack-date').hidden = true;
  $('stack-body').replaceChildren(el('div', { class: 'stack-empty' }, el('p', {}, frenchSpaces(text)), action && el('p', {}, action)));
  if (focus && action) action.focus();
}
const followLink = (url) => url && el('a', { href: url, target: '_blank', rel: 'noopener' }, 'Suivre la demande', el('span', { 'aria-hidden': 'true' }, ' ↗'));

function showStack(repo, sheet) {
  if (app.current?.repo.full_name !== repo) return;
  $('stack-date').textContent = sheet.date;
  $('stack-date').hidden = !sheet.date;
  $('stack-body').replaceChildren(...stackNodes(sheet.parsed));
}

async function openStack() {
  if (!app.current) return;
  const repo = app.current.repo.full_name;
  const cached = stackCache.get(repo);
  if (cached) showStack(repo, cached);
  else stackState('Chargement de la fiche…');
  if (!$('stack').open) $('stack').showModal();
  let file, commits;
  try {
    [file, commits] = await Promise.all([
      api(`/repos/${repo}/contents/${STACK_FILE}`),
      api(`/repos/${repo}/commits?path=${STACK_FILE}&per_page=1`).catch(() => null),
    ]);
  } catch (e) {
    if (app.current?.repo.full_name !== repo) return;
    // A sheet already shown stays: only a fresh copy failed.
    if (cached) { toast("La fiche n'a pas pu être actualisée."); return; }
    const retry = el('button', { type: 'button', onclick: () => openStack().catch(() => {}) }, 'Réessayer');
    stackState("La fiche ne s'est pas chargée.", retry, true);
    return;
  }
  if (app.current?.repo.full_name !== repo) return;
  if (!file?.content) { stackCache.delete(repo); return showNoStack(repo); }
  const sheet = { parsed: parseStack(fromBase64(file.content)), date: stackDate(commits?.[0]?.commit?.committer?.date) };
  stackCache.set(repo, sheet);
  showStack(repo, sheet);
}

// No sheet yet: either its card is already on its way, or the owner can ask for it.
async function showNoStack(repo) {
  const open = ((await api(`/repos/${repo}/issues?labels=factory:stack&state=open&per_page=10`).catch(() => [])) || [])
    .find((i) => !i.pull_request && (i.labels || []).some((l) => (l.name || l) === 'factory:stack'));
  if (app.current?.repo.full_name !== repo) return;
  if (open) return stackState("L'agent rédige la fiche.", followLink(open.html_url));
  const ask = el('button', { type: 'button', onclick: () => askStack(repo, ask) }, 'Établir la fiche');
  stackState('Pas encore de fiche.', ask, true);
}

async function askStack(repo, btn) {
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const card = await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify(STACK_CARD) });
    toast(frenchSpaces("C'est parti : l'agent rédige la fiche."));
    if (app.current?.repo.full_name === repo) {
      stackState("L'agent rédige la fiche.", followLink(card?.html_url));
      $('stack-close').focus();
      call('renderBoard').catch(() => {});
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Établir la fiche';
    toast(`La demande n'est pas partie. ${errorText(e)}`);
  }
}

// Opens a card the relay starts at once (or queues), with no questions and no spec: a general review (factory:audit)
// or a UI improvement (factory:ui-polish, issue #462).
async function startRun(buttonId, { question, title, label, body, done, failed }) {
  if (!app.current) return;
  if (!confirm(question)) return;
  const btn = $(buttonId);
  btn.disabled = true;
  try {
    const issue = await api(`/repos/${app.current.repo.full_name}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, labels: [label], body }),
    });
    toast(done);
    if (issue?.html_url) window.open(issue.html_url, '_blank', 'noopener');
    await call('renderBoard');
  } catch (e) {
    toast(`${failed} ${errorText(e)}`);
  } finally {
    btn.disabled = false;
  }
}
const startGeneralReview = () => startRun('general-review', { question: 'Lancer une review générale de l\'appli ?',
  title: 'Review générale de l\'appli', label: 'factory:audit', body: REVIEW_BODY, done: 'Review générale lancée', failed: 'Impossible de lancer la review.' });
const startUiPolish = () => startRun('ui-polish', { question: 'Lancer une amélioration de l\'interface ?',
  title: 'Amélioration UI de l\'appli', label: 'factory:ui-polish', body: UI_POLISH_BODY, done: 'Amélioration UI lancée', failed: 'Impossible de lancer l\'amélioration.' });

// On a phone the secondary actions fold into « Plus »; on a computer they stay where they were.
const menuItems = [...document.querySelectorAll('[data-menu]')].map((node) => ({ node, home: node.parentNode, next: node.nextSibling }));
const phoneMq = matchMedia(PHONE);
function placeMenu() {
  const menu = $('more-menu');
  // The menu lives in the project view: with no project shown, the items stay in the header.
  // Project actions first, then what concerns the whole factory, « Se déconnecter » last.
  const ofProject = (i) => $('project-view').contains(i.home);
  if (phoneMq.matches && shown().screen === 'project-view') [...menuItems.filter(ofProject), ...menuItems.filter((i) => !ofProject(i))].forEach(({ node }) => menu.append(node));
  else menuItems.slice().reverse().forEach(({ node, home, next }) => home.insertBefore(node, next && next.parentNode === home ? next : null));
  $('more').open = !(phoneMq.matches && shown().screen === 'project-view');
  placeNewFeature();
}
// On a phone, a project with « Mise en production » keeps that button on the top line and
// « Nouvelle fonctionnalité » becomes the first line of « Plus » (issue #343).
function placeNewFeature() {
  const node = $('new-feature');
  const menu = $('more-menu');
  // Read the media query here: drawRelease may run before phoneMq is declared.
  if (matchMedia(PHONE).matches && shown().screen === 'project-view' && !$('release').hidden) {
    // Moving a focused link blurs it: only move it when it is not already first (live refreshes call this).
    if (menu.firstElementChild !== node) menu.prepend(node);
  }
  else if (node.parentNode !== $('release').parentNode) $('release').before(node);
}
placeMenu();
phoneMq.addEventListener('change', placeMenu);
// Tapping outside, Escape or an action closes « Plus » on a phone.
const closeMore = () => { if (phoneMq.matches) $('more').open = false; };
document.addEventListener('click', (e) => { if (!$('more').contains(e.target) || e.target.closest('#more-menu a, #more-menu button')) closeMore(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });

onReset(() => {
  for (const m of [gap.at, gap.busy, gap.again, gap.views]) m.clear();
});
onView((e) => { if (e.what === 'screen') placeMenu(); });
