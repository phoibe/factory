import { projectCandidates } from './lib.mjs?v=28';
import { isIdle } from './live.mjs?v=15';
import { waitedFor } from './waits.mjs?v=2';
import { trustNotes } from './trust.mjs?v=1';
import { errorText } from './errors.mjs';
import { sortProjects, projectDot, blockedNumbers, othersDot, nextDots, dotsDelay, dotsWake, DOT_LABELS, configCheck, readProjectsCache, writeProjectsCache, tokenTag } from './projects.mjs?v=8';
import { PROJECT_KEY, PROJECTS_KEY, $, store, app, el, toast, onReset, sessionExpired, hasUnsaved, onView, show, boardFirst, provide, call } from './common.mjs?v=1';
import { API, api, cachedGet, mapLimit } from './github.mjs?v=1';

provide('renderProjectList', renderProjectList);
provide('settingsSaved', settingsSaved);
provide('setDot', setDot);
provide('wakeDots', wakeDots);

// Each project's status dot (issue #314): full name -> 'blocked' | 'yours' | 'working' | null.
let dots = new Map();
// What is known of each repository's settings file (issue #399): full name -> { pushed, etag, file | null }.
let known = new Map(), accountTag = null;
// Settings saves from this tab, so that a check of the project list started before one does not undo it.
let saves = 0;

// A repository is a project when it holds factory.config.json. The template is not one (it is copied to start
// a project). Repositories are checked a few at a time: firing one request per repository at once can trip
// GitHub's anti-abuse limit, and the refused ones then silently vanished from the list.
// A repository with nothing pushed since the last visit is not read again (its settings file cannot have changed),
// and one read again carries its last ETag (an unchanged file is a free 304, see projects.mjs).
export async function loadProjects() {
  const session = app.token;
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    // Never the browser's copy (kept a minute): a stale push date would skip a file changed meanwhile.
    const batch = await api(`/user/repos?affiliation=owner&sort=pushed&per_page=100&page=${page}`, { cache: 'no-store' });
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const failed = [];
  const seen = new Map();
  const configOf = async (r) => {
    const check = configCheck(r, known);
    if (check.skip) { seen.set(r.full_name, known.get(r.full_name)); return check.file; }
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${API}/repos/${r.full_name}/contents/factory.config.json`, {
          cache: 'no-store',
          headers: { authorization: `Bearer ${session}`, accept: 'application/vnd.github+json', ...(check.etag ? { 'if-none-match': check.etag } : {}) },
        });
        if (res.status === 401) sessionExpired();
        let file = null, etag = null;
        if (res.status === 304) ({ file, etag } = check);
        else if (res.ok) { file = await res.json(); etag = res.headers.get('etag'); }
        else if (res.status !== 404) throw Object.assign(new Error(`${res.status}`), { status: res.status });
        seen.set(r.full_name, { pushed: r.pushed_at, etag, file });
        return file;
      } catch (err) {
        if (err.status === 401) throw err;
        if (attempt >= 2) {
          // GitHub did not answer: the last known file stays, and is read again next time.
          if (known.has(r.full_name)) { seen.set(r.full_name, { ...known.get(r.full_name), pushed: null }); return check.file; }
          failed.push(r.name);
          return null;
        }
        await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
      }
    }
  };
  const found = (await mapLimit(projectCandidates(repos), 4, async (r) => {
    const file = await configOf(r);
    return file ? { repo: r, file } : null;
  })).filter(Boolean);
  if (app.token !== session) return found; // logged out meanwhile: nothing of it is remembered
  known = seen;
  if (failed.length) {
    toast(`GitHub n'a pas répondu pour ${failed.join(', ')}. Nouvel essai dans 30 s.`);
    setTimeout(() => reloadProjects().catch(() => {}), 30_000);
  }
  rememberProjects(found);
  return found;
}

function rememberProjects(list = app.projects) {
  if (accountTag) store.set(PROJECTS_KEY, writeProjectsCache(accountTag, list, known));
}

function settingsSaved(project) { saves++; known.set(project.repo.full_name, { pushed: null, etag: null, file: project.file }); rememberProjects(); }

// What the browser kept of the last visit: the list shows at once (issue #399).
export async function recallProjects() {
  // No digest on a plain-http address (no crypto.subtle): the panel then works without the memory.
  accountTag = await tokenTag(app.token).catch(() => null);
  const remembered = readProjectsCache(store.get(PROJECTS_KEY), accountTag);
  known = remembered?.known || new Map();
  return remembered?.projects || [];
}

// The list of the last visit shows at once; GitHub's answer then replaces it (issue #399). The open project
// stays the same object; it is opened again only when its settings file changed and nothing typed would be lost.
export async function checkProjects() {
  const session = app.token, saved = saves;
  let fresh;
  try {
    fresh = await loadProjects();
  } catch (err) {
    if (err.status !== 401 && app.token === session) setTimeout(() => checkProjects().catch(() => {}), 30_000);
    return;
  }
  if (!app.token || app.token !== session) return; // logged out meanwhile: this list belongs to the previous account
  const was = app.current;
  const namesOf = (list) => JSON.stringify(list.map((p) => p.repo.full_name).sort());
  const before = namesOf(app.projects);
  const mine = was && fresh.find((p) => p.repo.full_name === was.repo.full_name);
  app.projects = fresh.map((p) => (p === mine ? Object.assign(was, { repo: p.repo }) : p));
  if (namesOf(app.projects) !== before) call('refreshRuns'); // a project came or went (not just a new push order)
  call('refreshRunnerAlert').catch(() => {});
  if (!app.projects.length) {
    app.current = null;
    call('stopLive');
    return show('empty');
  }
  if (!mine) { await call('openProject', store.get(PROJECT_KEY)); return refreshDots(); }
  // Saved here during the check: this device's file is the newest one.
  if (saves !== saved) { known.set(was.repo.full_name, { pushed: null, etag: null, file: was.file }); rememberProjects(); }
  else if (mine.file?.sha !== was.file?.sha && !hasUnsaved()) { was.file = mine.file; await call('openProject', was.repo.full_name); }
  else renderProjectList();
  refreshDots();
}

// After a partial load: picks up the projects GitHub did not answer for, without leaving the current one.
async function reloadProjects() {
  const fresh = await loadProjects();
  if (fresh.length <= app.projects.length) return;
  app.projects = fresh;
  if (app.current) renderProjectList(); else await call('openProject', store.get(PROJECT_KEY));
  refreshDots();
}

// ---- Project list (issue #314) ------------------------------------------------------------------
// Always open on the right of a computer; on a phone, the project name opens it full screen.
function dotNode(kind, label = DOT_LABELS[kind]) {
  return kind ? el('span', { class: `pdot pdot-${kind}`, role: 'img', 'aria-label': label, title: label }) : el('span', { class: 'pdot', 'aria-hidden': 'true' });
}

// `projects` keeps GitHub's order (most recently pushed first: the one opened when none was remembered);
// the list shows them alphabetically.
function projectItems() {
  return sortProjects(app.projects).map((p) => {
    const name = p.repo.full_name, here = app.current && app.current.repo.full_name === name;
    return el('li', {}, el('button', { type: 'button', class: 'project-item', 'data-repo': name, 'aria-current': here ? 'true' : null, title: p.repo.name, onclick: () => pickProject(name) },
      dotNode(dots.get(name) || null), el('span', { class: 'pname' }, p.repo.name),
      ...(call('forgotten').has(p.repo.name) ? [el('span', { class: 'pwarn', role: 'img', 'aria-label': 'Pas vu par le serveur de dev', title: 'Pas vu par le serveur de dev' }, '!')] : [])));
  });
}

const OTHER_FORGOTTEN = "Un autre projet n'est pas vu par le serveur de dev";
const OTHERS = { blocked: 'Un autre projet est bloqué', yours: 'Un autre projet attend votre réponse' };
// Redrawn every time a dot changes: the focused project keeps the focus.
export function renderProjectList() {
  const focused = document.activeElement?.closest?.('.project-list') ? document.activeElement.dataset.repo : null;
  $('projects-list').replaceChildren(...projectItems());
  if ($('projects-dialog').open) $('projects-dialog-list').replaceChildren(...projectItems());
  if (focused) document.querySelector(`${$('projects-dialog').open ? '#projects-dialog-list' : '#projects-list'} [data-repo="${CSS.escape(focused)}"]`)?.focus();
  const other = app.current ? othersDot(dots, app.current.repo.full_name) : null;
  const sd = $('switch-dot');
  // Issue #504: no red or blue elsewhere, but another project the dev server does not see: an orange dot.
  const warn = !other && app.current && [...call('forgotten')].some((n) => n !== app.current.repo.name);
  if (warn) {
    sd.hidden = false; sd.className = 'pdot pdot-warn';
    sd.setAttribute('role', 'img'); sd.setAttribute('aria-label', OTHER_FORGOTTEN); sd.title = OTHER_FORGOTTEN;
    return;
  }
  sd.hidden = !other;
  sd.className = other ? `pdot pdot-${other}` : 'pdot';
  if (other) { sd.setAttribute('role', 'img'); sd.setAttribute('aria-label', OTHERS[other]); sd.title = OTHERS[other]; }
  else { sd.removeAttribute('role'); sd.removeAttribute('aria-label'); sd.removeAttribute('title'); }
}

function pickProject(fullName) {
  if ($('projects-dialog').open) $('projects-dialog').close();
  // Like « ← Retour au projet »: the general page closes (its unsaved choices stay in memory, review #556).
  call('closeGeneral');
  if (app.current && app.current.repo.full_name === fullName) return;
  call('openProject', fullName).catch((err) => { toast(`Ce projet ne s'ouvre pas. ${errorText(err)}`); renderProjectList(); });
}

function setDot(repo, dot) {
  if (dots.get(repo) === dot) return;
  dots = nextDots(dots, new Map([[repo, dot]]));
  renderProjectList();
}

// The other projects are checked at start, then every 10 s while the owner is active, 30 s when calm or hidden
// (issue #488). Their requests carry the last ETag (an unchanged
// answer is a free 304), and only blocked cards' comments are read, to tell a real block from « Attend #… ».
// A project GitHub does not answer for keeps its last known dot.
let dotsTimer = null, dotsBusy = false, dotsLast = 0, dotsPausedUntil = 0;
// Active owner: 10 s between rounds; calm for 2 minutes or tab hidden: 30 s (issue #488).
const dotsIdle = () => isIdle(call('board').activity, Date.now(), document.hidden);
async function projectDotOf(repo) {
  try {
    const issues = [];
    for (let page = 1; page <= 10; page++) {
      const { data } = await cachedGet(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
      issues.push(...data);
      if (data.length < 100) break;
    }
    const waits = new Map();
    for (const n of blockedNumbers(issues)) {
      const count = issues.find((i) => i.number === n).comments || 0;
      if (!count) continue;
      // The last page and the one before, as the board reads them.
      const page = Math.max(1, Math.ceil(count / 100));
      const { data } = await cachedGet(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${page}`);
      const before = page > 1 ? (await cachedGet(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${page - 1}`)).data : [];
      waits.set(n, waitedFor(trustNotes([...before, ...data], repo.split('/')[0])));
    }
    return projectDot(issues, waits);
  } catch (err) {
    if (err?.rateLimited) throw err; // the whole round stops and waits, see refreshDots
    return undefined;
  }
}

export async function refreshDots() {
  await boardFirst();
  clearTimeout(dotsTimer);
  // While GitHub's wait runs, every caller waits too: the next round comes at its end.
  const paused = Math.min(dotsPausedUntil - Date.now(), 300_000);
  dotsTimer = setTimeout(refreshDots, paused > 0 ? paused : dotsDelay(0, dotsIdle()));
  if (paused > 0 || !app.token || !app.projects.length || dotsBusy) return;
  dotsBusy = true;
  dotsLast = Date.now();
  const session = app.token;
  try {
    const others = app.projects.filter((p) => !app.current || p.repo.full_name !== app.current.repo.full_name);
    // A project opened meanwhile is skipped: the board reads it, and must see its changes first (shared ETags).
    const found = await mapLimit(others, 2, async (p) => [p.repo.full_name, app.current?.repo.full_name === p.repo.full_name ? undefined : await projectDotOf(p.repo.full_name)]);
    if (app.token !== session) return; // logged out meanwhile: these dots belong to the previous session
    // The project opened meanwhile is drawn from the board's own data.
    const results = new Map(found.filter(([repo]) => !app.current || repo !== app.current.repo.full_name));
    const before = JSON.stringify([...dots]);
    dots = nextDots(dots, results);
    if (JSON.stringify([...dots]) !== before) renderProjectList();
  } catch (err) {
    // GitHub limits the calls: no more requests until the wait it asked for (the dots stay as they were).
    if (err?.rateLimited && app.token === session) {
      const wait = dotsDelay(err.waitMs, dotsIdle());
      dotsPausedUntil = Date.now() + wait;
      clearTimeout(dotsTimer); dotsTimer = setTimeout(refreshDots, wait);
    }
  } finally {
    dotsBusy = false;
  }
}

// A gesture after a calm moment, or a return to the tab, checks the other projects' dots at once (issue #488),
// unless they were just checked (then the next round comes 10 s after it) or GitHub asked to wait.
function wakeDots() {
  if (!app.token) return;
  const wait = dotsWake({ now: Date.now(), last: dotsLast, pausedUntil: dotsPausedUntil });
  if (wait === 0) return refreshDots();
  if (wait != null) { clearTimeout(dotsTimer); dotsTimer = setTimeout(refreshDots, wait); }
}

$('project-switch').addEventListener('click', () => {
  $('projects-dialog-list').replaceChildren(...projectItems());
  $('projects-dialog').showModal();
  $('projects-dialog-list').querySelector('[aria-current="true"]')?.focus();
  refreshDots();
});
$('projects-close').addEventListener('click', () => $('projects-dialog').close());

onReset(() => {
  dots = new Map(); known = new Map(); accountTag = null;
  clearTimeout(dotsTimer); dotsLast = 0; dotsPausedUntil = 0;
});
onView((e) => {
  if (e.what !== 'screen') return;
  // The project list shows with a project only (none to choose from on the empty screen).
  $('projects').hidden = e.screen !== 'project-view';
  document.body.classList.toggle('has-projects', e.screen === 'project-view');
  if (e.screen !== 'project-view' && $('projects-dialog').open) $('projects-dialog').close();
});
