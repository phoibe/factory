import { COLUMNS, boardItems, doneItems, doneView, olderNote, doneAgo, toggleSkill, setPath, toBase64, fromBase64, tokenFromHash, readTokenFromHash, phoneLink, previewFrom, focusComment, issuesUrl, openIssueCount, issuesLinkText, projectCandidates, sessionFrom, chatServerUrl, mergeConfig, tabTitle, reloadBlocker, ideaItems, ideasToShow, deliveredIssue, releaseButton, releaseOutcome, releaseList, siteLink, sessionKeys, stableView } from './lib.mjs?v=29';
import { answerForPr } from './answer.mjs';
import { LABEL as CHAT_LABEL, ASK, ATTACHMENTS_BRANCH, CHAT_BRANCH, chatMessages, chatStatus, titleFrom, markdown, conversations, unread, serverUnread, safeGithubUrl, imagePath, imageBlock, ndjson, serverMessages, serverList, READ_TOKEN_KEY, READ_TOKEN_URL, WRITABLE_TOKEN, CLASSIC_TOKEN, WRITE_PROBES, NO_SHA, probeUrl, fineGrained, hasScopes, probeSaysWritable, readTokenProblem, newConversation, addExchange, upsertIndex, issueRequest, conversationId, defaultConversation, githubBusy, wantedIssues, elapsed, waitingSince, quoteParts, decideProposal, decisionComment, cardTag, openRequests, finishesConversation, createdMarks } from './chat.mjs?v=28';
import { stageMinutes, estimate, humanMinutes, parseEstimate, buildingMinutes, kindParts } from './eta.mjs?v=5';
import { noteClick, noteReturn, pendingNow, untakenAnswer, heldCards, holdLine, goLabel, sentLine } from './pending.mjs?v=4';
import { yoursList, progress, laneFor, actionFor, moves, statusText, pollDelay, timeLine, isIdle, cardChanges, shouldSlide, withoutTimes, syncTimes, cardSig, commentsStale, waitsText, waitsEta, stillWaited, relaunchWaits } from './live.mjs?v=15';
import { waitedFor } from './waits.mjs?v=2';
import { readRelaunch, relaunchLine } from './relaunch.mjs?v=1';
import { trustNotes, trustRead } from './trust.mjs?v=1';
import { gapView, deploymentState, isLiveEnv, tagged } from './production.mjs?v=3';
import { resolveConfig, parseRawConfig, effectiveProduction, MAX_EXTRA_CHECKS } from './config-core.mjs';
import { rateLimitDelay, MAX_PAUSE_MS } from './ratelimit.mjs';
import { watchNumbers } from './numbers.mjs?v=2';
import { setupTabs } from './tabs.mjs';
import { httpError, errorText, emptyOn404, saidError } from './errors.mjs';
import { parisMidnight, runsToday, runsText } from './runs.mjs';
import { parseStack, inlineParts, stackDate, frenchSpaces, deliveryOf, STACK_FILE } from './stack.mjs';
import { CHANGELOG_PATHS, readChangelog, versionProblem, versionLine } from './changelog.mjs';
import { machineLine, repoKey, forgottenProjects, runnerAlertText, RUNNER_KEYS_URL, RUNNER_KEYS_HELP, readRunnersFile } from './machine.mjs?v=4';
import { TRIGGER_FILE, upgradeTrigger, knownTrigger, wakeErrorText, TRIGGER_REFUSED } from './trigger.mjs';
import { MODEL_ROLES, MODEL_FAMILIES, familyLabel, roleModel } from './models.mjs';
import { advancedSummary, effectiveMachine, ADVANCED_KEY } from './settings.mjs';
import { sortProjects, projectDot, blockedNumbers, othersDot, nextDots, dotsDelay, dotsWake, DOT_LABELS, configCheck, readProjectsCache, writeProjectsCache, tokenTag } from './projects.mjs?v=8';

const API = 'https://api.github.com';
const TOKEN_KEY = 'factory.token';
const PROJECT_KEY = 'factory.project';
// The project list of the last visit, with what is known of each repository's settings file (issue #399).
const PROJECTS_KEY = 'factory.projects';
const REVIEW_BODY = ['Review générale demandée depuis le tableau.', '',
  '1. Passe design : critique impeccable de tous les écrans, puis correction de tout ce qu\'elle trouve.',
  '2. Revue de code générale de toute l\'appli, puis correction.', '',
  'Ce qui demande une vraie nouvelle feature devient une issue à part.'].join('\n');
const UI_POLISH_BODY = ['Amélioration UI demandée depuis le tableau.', '',
  'Jusqu\'à 3 tours de critique design de tous les écrans (états vide, erreur, chargement et téléphone compris), chacun suivi de la correction de tout ce qu\'il a trouvé.', '',
  'Seulement l\'apparence et la clarté des écrans : un vrai manque fonctionnel devient une idée à trier.'].join('\n');
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
  keys: () => { try { return Object.keys(localStorage); } catch { return []; } },
};

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

// A phone opened from the QR code receives the token in the fragment: keep it, then wipe it from the address bar.
// The link also carries the chat's read-only token (issue #395).
const linked = tokenFromHash(location.hash);
if (linked) {
  store.set(TOKEN_KEY, linked);
  const read = readTokenFromHash(location.hash);
  if (read) store.set(READ_TOKEN_KEY, read); else store.del(READ_TOKEN_KEY);
  history.replaceState(null, '', location.pathname + location.search);
}
let token = store.get(TOKEN_KEY);
// The only token the chat server ever receives: it can read the projects, never change them (issue #395).
let readToken = store.get(READ_TOKEN_KEY);
// Ask the browser not to clear the token when it tidies its storage (mobile browsers do).
if (token) navigator.storage?.persist?.().catch(() => {});
let catalog, defaults, projects = [], current = null;
// Private projects the dev server's check did not see, and the timer of their banner (issue #504).
let forgotten = new Set(), runnerTimer = null, runnerRound = 0;
// Each project's status dot (issue #314): full name -> 'blocked' | 'yours' | 'working' | null.
let dots = new Map();
// What is known of each repository's settings file (issue #399): full name -> { pushed, etag, file | null }.
let known = new Map(), accountTag = null;
// Settings saves from this tab, so that a check of the project list started before one does not undo it.
let saves = 0;

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

// The projects whose trigger the panel checked this session, and those known up to date (issue #427, see updateTrigger).
const triggers = { done: new Set(), fresh: new Set() };

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), Math.max(4000, msg.length * 80));
}

// Forgets the session (tokens, projects, caches, live board): the next account never sees it. `forget` (logging out)
// also removes every stored project name (open project, read answers, clicks on their way); a refused token keeps them,
// so the owner pasting a renewed token finds the same project and the same unread marks.
function resetSession({ forget = false } = {}) {
  triggers.done.clear(); triggers.fresh.clear(); openReleases.clear(); doneHeight.clear();
  store.del(TOKEN_KEY); store.del(PROJECTS_KEY); store.del(READ_TOKEN_KEY);
  if (forget) for (const k of sessionKeys(store.keys())) store.del(k);
  token = null; readToken = null; projects = []; current = null; dots = new Map(); known = new Map(); accountTag = null; etags.clear(); boards.clear(); for (const m of [gap.at, gap.busy, gap.again, gap.views]) m.clear(); clearTimeout(dotsTimer); dotsLast = 0; dotsPausedUntil = 0; forgotten = new Set(); clearTimeout(runnerTimer); $('runner-alert').hidden = true;
  clearTimeout(chat.timer); clearTimeout(live.timer); clearInterval(live.tick); live.tick = null;
  Object.assign(live, { repo: null, issues: null, drawn: false, busy: null });
  Object.assign(general, { machine: 'dev-server', models: {}, saved: '', unreadable: false, from: null, read: null, shown: null }); closeGeneral();
}

// A refused token (expired, revoked) sends the owner back to the login page instead of leaving a frozen panel.
function sessionExpired() {
  if (!token) return;
  resetSession();
  $('login-error').textContent = 'GitHub a refusé le jeton : il a sans doute expiré. Créez-en un nouveau et collez-le ici.';
  show('login');
}

// Issue #557: on a public project, an outsider's issue or PR loses its factory notes before anything reads it. A
// project the panel does not know counts as public.
const guardRead = (path, data) => trustRead(path, data, (full) => projects.find((p) => p.repo.full_name === full)?.repo.private === true);

async function api(path, init = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (res.status === 404 && emptyOn404(init)) return null; // a refused write fails: never shown as done (issue #398)
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw httpError(res.status, (await res.json().catch(() => ({}))).message, init.method);
  return res.status === 204 ? null : guardRead(path, await res.json());
}

// A phone screen (the same width as the CSS's phone rules).
const PHONE = '(max-width: 600px)';

function show(id) {
  for (const s of ['login', 'empty', 'project-view']) $(s).hidden = s !== id;
  if (id !== 'project-view') closeGeneral();
  $('general-open').hidden = id !== 'project-view'; // the page lives inside the project screen
  $('nav').hidden = id === 'login';
  // The project list shows with a project only (none to choose from on the empty screen).
  $('projects').hidden = id !== 'project-view';
  document.body.classList.toggle('has-projects', id === 'project-view');
  if (id !== 'project-view' && document.body.classList.contains('chat-fullscreen')) setChatFull(false);
  if (id !== 'project-view' && $('projects-dialog').open) $('projects-dialog').close();
  if (typeof placeMenu === 'function') placeMenu();
}

// A repository is a project when it holds factory.config.json. The template is not one (it is copied to start
// a project). Repositories are checked a few at a time: firing one request per repository at once can trip
// GitHub's anti-abuse limit, and the refused ones then silently vanished from the list.
// A repository with nothing pushed since the last visit is not read again (its settings file cannot have changed),
// and one read again carries its last ETag (an unchanged file is a free 304, see projects.mjs).
async function loadProjects() {
  const session = token;
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
  if (token !== session) return found; // logged out meanwhile: nothing of it is remembered
  known = seen;
  if (failed.length) {
    toast(`GitHub n'a pas répondu pour ${failed.join(', ')}. Nouvel essai dans 30 s.`);
    setTimeout(() => reloadProjects().catch(() => {}), 30_000);
  }
  rememberProjects(found);
  return found;
}

function rememberProjects(list = projects) {
  if (accountTag) store.set(PROJECTS_KEY, writeProjectsCache(accountTag, list, known));
}

// The list of the last visit shows at once; GitHub's answer then replaces it (issue #399). The open project
// stays the same object; it is opened again only when its settings file changed and nothing typed would be lost.
async function checkProjects() {
  const session = token, saved = saves;
  let fresh;
  try {
    fresh = await loadProjects();
  } catch (err) {
    if (err.status !== 401 && token === session) setTimeout(() => checkProjects().catch(() => {}), 30_000);
    return;
  }
  if (!token || token !== session) return; // logged out meanwhile: this list belongs to the previous account
  const was = current;
  const namesOf = (list) => JSON.stringify(list.map((p) => p.repo.full_name).sort());
  const before = namesOf(projects);
  const mine = was && fresh.find((p) => p.repo.full_name === was.repo.full_name);
  projects = fresh.map((p) => (p === mine ? Object.assign(was, { repo: p.repo }) : p));
  if (namesOf(projects) !== before) refreshRuns(); // a project came or went (not just a new push order)
  refreshRunnerAlert().catch(() => {});
  if (!projects.length) {
    current = null;
    clearTimeout(live.timer); clearInterval(live.tick); live.tick = null;
    return show('empty');
  }
  if (!mine) { await openProject(store.get(PROJECT_KEY)); return refreshDots(); }
  // Saved here during the check: this device's file is the newest one.
  if (saves !== saved) { known.set(was.repo.full_name, { pushed: null, etag: null, file: was.file }); rememberProjects(); }
  else if (mine.file?.sha !== was.file?.sha && !hasUnsaved()) { was.file = mine.file; await openProject(was.repo.full_name); }
  else renderProjectList();
  refreshDots();
}

// Something typed or in flight that reopening the project, or reloading the panel, would lose.
const unsavedParts = () => ({
  settings: Boolean(current && JSON.stringify(current.config) !== current.saved) || generalDirty(),
  message: Boolean($('chat-input')?.value.trim()) || chat.files.length > 0,
  answering: Boolean(chat.live),
});
const hasUnsaved = () => reloadBlocker(unsavedParts()) !== null;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// After a partial load: picks up the projects GitHub did not answer for, without leaving the current one.
async function reloadProjects() {
  const fresh = await loadProjects();
  if (fresh.length <= projects.length) return;
  projects = fresh;
  if (current) renderProjectList(); else await openProject(store.get(PROJECT_KEY));
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
  return sortProjects(projects).map((p) => {
    const name = p.repo.full_name, here = current && current.repo.full_name === name;
    return el('li', {}, el('button', { type: 'button', class: 'project-item', 'data-repo': name, 'aria-current': here ? 'true' : null, title: p.repo.name, onclick: () => pickProject(name) },
      dotNode(dots.get(name) || null), el('span', { class: 'pname' }, p.repo.name),
      ...(forgotten.has(p.repo.name) ? [el('span', { class: 'pwarn', role: 'img', 'aria-label': 'Pas vu par le serveur de dev', title: 'Pas vu par le serveur de dev' }, '!')] : [])));
  });
}

const OTHER_FORGOTTEN = "Un autre projet n'est pas vu par le serveur de dev";
const OTHERS = { blocked: 'Un autre projet est bloqué', yours: 'Un autre projet attend votre réponse' };
// Redrawn every time a dot changes: the focused project keeps the focus.
function renderProjectList() {
  const focused = document.activeElement?.closest?.('.project-list') ? document.activeElement.dataset.repo : null;
  $('projects-list').replaceChildren(...projectItems());
  if ($('projects-dialog').open) $('projects-dialog-list').replaceChildren(...projectItems());
  if (focused) document.querySelector(`${$('projects-dialog').open ? '#projects-dialog-list' : '#projects-list'} [data-repo="${CSS.escape(focused)}"]`)?.focus();
  const other = current ? othersDot(dots, current.repo.full_name) : null;
  const sd = $('switch-dot');
  // Issue #504: no red or blue elsewhere, but another project the dev server does not see: an orange dot.
  const warn = !other && current && [...forgotten].some((n) => n !== current.repo.name);
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
  closeGeneral();
  if (current && current.repo.full_name === fullName) return;
  openProject(fullName).catch((err) => { toast(`Ce projet ne s'ouvre pas. ${errorText(err)}`); renderProjectList(); });
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
// One ETag map for the dots and the board (issue #327): a first open reuses what the dots already read.
const etags = new Map();
let dotsTimer = null, dotsBusy = false, dotsLast = 0, dotsPausedUntil = 0;
// Active owner: 10 s between rounds; calm for 2 minutes or tab hidden: 30 s (issue #488).
const dotsIdle = () => isIdle(live.activity, Date.now(), document.hidden);
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

// The open board's own requests go first: everything else the page reads (the other projects' dots, the day's agent
// starts, the gap with production, « Déclarer stable ») waits for its first cards, at most BOARD_FIRST_MS. Fired all
// at once, these heavy lists (about 1 MB a page) shared the connection with the board, which took 8 to 20 s to show.
const BOARD_FIRST_MS = 8000;
let boardGate = Promise.resolve();
let gateOpener = null; // set while the gate is held
function holdForBoard() {
  if (gateOpener) return; // already held (a project opened while the first one loads): the board on screen opens it
  boardGate = new Promise((ok) => {
    const timer = setTimeout(() => openBoardGate(), BOARD_FIRST_MS);
    gateOpener = () => { clearTimeout(timer); gateOpener = null; ok(); };
  });
}
function openBoardGate() { gateOpener?.(); }
holdForBoard(); // from the panel's start: the first board is the one waited for

async function refreshDots() {
  await boardGate;
  clearTimeout(dotsTimer);
  // While GitHub's wait runs, every caller waits too: the next round comes at its end.
  const paused = Math.min(dotsPausedUntil - Date.now(), 300_000);
  dotsTimer = setTimeout(refreshDots, paused > 0 ? paused : dotsDelay(0, dotsIdle()));
  if (paused > 0 || !token || !projects.length || dotsBusy) return;
  dotsBusy = true;
  dotsLast = Date.now();
  const session = token;
  try {
    const others = projects.filter((p) => !current || p.repo.full_name !== current.repo.full_name);
    // A project opened meanwhile is skipped: the board reads it, and must see its changes first (shared ETags).
    const found = await mapLimit(others, 2, async (p) => [p.repo.full_name, current?.repo.full_name === p.repo.full_name ? undefined : await projectDotOf(p.repo.full_name)]);
    if (token !== session) return; // logged out meanwhile: these dots belong to the previous session
    // The project opened meanwhile is drawn from the board's own data.
    const results = new Map(found.filter(([repo]) => !current || repo !== current.repo.full_name));
    const before = JSON.stringify([...dots]);
    dots = nextDots(dots, results);
    if (JSON.stringify([...dots]) !== before) renderProjectList();
  } catch (err) {
    // GitHub limits the calls: no more requests until the wait it asked for (the dots stay as they were).
    if (err?.rateLimited && token === session) {
      const wait = dotsDelay(err.waitMs, dotsIdle());
      dotsPausedUntil = Date.now() + wait;
      clearTimeout(dotsTimer); dotsTimer = setTimeout(refreshDots, wait);
    }
  } finally {
    dotsBusy = false;
  }
}

async function openProject(fullName) {
  const next = projects.find((p) => p.repo.full_name === fullName) || projects[0];
  // A broken settings file opens with the default settings: it must never lock the panel on that project.
  const { raw, warning } = parseRawConfig(next.file?.content ? fromBase64(next.file.content) : null);
  if (warning) toast('Les paramètres de ce projet sont illisibles : les paramètres par défaut sont affichés.');
  const switched = current && current.repo.full_name !== next.repo.full_name;
  current = next;
  // Never the old project's cards under the new name (issue #319): its late answers are dropped. The new one shows
  // at once from this tab's memory, or from what the project list knows, otherwise grey cards (issue #327).
  if (live.repo !== next.repo.full_name) enterBoard(next.repo.full_name);
  holdForBoard();
  store.set(PROJECT_KEY, current.repo.full_name);
  renderProjectList();
  const { config, warnings } = resolveConfig(raw, catalog, defaults);
  current.config = config;
  current.saved = JSON.stringify(config);
  for (const w of warnings) console.warn(w);
  $('project-name').textContent = current.repo.name;
  $('project-switch-name').textContent = current.repo.name;
  // The stack sheet read at the last visit stays until it is read again: the mode shows at once (issue #397).
  current.delivery ??= null;
  drawSub();
  drawGap();
  refreshGap(true).catch(() => {});
  const base = current.repo.html_url;
  $('new-feature').href = `${base}/issues/new?template=feature.yml`;
  $('new-bug').href = `${base}/issues/new?template=bug.yml`;
  $('issues-link').href = issuesUrl(base);
  $('issues-link').textContent = issuesLinkText(null);
  // Everything under the name starts over at once, before any request (issue #319); the board's grey cards come with renderBoard.
  show('project-view');
  // Another project always opens on « Suivi » (issue #475); a redraw of the same project keeps the tab.
  if (switched) selectTab('board');
  resetChat();
  renderRules();
  loadMachine(current).catch(() => {});
  drawRelease();
  const opened = current;
  boardGate.then(() => (current === opened ? refreshRelease() : null)).catch(() => {});
  loadDelivery(current).catch(() => {});
  updateTrigger(current.repo).catch((e) => console.warn('Trigger not checked', e));
  await renderBoard();
  if (!live.tick) startLive();
}

// ---- Live board -------------------------------------------------------------------------------
// The board polls GitHub every 8 s while the owner is active (30 s after 2 minutes of calm). Requests carry the last ETag, so an unchanged
// answer is a 304 that GitHub does not count against the hourly limit.
const live = { repo: null, issues: null, events: [], eventsDeep: false, previews: new Map(), targets: new Map(), sessions: new Map(), plans: new Map(), releases: new Map(), waits: new Map(), answered: new Map(), read: new Map(), pauseMs: 0, prev: null, sigs: null, done: [], doneSig: null, doneLoaded: false, drawn: false, instant: false, activity: Date.now(), last: 0, failures: 0, timer: null, tick: null, busy: null };

// Each project's board, kept while this tab stays open (issue #327; never in localStorage: a reload starts over).
const boards = new Map();
const BOARD_KEYS = ['issues', 'events', 'eventsDeep', 'previews', 'targets', 'sessions', 'plans', 'releases', 'waits', 'answered', 'read', 'prev', 'done', 'doneLoaded', 'doneTried', 'last'];
const blankBoard = () => ({ issues: null, events: [], eventsDeep: false, previews: new Map(), targets: new Map(), sessions: new Map(), plans: new Map(), releases: new Map(), waits: new Map(), answered: new Map(), read: new Map(), prev: null, done: [], doneLoaded: false, doneTried: false, last: 0 });
// The open requests the project list already read in the background for its dot (all pages, or nothing).
function knownIssues(repo) {
  const issues = [];
  for (let page = 1; page <= 10; page++) {
    const hit = etags.get(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    if (!hit) return null;
    issues.push(...hit.data);
    if (hit.data.length < 100) break;
  }
  return issues.map((i) => ({ ...i, labels: i.labels.map((l) => l.name ?? l) }));
}
// What the blocked cards wait for, from the comment pages the project list read for its dot: a card that only
// waits for another request's merge never shows in « À vous de jouer » meanwhile (issue #298).
function knownWaits(repo, issues) {
  const waits = new Map();
  for (const n of blockedNumbers(issues || [])) {
    const count = issues.find((i) => i.number === n).comments || 0;
    const page = Math.max(1, Math.ceil(count / 100));
    const last = count && etags.get(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${page}`);
    if (!last) continue;
    const before = page > 1 ? etags.get(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${page - 1}`)?.data || [] : [];
    waits.set(n, waitedFor(trustNotes([...before, ...last.data], repo.split('/')[0])));
  }
  return waits;
}
// Puts the left project's board away and takes out the new one's. The drawing state starts over: the board on
// screen is the other project's (card numbers repeat across projects).
function enterBoard(repo) {
  if (live.repo && live.issues) boards.set(live.repo, Object.fromEntries(BOARD_KEYS.map((k) => [k, live[k]])));
  const issues = boards.has(repo) ? null : knownIssues(repo);
  const known = boards.get(repo) || { issues, waits: knownWaits(repo, issues) };
  // `synced`: the first answers since coming back are always drawn, even « unchanged » ones (the ETags are shared
  // with the project list, which may have fetched a change this board has not drawn yet).
  // `last` comes with the board (when it was read), `failures` starts over: the line under « À vous de jouer » never
  // shows the left project's lost connection or « à jour à l'instant » (issue #397).
  Object.assign(live, blankBoard(), known, { repo, sigs: null, doneSig: null, yoursSig: null, ideasSig: null, drawn: false, synced: false, failures: 0 });
}
const LANES = [
  ['yours', 'À vous de jouer', 'Rien ne vous attend.'],
  ['working', 'Les agents travaillent', 'Aucun agent ne travaille en ce moment.'],
  ['queued', 'En file d\'attente', 'La file est vide.'],
];

// « Too many requests »: a short wait is spent here, then the same request goes again; a long one stops this
// refresh quietly (no « connexion perdue »), and the next one comes after the wait GitHub asked for.
async function cachedGet(path, cache = etags) {
  const hit = cache.get(path);
  let res;
  for (let pauses = 0; ; pauses++) {
    res = await fetch(API + path, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...(hit ? { 'if-none-match': hit.etag } : {}) },
    });
    const wait = rateLimitDelay(res.status, res.headers);
    if (wait === null) break;
    if (wait > MAX_PAUSE_MS || pauses >= 1) throw Object.assign(new Error('rate limited'), { rateLimited: true, waitMs: wait });
    await new Promise((ok) => setTimeout(ok, wait));
  }
  if (res.status === 304 && hit) return { data: hit.data, changed: false };
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw httpError(res.status, (await res.json().catch(() => ({}))).message);
  const data = guardRead(path, await res.json());
  const etag = res.headers.get('etag');
  if (etag) cache.set(path, { etag, data });
  return { data, changed: true };
}

function mergeEvents(fresh) {
  const seen = new Set(live.events.map((e) => e.id));
  live.events = [...fresh.filter((e) => !seen.has(e.id)), ...live.events];
}

async function refresh() {
  if (!current) return;
  const repo = current.repo.full_name;
  if (live.busy?.repo === repo) { live.again = true; return; }
  // A refresh of a project left meanwhile does not hold this one up: it notices it was replaced and drops its answers.
  const run = { repo };
  live.busy = run;
  live.again = false;
  if (live.repo !== repo) enterBoard(repo);
  const same = () => live.busy === run && live.repo === repo && current?.repo.full_name === repo;
  const soft = (fallback) => (e) => (e?.rateLimited ? Promise.reject(e) : fallback);
  try {
    // Every page: beyond 100 open items, the others would silently vanish from the board.
    const openIssues = async () => {
      const all = { data: [], changed: false };
      for (let page = 1; page <= 10; page++) {
        const res = await cachedGet(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
        all.data.push(...res.data);
        all.changed ||= res.changed;
        if (res.data.length < 100) break;
      }
      return all;
    };
    // The first requests go together (issue #327). Requests the agent closed by itself (already done, duplicate,
    // obsolete) are shown in « Terminé » with their reason.
    // « Terminé » (two lists of about 1 to 2 MB at their first read): on a board's first read the open cards come
    // first, alone, and these lists follow once they are drawn; afterwards (cheap unchanged answers) they go together.
    const readDone = () => Promise.all([
      cachedGet(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`).catch(soft({ data: null, changed: false })),
      cachedGet(`/repos/${repo}/issues?state=closed&sort=updated&direction=desc&per_page=100`).catch(soft({ data: null, changed: false })),
    ]);
    const early = live.doneLoaded ? readDone() : null;
    early?.catch(() => {}); // its failure is read below, after the open cards
    const [issues, ev] = await Promise.all([
      openIssues(),
      cachedGet(`/repos/${repo}/issues/events?per_page=100&page=1`).catch(soft({ data: [], changed: false })),
    ]);
    if (!same()) return; // the owner switched project meanwhile
    // More than a page of events while away: the older pages are read again, so that no step is missing.
    if (live.eventsDeep && ev.data.length === 100 && live.events.length && !ev.data.some((e) => live.events.some((k) => k.id === e.id))) live.eventsDeep = false;
    mergeEvents(ev.data); // even unchanged: a board left before its first load kept no events
    live.issues = issues.data.map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
    $('issues-link').textContent = issuesLinkText(openIssueCount(live.issues));
    // The cards show now; « Terminé » and their details (preview, session, estimate) come in below, in their place.
    if (!live.drawn || !live.synced || issues.changed || ev.changed) drawBoard();
    live.synced = true;
    openBoardGate();
    // Read alongside the cards' details below, drawn as soon as it arrives.
    const doneRead = (early || readDone()).then(([closed, closedIssues]) => {
      // A failed read is not « Rien de livré »: « Terminé » waits for a list it could read.
      if (!same() || !closed.data) return;
      live.done = doneItems(closed.data, closedIssues.data || []); live.doneLoaded = true; live.doneTried = true;
      if (closed.changed || closedIssues.changed || live.doneSig == null) drawBoard();
    });
    // The older history of steps (the cards' durations), read once per project.
    const deepEvents = async () => {
      if (live.eventsDeep) return false;
      let more = false;
      for (let page = 2; page <= 3 && ev.data.length === 100; page++) {
        const batch = await api(`/repos/${repo}/issues/events?per_page=100&page=${page}`).catch(() => []);
        if (!same()) return false;
        mergeEvents(batch);
        more ||= batch.length > 0;
        if (batch.length < 100) break;
      }
      if (same()) live.eventsDeep = true;
      return more;
    };
    // From each card's latest comments: the PR's preview link (Vercel bot or the factory's message),
    // and the message the card should open on, instead of the top of the issue.
    // Only the cards that may have changed are read, several at a time rather than one after the other.
    let previewsChanged = false;
    let limited = null;
    const quiet = (e) => { if (e?.rateLimited) limited = e; return null; };
    const stale = boardItems(live.issues).filter((c) => commentsStale(c, live.read.get(c.number), { preview: live.previews.get(c.number) }));
    const comments = mapLimit(stale, 8, async (c) => {
      if (!same()) return; // left meanwhile: no more requests for this project
      const page = Math.max(1, Math.ceil((c.comments || 0) / 100));
      const res = c.comments ? await cachedGet(`/repos/${repo}/issues/${c.number}/comments?per_page=100&page=${page}`).catch(quiet) : { data: [] };
      if (!res || !same()) return;
      // The agent's estimate may sit on the page before the last one on a long thread.
      const before = page > 1 ? await cachedGet(`/repos/${repo}/issues/${c.number}/comments?per_page=100&page=${page - 1}`).catch(quiet) : { data: [] };
      if (!before || !same()) return;
      live.read.set(c.number, cardSig(c));
      const url = c.pull_request ? previewFrom(res.data) : null;
      const target = focusComment(res.data);
      // Only the owner's and the factory's own invisible notes count (issue #339).
      const thread = trustNotes([...before.data, ...res.data], repo.split('/')[0]);
      const session = sessionFrom(thread);
      if (live.sessions.get(c.number) !== session) {
        live.sessions.set(c.number, session);
        previewsChanged = true;
      }
      // A blocked card that only waits for other requests' merge (issue #298).
      const waits = c.labels.includes('factory:blocked') ? waitedFor(thread) : [];
      if (JSON.stringify(live.waits.get(c.number) || []) !== JSON.stringify(waits)) {
        live.waits.set(c.number, waits);
        previewsChanged = true;
      }
      // An answer of the owner the factory has not taken yet (GitHub late to start it): the card stays on hold.
      const answered = untakenAnswer(res.data, repo.split('/')[0]);
      if ((live.answered.get(c.number) ?? null) !== answered) {
        if (answered == null) live.answered.delete(c.number); else live.answered.set(c.number, answered);
        previewsChanged = true;
      }
      const plan = parseEstimate(thread);
      if (JSON.stringify(live.plans.get(c.number) ?? null) !== JSON.stringify(plan)) {
        live.plans.set(c.number, plan);
        previewsChanged = true;
      }
      // Issue #370: where a « Mise en production » stands, read from the relay's hidden note on its comments.
      if (c.column === 'release') {
        const outcome = releaseOutcome([...before.data, ...res.data]);
        if (JSON.stringify(live.releases.get(c.number) ?? null) !== JSON.stringify(outcome)) {
          live.releases.set(c.number, outcome);
          previewsChanged = true;
        }
      }
      if (live.previews.get(c.number) !== url || live.targets.get(c.number) !== target) {
        live.previews.set(c.number, url);
        live.targets.set(c.number, target);
        previewsChanged = true;
      }
    });
    // Issue #370: a finished « Mise en production » shows its outcome in « Terminé ». Its note lives in its comments,
    // which the done list does not carry; read it once for each release not already cached (while it was on the board).
    const doneReleases = async () => {
      const need = (live.done || []).filter((d) => d.release && !live.releases.has(d.number));
      await mapLimit(need, 6, async (d) => {
        if (!same()) return;
        const res = await cachedGet(`/repos/${repo}/issues/${d.number}/comments?per_page=100`).catch(quiet);
        if (!res || !same()) return;
        live.releases.set(d.number, releaseOutcome(res.data));
        previewsChanged = true;
      });
    };
    const release = current.config.production === 'approval' ? refreshRelease().catch(soft(null)) : null;
    const [eventsChanged] = await Promise.all([deepEvents(), comments, release, doneRead.then(doneReleases), refreshGap()]);
    if (!same()) return;
    setDot(repo, projectDot(live.issues, live.waits));
    if (limited) live.pauseMs = Math.min(limited.waitMs, 5 * 60_000);
    live.last = Date.now();
    live.failures = 0;
    if (previewsChanged || eventsChanged) drawBoard();
  } catch (err) {
    // A failure of a project left meanwhile says nothing about the one on screen.
    if (!same()) return;
    // A pause, not a lost connection; at most 5 min, so an empty first board does not stay without news for long.
    if (err?.rateLimited) { live.pauseMs = Math.min(err.waitMs, 5 * 60_000); return; }
    live.failures++;
    if (!live.issues) $('board').replaceChildren(el('div', { class: 'board-error', role: 'alert' }, el('strong', {}, 'Connexion perdue'), el('span', {}, 'GitHub ne répond pas pour le moment.'), el('button', { type: 'button', class: 'secondary', onclick: () => refresh() }, 'Réessayer')));
  } finally {
    if (live.repo === repo) openBoardGate(); // a board that could not load holds nothing up
    if (live.busy === run) {
      live.busy = null;
      drawStatus();
      if (live.again) refresh(); else schedule();
    }
  }
}

function schedule() {
  clearTimeout(live.timer);
  if (!current) return;
  const delay = Math.max(pollDelay(live.failures, isIdle(live.activity, Date.now(), document.hidden)), live.pauseMs);
  live.pauseMs = 0;
  live.timer = setTimeout(refresh, delay);
}

// Never read yet (a first open): no « à jour » taken from another project.
const liveText = () => statusText(live.failures, live.last ? Date.now() - live.last : null);
function drawStatus() {
  const s = document.querySelector('.live');
  if (!s) return;
  const down = live.failures > 0;
  s.classList.toggle('down', down);
  s.classList.toggle('pending', !down && !live.last); // never read yet: no green « tout va bien » dot
  s.querySelector('.live-text').textContent = liveText();
}

function stepTrack(c) {
  const p = progress(c);
  if (!p) return null;
  return el('div', { class: 'step' },
    el('ol', { class: 'track', 'aria-hidden': 'true' },
      Array.from({ length: p.total }, (_, i) => el('li', { class: i < p.index ? 'done' : i === p.index ? 'now' : '' }))),
    el('span', { class: 'step-name' }, `Étape ${p.index + 1}/${p.total} · ${p.name}${c.column === 'queued' || c.waits?.length ? ' à venir' : ''}`));
}

// The button names what it asks for, not a generic « Répondre ».
const REPLY_LABELS = { spec: 'Valider la spec', visual: 'Voir les captures', acceptance: 'Voir la recette', blocked: 'Débloquer' };
const replyLabel = (column) => REPLY_LABELS[column] || 'Répondre';
// The card's answer: a « go » (spec) or « Ok » (captures, recette) button that sends at the touch (issue #450), or the
// link to the message to answer. The button's spoken name follows what a press does: send, or nothing while it is sent.
const goWord = (c) => (c.reply === 'ok' ? 'ok' : 'go');
const goText = (c) => (c.reply === 'ok' ? 'Ok' : 'go');
// « Envoi… » only while the answer leaves, then « Envoyé ✓ » until the card changes column (issue #517).
const goState = (c) => goLabel(goWord(c), { sending: sendingGo.has(goKey(c)), sent: isSent(c) });
const goName = (c) => `${goState(c).name} pour #${c.number} ${c.title}`;
// An « ok » already sent stays sent after a reload: its hold (see sendGo) remembers it on this device.
const isSent = (c) => sentGo.has(goKey(c)) || (c.reply === 'ok' && pendingState()[c.number]?.sent === true);
const goButton = (c) => el('button', { type: 'button', disabled: isSent(c), class: 'go', 'data-go': String(c.number), 'data-key': `go-${c.number}`, 'aria-label': goName(c), onclick: (e) => answerGo(c, e.currentTarget) }, goState(c).text);
// In « À vous de jouer » the card is narrow: the quiet buttons say it in one word (their spoken name keeps the full label),
// so that « Ok » and its two quiet buttons fit on one row.
const SHORT_LABELS = { visual: 'Captures', acceptance: 'Recette' };
const replyLink = (c, short = false) => el('a', { class: 'button secondary', href: live.targets.get(c.number) || c.html_url, target: '_blank', rel: 'noopener',
  'aria-label': short && SHORT_LABELS[c.column] ? replyLabel(c.column) : null }, short && SHORT_LABELS[c.column] || replyLabel(c.column));
// The buttons of a card waiting for the owner, in order. In « À vous de jouer » the blue « go » or « Ok » comes first, then the
// preview and the page to read; a card waiting for GitHub keeps its former order (« go » after the preview).
const answerButtons = (c, previewLink, waiting = false) => (c.reply === 'ok' ? [goButton(c), previewLink, replyLink(c, !waiting)]
  : c.reply === 'go' ? (waiting ? [previewLink, goButton(c)] : [goButton(c), previewLink]) : [previewLink, replyLink(c, !waiting)]);

// The titles of the project's requests, open or done, to name the one a card waits for.
const requestTitles = () => new Map([...(live.done || []).map((d) => [d.issue, d.title]), ...(live.issues || []).map((i) => [i.number, i.title])]);

// « En attente de GitHub », or, once GitHub is late with an answer, a real warning (its minutes move in place).
const holdStatus = (hold) => hold.late
  ? el('p', { class: 'alert', 'data-time': '' }, hold.text)
  : el('p', { class: 'doing' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), hold.text);

// Issue #370: a « Mise en production » card. While it runs it shows its step and the changes going live; the change
// list comes from the relay's note once it lands, else from the request body.
const releaseStep = (c) => (c.labels.includes('factory:release-checking') ? 'Vérification du site en ligne' : 'Mise en ligne en cours');
const releaseChanges = (c) => (live.releases.get(c.number)?.prs?.length ? live.releases.get(c.number).prs : releaseList(c.body));
const changeList = (changes) => (changes.length ? el('ul', { class: 'release-changes' }, changes.map((p) => el('li', {}, p.title))) : null);

// Issue #430: in « Terminé » the list of changes folds behind « N modifications », so a big release no longer stretches
// its row. Folded on every load; one the owner opened stays open across board redraws (kept in memory only).
const openReleases = new Set();
// Issue #435: while nothing is open the « Terminé » rows share the tallest card's height. Opening a list ends that rule,
// so the height the cards had just before is kept (also across redraws, one per project) and the other cards do not move.
const doneHeight = new Map();
const foldedChanges = (key, changes) => el('details', {
  class: 'release-fold',
  open: openReleases.has(key) || null,
  ontoggle: (e) => {
    if (e.target.open) openReleases.add(key); else openReleases.delete(key);
    const lane = e.target.closest('.lane-done');
    if (lane && !lane.querySelector('.release-fold[open]')) { doneHeight.delete(current?.repo.full_name); lane.style.removeProperty('--done-card-height'); }
  },
},
el('summary', {
  'data-key': `fold-${key}`,
  onclick: (e) => {
    const lane = e.currentTarget.closest('.lane-done');
    if (!lane || lane.querySelector('.release-fold[open]')) return;
    const px = Math.max(...[...lane.querySelectorAll('.ticket')].map((t) => t.getBoundingClientRect().height));
    doneHeight.set(current?.repo.full_name, px);
    lane.style.setProperty('--done-card-height', `${px}px`);
  },
}, el('span', {}, `${changes.length} modification${changes.length > 1 ? 's' : ''}`)),
changeList(changes));

// Issue #370: a finished « Mise en production » in « Terminé ». Its outcome (read from the relay's note) decides the
// headline and whether the card is red; everything the owner needs is on the card, the title still opens GitHub.
function releaseDoneCard(d, now) {
  const o = live.releases.get(d.number) || { state: 'unknown' };
  const changes = (o.prs?.length ? o.prs : d.changes) || [];
  const red = ['failed', 'undone', 'broken', 'unpublished'].includes(o.state);
  const when = el('span', { class: 'when', 'data-time': '' }, ` · ${doneAgo(d.mergedAt, now)}`);
  const head = (sym, text, cls = '') => el('p', { class: `finished${cls ? ` ${cls}` : ''}` }, sym ? el('span', { 'aria-hidden': 'true' }, `${sym} `) : null, text, when);
  const body = [];
  if (o.state === 'nothing') body.push(head('✓', 'Rien à mettre en ligne : le site est déjà à jour', 'closed'));
  else if (o.state === 'undone') body.push(head('–', 'Annulée : le site en ligne ne marchait plus, la version d\'avant est revenue', 'broken'));
  else if (o.state === 'broken') body.push(head('–', 'Le site en ligne ne marchait plus : une correction urgente est en cours', 'broken'));
  else if (o.state === 'failed' || o.state === 'unpublished') body.push(head('–', 'Pas mise en production', 'broken'));
  else if (o.state === 'unknown') body.push(head('✓', 'Terminée')); // an old release with no readable outcome: no false « En ligne ✅ »
  else if (o.state === 'live') body.push(head('', o.unchecked ? 'En ligne (vérification impossible)' : 'En ligne ✅'));
  else body.push(head('✓', 'Terminée')); // closed on the way (« deploying »…): never a false « En ligne »
  if (!red && changes.length) body.push(foldedChanges(d.url, changes));
  if (o.state === 'live' && o.version) body.push(el('p', { class: 'release-meta' }, `Version ${o.version}`));
  const site = o.state === 'live' && siteLink(o.site);
  if (site) body.push(el('a', { class: 'release-site', href: site, target: '_blank', rel: 'noopener' }, 'Voir le site en ligne', el('span', { 'aria-hidden': 'true' }, ' ↗')));
  if (red && (o.reason || o.todo)) body.push(el('p', { class: 'release-why' }, [o.reason, o.todo].filter(Boolean).join(' ')));
  if (Number(o.fix) > 0) body.push(el('a', { class: 'release-fix', href: `${d.url.replace(/\/issues\/\d+$/, `/issues/${Number(o.fix)}`)}`, target: '_blank', rel: 'noopener' }, `Voir la correction (#${Number(o.fix)})`, el('span', { 'aria-hidden': 'true' }, ' ↗')));
  return el('article', { class: `ticket done${red ? ' closed' : ''}` },
    el('h3', {}, el('a', { class: 'main', href: d.url, target: '_blank', rel: 'noopener' }, 'Mise en production')),
    ...body);
}

function card(c, lane, minutes, now, moved) {
  const plan = live.plans.get(c.number);
  const typical = plan && minutes.bySize ? { ...minutes, building: minutes.bySize[plan.size] } : minutes;
  const e = estimate(c, live.events, typical, now, plan);
  const kind = c.column === 'release' ? 'Mise en production' : c.labels.includes('factory:bug') ? 'Bug' : c.labels.includes('factory:audit') ? 'Review générale' : c.labels.includes('factory:ui-polish') ? 'Amélioration UI' : c.labels.includes('factory:stack') ? 'Fiche stack' : 'Fonctionnalité';
  const running = c.labels.includes('factory:running');
  // Issue #383: its launch failed for a moment, the factory starts it again by itself at that time.
  const relaunch = !running && relaunchWaits(c) ? relaunchLine(readRelaunch(c.body), undefined, now) : null;
  // Red means « waiting for you to unblock it »: not while an agent is working on it after your answer.
  const blocked = c.column === 'blocked' && !running && !c.waits?.length && !relaunch;
  const status = lane === 'yours'
    ? el('p', { class: 'cta' }, c.column === 'acceptance' && !live.previews.get(c.number) ? 'Relisez et validez' : actionFor(c.column),
      el('span', { 'aria-hidden': 'true', class: 'arrow' }, '→'))
    : c.column === 'release'
      ? el('p', { class: 'doing' }, el('span', { class: 'dot on', 'aria-hidden': 'true' }), releaseStep(c))
    : lane === 'working' && relaunch
      ? el('p', { class: 'doing relaunch' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), relaunch)
    : lane === 'working'
      ? el('p', { class: 'doing' }, el('span', { class: `dot${running || c.column === 'checks' ? ' on' : ''}`, 'aria-hidden': 'true' }),
        running ? 'Un agent travaille' : c.column === 'checks' ? 'Contrôles automatiques en cours' : 'Prise en charge imminente',
        running && live.sessions.get(c.number)
          ? el('a', { class: 'session', href: live.sessions.get(c.number), target: '_blank', rel: 'noopener' }, 'Voir ce qu\'il fait', el('span', { 'aria-hidden': 'true' }, ' ↗'))
          : null)
      : lane === 'pending' ? holdStatus(holdLine(live.answered.get(c.number), now))
        : lane === 'queued' && c.waits?.length ? el('p', { class: 'doing waits' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', {}, waitsText(c.waits, requestTitles()))) : null;
  const waiting = lane === 'pending';
  const asks = waiting || lane === 'yours'; // the card carries its answer buttons
  const held = waiting ? heldSince(c, now) : null; // « envoyé il y a … » on a card on hold
  const preview = live.previews.get(c.number);
  // A waiting card keeps its status line « En attente de GitHub », then the same buttons as in « À vous de jouer ».
  const testIt = c.column === 'acceptance' && !running && !waiting;
  const previewName = testIt || (waiting && c.column === 'acceptance') ? 'Ouvrir l\'aperçu à tester' : 'Voir l\'aperçu';
  const short = lane === 'yours'; // one word on a narrow « À vous » card, see SHORT_LABELS
  const previewLink = preview ? el('a', { class: `preview button${testIt && !asks ? '' : ' secondary'}`, href: preview, target: '_blank', rel: 'noopener', 'aria-label': short ? previewName : null },
    short ? 'Aperçu' : previewName, el('span', { 'aria-hidden': 'true' }, ' ↗')) : null;
  const article = el('article', { class: `ticket ${lane}${blocked ? ' blocked' : ''}`, 'data-number': String(c.number) },
    el('div', { class: 'ticket-top' },
      el('span', { class: 'kind' }, ...kindParts(kind, Boolean(c.pull_request), c.number, plan?.size).map((p) => (typeof p === 'string' ? p : el('span', { class: 'size-tag' }, p.size)))),
      // On hold, the top line tells since when the answer waits, not the time spent at the step (issue #517).
      waiting ? (held ? el('span', { class: 'since', 'data-time': '' }, held) : null)
        : e.since != null ? el('span', { class: 'since', 'data-time': '' }, `depuis ${humanMinutes(e.since)}`) : null),
    el('h3', {}, waiting ? c.title : el('a', { class: 'main', href: live.targets.get(c.number) || c.html_url, target: '_blank', rel: 'noopener', 'data-key': String(c.number) }, c.title)),
    asks && c.column === 'blocked' ? el('span', { class: 'blocked-tag' }, 'Bloqué') : null,
    testIt && preview && !asks ? null : status,
    c.column === 'release' ? changeList(releaseChanges(c)) : null,
    // On a card that waits for an answer the buttons sit together on one row (within reach, without taking over the card).
    c.column === 'release' ? null : asks ? el('div', { class: 'card-actions' }, answerButtons(c, previewLink, waiting)) : previewLink,
    c.column === 'release' ? null : stepTrack(c),
    // No agent works on a card whose launch waits: no estimate of its work until it starts.
    c.column === 'release' || relaunch ? null : el('p', { class: 'eta', 'data-time': '' }, c.waits?.length ? waitsEta(c) : timeLine(e)),
    c.labels.includes('factory:auto-picked') ? el('p', { class: 'eta' }, 'Piochée automatiquement') : null,
    // Only on a card that waits for you (as the « À vous » list always showed it): while an agent catches the step up,
    // there is nothing for you to see.
    c.labels.includes('factory:skills-alert') && (lane === 'yours' || waiting)
      ? el('p', { class: 'alert' }, 'Une étape attendue manque (voir « Fabrication » dans la PR).') : null);
  article.dataset.sig = withoutTimes(article.outerHTML); // the moved halo is not part of the signature
  if (moved) article.classList.add('moved');
  return article;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.16, 1, .3, 1)';
const cardsOf = (root) => new Map([...root.querySelectorAll('.ticket[data-number]:not(.leaving)')].map((n) => [Number(n.dataset.number), n]));
const onScreen = (r) => r.bottom > 0 && r.top < innerHeight;

// FLIP: slide each card from where it was to where it is now (fade in place when either spot is off-screen).
function flip(before) {
  if (reduced()) return;
  for (const [n, node] of cardsOf($('board'))) {
    const a = before.get(n), b = node.getBoundingClientRect();
    if (!a || !shouldSlide(a, b)) continue;
    node.animate(onScreen(a) && onScreen(b)
      ? [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }]
      : [{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: EASE });
  }
}
const rectsOf = (root) => new Map([...cardsOf(root)].map(([n, node]) => [n, node.getBoundingClientRect()]));

const sentGo = new Set(); // « go » already posted this session: the card shows no second « go » while it waits for the agent
const sendingGo = new Set(); // the answers still on their way to GitHub (« Envoi… »); the others in sentGo read « Envoyé ✓ »
// Both are keyed by project and number: #12 of one project is not #12 of another.
// The column is part of the key: the same change gets a fresh « Ok » when it moves from captures to recette.
const goKey = (c) => `${current.repo.full_name}#${c.number}@${c.column}`;
// What the toast says once the answer has left, by the column it answers.
const SENT = {
  spec: '« go » envoyé. La construction démarre.',
  visual: '« ok » envoyé. Captures validées : la fusion se fera dès que les contrôles automatiques sont verts.',
  acceptance: '« ok » envoyé. Recette validée : la mise en ligne se fait maintenant.',
};
// The panel's token may be read-only on pull requests (the one created from the sign-in link was, until 2026-11-06):
// GitHub then refuses the comment with a 403. The answer goes on the issue the PR delivers, and the relay applies
// it to the PR.
async function postAnswer(repo, c, word) {
  const post = (n, body) => api(`/repos/${repo}/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  try { await post(c.number, word); } catch (e) {
    const issue = c.pull_request ? deliveredIssue(c) : null;
    if (e.status !== 403 || !issue) throw e;
    await post(issue, answerForPr(c.number, word));
  }
}
async function sendGo(c, btn, repo, key) {
  try {
    await postAnswer(repo, c, goWord(c));
    sendingGo.delete(key);
    if (current?.repo.full_name === repo) { const b = goBtn(c, btn); b.textContent = goState(c).text; b.setAttribute('aria-label', goName(c)); }
    toast(SENT[c.column] || `« ${goWord(c)} » envoyé.`);
    // An « ok » waits for GitHub like any answer: the card goes to « En attente de GitHub » until its column changes.
    if (c.reply === 'ok' && current?.repo.full_name === repo) { const now = Date.now(); savePending({ ...pendingState(), [c.number]: { column: c.column, clickedAt: now, backAt: now, sent: true } }); }
    await refresh();
  } catch (e) {
    toast(`Envoi impossible. ${errorText(e)}`);
    sentGo.delete(key);
    sendingGo.delete(key);
    if (current?.repo.full_name === repo) btn = goBtn(c, btn); // the board may have been redrawn while the answer was on its way
    btn.disabled = false;
    btn.textContent = goText(c);
    btn.setAttribute('aria-label', goName(c));
  }
}
const goBtn = (c, fallback) => document.querySelector(`button.go[data-go="${c.number}"]`) || fallback;
// A touch sends at once: « Envoi… » until GitHub answers, then the usual message (issue #450, no countdown).
function answerGo(c, btn) {
  const repo = current.repo.full_name, key = goKey(c);
  if (sentGo.has(key)) return;
  sentGo.add(key);
  sendingGo.add(key);
  btn.disabled = true;
  btn.textContent = goState(c).text;
  btn.setAttribute('aria-label', goName(c));
  sendGo(c, btn, repo, key);
}

function skeleton() {
  const bar = (w) => el('span', { class: 'sk-bar', style: `width:${w}` });
  const box = () => el('div', { class: 'sk-card' }, bar('40%'), bar('85%'), bar('60%'));
  return el('div', { class: 'skeleton', role: 'status' }, el('span', { class: 'visually-hidden' }, 'Chargement…'), box(), box(), box());
}

// Plates the owner just acted on (see pending.mjs): kept per project, on this device only.
const pendingKey = () => `factory.pending.${current.repo.full_name}`;
function pendingState() { try { return JSON.parse(store.get(pendingKey()) || '{}') || {}; } catch { return {}; } }
const savePending = (state) => { if (Object.keys(state).length) store.set(pendingKey(), JSON.stringify(state)); else store.del(pendingKey()); };
// Since when the answer of a card on hold waits: its answer seen on GitHub, else the moment the owner came back (or
// touched « Ok ») on this device.
const heldSince = (c, now) => sentLine(live.answered.get(c.number) ?? pendingState()[c.number]?.backAt, now);
function pendingZone(held, minutes, now) {
  if (!held.length) return null;
  return el('section', { class: 'lane lane-pending pending-zone', 'aria-label': 'Prise en compte en cours' },
    el('h2', {}, 'Prise en compte en cours…', el('span', { class: 'count' }, String(held.length))),
    el('div', { class: 'tickets' }, held.map((c) => card(c, 'pending', minutes, now, false))));
}
// Clicking a plate's link (preview, « Répondre », title) opens GitHub in another tab: remember it, and put the plate on hold when the owner is back.
for (const type of ['click', 'auxclick']) {
  document.addEventListener(type, (e) => {
    const li = e.target.closest?.('.ticket.yours[data-number], .ticket.pending[data-number]'); // a new click on a waiting card restarts its wait
    const link = e.target.closest?.('a');
    if (!li || !current || !link) return;
    if (e.type === 'auxclick' && e.button !== 1) return; // right click: « copy link », not an answer
    // Reading a plate answered by a button (« go », « Ok ») is not answering it: looking at the captures, the preview or
    // the recette keeps it in « À vous de jouer »; only the button sends it to « En attente de GitHub ».
    if (li.querySelector('button.go')) return;
    const c = live.issues && boardItems(live.issues).find((x) => x.number === Number(li.dataset.number));
    if (c) savePending(noteClick(pendingState(), c, Date.now()));
  });
}
function owedReturn() {
  if (!current || !live.issues) return;
  const state = pendingState();
  if (Object.values(state).some((x) => x.backAt == null)) savePending(noteReturn(state, Date.now()));
  drawBoard();
}
window.addEventListener('focus', owedReturn);
document.addEventListener('visibilitychange', () => { if (!document.hidden) owedReturn(); });

// « À vous de jouer »: everything that waits for an answer, oldest first, as cards like the other lanes; only their
// « go » / « Ok » buttons are blue. Nothing waiting: the calm box.
function youCard(yours, headline, sub, minutes, now, movedSet) {
  const status = el('p', { class: live.last || live.failures ? 'live' : 'live pending' }, el('span', { class: 'live-dot', 'aria-hidden': 'true' }), el('span', { class: 'live-text' }, liveText()));
  if (!yours.length) return el('div', { class: 'you-card calm' }, el('p', { class: 'headline' }, headline), ...(sub ? [el('p', { class: 'muted' }, sub)] : []), status);
  return el('section', { class: 'lane lane-yours you-card', 'aria-label': 'À vous de jouer' },
    el('div', { class: 'lane-head' }, el('h2', {}, 'À vous de jouer', el('span', { class: 'count' }, String(yours.length))), status),
    el('div', { class: 'tickets' }, yours.map((c) => card(c, 'yours', minutes, now, movedSet.has(c.number)))));
}

// « Idées à trier »: what the agent proposed by itself. Calm on purpose (never in « À vous », no alert): the owner
// sorts them when he likes. « Garder » lets the factory take it like any request; « Jeter » closes it, and the
// agent reads closed ideas before proposing again, so it is not proposed twice.
// A sorted card leaves at the click and GitHub is told in the background: the owner can sort the next one at once.
// Kept per project: an answer that arrives after the owner switched project still lands in the right one.
const sortingIdeas = new Map(); // repo → (number → 'sending' | 'sent', see ideasToShow)
const refusedIdeas = new Map(); // repo → numbers GitHub refused: the card is back, with a red line until the next click on it
const sortingIdea = (repo = current?.repo.full_name) => sortingIdeas.get(repo) || sortingIdeas.set(repo, new Map()).get(repo);
const refusedIdea = (repo = current?.repo.full_name) => refusedIdeas.get(repo) || refusedIdeas.set(repo, new Set()).get(repo);
let ideaFocus = null; // the button the focus goes on to once the sorted card is gone
const announceIdea = new Set(); // refusals not yet drawn: read aloud once, not again at every later redraw
const ideaRects = () => new Map([...$('board').querySelectorAll('.ticket.idea[data-idea]')].map((n) => [n.dataset.idea, n.getBoundingClientRect()]));
function ideasLane(ideas) {
  if (!ideas.length) return null;
  const pick = current?.config?.autoPick === true;
  return el('section', { class: 'lane lane-ideas', 'aria-label': 'Idées à trier' },
    el('h2', {}, 'Idées à trier', el('span', { class: 'count' }, String(ideas.length))),
    el('div', { class: 'tickets' }, ideas.map((i) => el('article', { class: 'ticket idea', 'data-idea': String(i.number) },
      el('div', { class: 'ticket-top' }, el('span', { class: 'kind' }, `${i.labels.includes('factory:bug') ? 'Bug' : 'Idée'} · demande #${i.number}`)),
      el('h3', {}, el('a', { class: 'main', href: i.html_url, target: '_blank', rel: 'noopener', 'data-key': `idea-${i.number}` }, i.title)),
      refusedIdea().has(i.number) ? el('p', { class: 'idea-error', id: `idea-error-${i.number}`, role: announceIdea.has(i.number) ? 'alert' : null }, 'GitHub a refusé : réessayez.') : null,
      el('div', { class: 'card-actions' },
        el('button', { type: 'button', class: 'secondary', 'data-key': `keep-${i.number}`, 'aria-describedby': refusedIdea().has(i.number) ? `idea-error-${i.number}` : null, 'aria-label': `Garder l'idée #${i.number} ${i.title}`, onclick: () => sortIdea(i, true, pick) }, 'Garder'),
        dropButton(i, pick))))));
}
// « Jeter » closes the idea at the touch, like « Garder » (issue #450: no countdown any more).
function dropButton(i, pick) {
  return el('button', { type: 'button', class: 'secondary', 'data-key': `drop-${i.number}`, 'aria-describedby': refusedIdea().has(i.number) ? `idea-error-${i.number}` : null, 'aria-label': `Jeter l'idée #${i.number} ${i.title}`, onclick: () => sortIdea(i, false, pick) }, 'Jeter');
}
// Redraws the board; the idea cards slide from where they were, and a card GitHub refused (`back`) fades in.
function redrawIdeas(back) {
  const before = ideaRects();
  drawBoard();
  if (reduced()) return;
  for (const [k, b] of ideaRects()) {
    const node = $('board').querySelector(`.ticket.idea[data-idea="${k}"]`), a = before.get(k);
    if (Number(k) === back) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE });
    else if (a && (a.left !== b.left || a.top !== b.top)) node.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 200, easing: EASE });
  }
}
// The card leaves in 0.2 s (a kept one rises, a dropped one shrinks), then the others slide up into its place;
// the count drops at the click. The last idea takes its whole section with it.
function leaveIdea(n, keep) {
  const board = $('board');
  const node = board.querySelector(`.ticket.idea[data-idea="${n}"]`);
  const lane = node?.closest('.lane-ideas');
  const left = lane ? lane.querySelectorAll('.ticket.idea:not(.leaving)').length - 1 : 0;
  // Keyboard: the focus goes on to the same button of the next card (or the previous one), not back to the top.
  const next = node && (node.nextElementSibling || node.previousElementSibling)?.dataset?.idea;
  if (node && node.contains(document.activeElement)) ideaFocus = next ? `${keep ? 'keep' : 'drop'}-${next}` : null;
  if (!node || reduced()) return redrawIdeas();
  node.classList.add('leaving');
  node.inert = true;
  if (left) lane.querySelector('.count').textContent = String(left);
  if (left) node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: keep ? 'translateY(-8px)' : 'scale(.96)' }], { duration: 200, easing: EASE, fill: 'forwards' });
  else lane.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE, fill: 'forwards' });
  setTimeout(() => {
    if (!node.isConnected) return; // a refresh already redrew the board
    node.dataset.gone = '';
    if (!board.querySelector('.ticket.idea.leaving:not([data-gone])')) redrawIdeas(); // one redraw once every fade is over
  }, 200);
}
async function sortIdea(i, keep, pick) {
  const target = current.repo; // the owner may switch project before GitHub answers
  const repo = target.full_name;
  refusedIdea(repo).delete(i.number);
  sortingIdea(repo).set(i.number, 'sending');
  leaveIdea(i.number, keep);
  // The one message left: without automatic pick, a kept idea still waits for the owner to write in it.
  const reminder = 'Idée gardée. Écrivez dedans pour la lancer.';
  if (keep && !pick) toast(reminder);
  try {
    if (keep) await api(`/repos/${repo}/issues/${i.number}/labels`, { method: 'POST', body: JSON.stringify({ labels: ['factory:kept'] }) });
    else await api(`/repos/${repo}/issues/${i.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }) });
    sortingIdea(repo).set(i.number, 'sent');
    // Kept with automatic pick on: it may take a free place now. Older project workflows ignore the kept label,
    // so the board wakes the factory itself (issue #406).
    if (keep && pick) wakeFactory(target, { say: true });
    if (live.repo === repo) refresh();
  } catch (e) {
    console.warn(`Idea #${i.number} not sorted`, e);
    sortingIdea(repo).delete(i.number);
    refusedIdea(repo).add(i.number);
    if (live.repo === repo) announceIdea.add(i.number);
    if (keep && $('toast').textContent === reminder) $('toast').classList.remove('show'); // it was not kept after all
    if (live.repo === repo) redrawIdeas(i.number);
  }
}

function drawBoard() {
  const board = $('board');
  live.drawn = true;
  const now = Date.now();
  // Requests merged meanwhile drop out of « Attend #… »; once all are, the card keeps them until the factory resumes it.
  const cards = boardItems(live.issues).map((c) => {
    const waits = c.column === 'blocked' ? live.waits.get(c.number) || [] : [];
    const left = stillWaited(waits, live.done);
    return waits.length ? { ...c, waits: left.length ? left : waits, waitsMerged: !left.length } : c;
  });
  const moved = moves(live.prev, cards);
  live.prev = new Map(cards.map((c) => [c.number, c.column]));
  const movedSet = new Set(moved.map((m) => m.number));
  for (const m of moved) toast(`« ${m.title} » : ${COLUMNS.find((c) => c.id === m.to)?.title || m.to}`);
  const doneSig = live.doneLoaded ? live.done.map((d) => `${d.number}:${d.title}${d.release ? `:${JSON.stringify(live.releases.get(d.number) ?? null)}` : ''}`).join('|') : null;
  const doneChanged = doneSig !== null && live.doneSig !== doneSig;
  if (live.doneSig != null) {
    const known = new Set(live.doneSig.split('|').map((x) => x.split(':')[0]));
    for (const d of live.done) if (!known.has(String(d.number))) toast(`« ${d.title} » : ${d.reason ? `fermée (${d.reason.toLowerCase()})` : COLUMNS.find((c) => c.id === 'done').title}`);
  }
  live.doneSig = doneSig;
  const sizes = Object.fromEntries([...live.plans].filter(([, p]) => p).map(([n, p]) => [n, p.size]));
  const minutes = { ...stageMinutes(live.events, now) };
  // Without an estimate from the agent, a building card falls back to the history of builds of the same size.
  minutes.bySize = buildingMinutes(live.events, now, sizes);
  const byLane = Object.fromEntries(LANES.map(([id]) => [id, cards.filter((c) => laneFor(c) === id)]));
  const clicked = pendingNow(pendingState(), yoursList(cards), now);
  savePending(clicked.state);
  const held = { pending: heldCards(yoursList(cards), clicked.pending, live.answered) };
  const heldSet = new Set(held.pending.map((c) => c.number));
  const yours = yoursList(cards).filter((c) => !heldSet.has(c.number));
  const n = yours.length;
  if (document.title !== tabTitle(n)) document.title = tabTitle(n); // rewritten only when the count changes (#572)
  const doneShown = doneView(live.done);
  const headline = cards.length ? 'Rien ne vous attend' : 'Aucune fonctionnalité en cours'; // shown only when nothing waits
  const sub = cards.length
    ? [byLane.working.length && `${byLane.working.length} en travail`, byLane.queued.length && `${byLane.queued.length} en file`].filter(Boolean).join(' · ') || 'Les agents attendent vos réponses.'
    : '';
  const sorted = ideasToShow(ideaItems(live.issues), sortingIdea());
  for (const n of sorted.settled) sortingIdea().delete(n);
  const ideas = sorted.shown;
  const ideasSig = JSON.stringify(ideas.map((i) => [i.number, i.title, refusedIdea().has(i.number)]));
  const focusKey = document.activeElement?.dataset?.key;
  const oldCards = cardsOf(board);
  const before = rectsOf(board);
  const fresh = [
    youCard(yours, headline, sub, minutes, now, movedSet),
    pendingZone(held.pending, minutes, now),
    ...LANES.filter(([id]) => id !== 'yours' && cards.length).map(([id, title, empty]) => el('section', { class: `lane lane-${id}`, 'aria-label': title },
      el('h2', {}, title, el('span', { class: 'count' }, String(byLane[id].length))),
      byLane[id].length
        ? el('div', { class: 'tickets' }, byLane[id].map((c) => card(c, id, minutes, now, movedSet.has(c.number))))
        : el('p', { class: 'lane-empty' }, empty))),
    ideasLane(ideas),
    el('section', { class: 'lane lane-done', 'aria-label': 'Terminé', style: doneHeight.has(current?.repo.full_name) && doneShown.shown.some((d) => openReleases.has(d.url)) ? `--done-card-height: ${doneHeight.get(current?.repo.full_name)}px` : null },
      el('h2', {}, 'Terminé', live.doneTried ? el('span', { class: 'count' }, String(live.done.length)) : null),
      !live.doneTried ? null : live.done.length
        ? el('div', { class: 'tickets' }, doneShown.shown.map((d) => d.release ? releaseDoneCard(d, now) : el('article', { class: d.reason ? 'ticket done closed' : 'ticket done' },
          el('h3', {}, el('a', { class: 'main', href: d.url, target: '_blank', rel: 'noopener', title: d.title }, d.title)),
          (d.reason
            ? el('p', { class: 'finished closed' }, el('span', { 'aria-hidden': 'true' }, '– '), 'Fermée · ', el('span', { class: 'reason' }, d.reason), el('span', { class: 'when', 'data-time': '' }, ` · ${doneAgo(d.mergedAt, now)}`))
            : el('p', { class: 'finished' }, el('span', { 'aria-hidden': 'true' }, '✓ '), 'Terminée', el('span', { class: 'when', 'data-time': '' }, ` · ${doneAgo(d.mergedAt, now)}`))))))
        : el('p', { class: 'lane-empty' }, "Rien de livré pour l'instant."),
      doneShown.hidden ? el('p', { class: 'done-more' }, olderNote(doneShown.hidden)) : null)];
  const yoursSig = JSON.stringify([held.pending.map((c) => [c.number, c.title]), ...yours.map((c) => [c.number, c.title, c.reply, c.column, live.targets.get(c.number), live.previews.get(c.number), c.labels.includes('factory:skills-alert')])]);
  const holder = el('div', {}, ...fresh);
  const freshCards = cardsOf(holder);
  const changes = cardChanges(live.sigs, new Map([...freshCards].map(([k, v]) => [k, v.dataset.sig])));
  const prevSigs = live.sigs;
  live.sigs = new Map([...freshCards].map(([k, v]) => [k, v.dataset.sig]));
  const oldIndex = new Map([...oldCards].map(([n, node]) => [n, [...node.parentNode.children].indexOf(node)]));
  // Decided first: reusing a card moves its node out of the board, so nothing may be reused when the board is left as it is
  // (otherwise the cards leave with the discarded draw and the lane stays empty until the next change).
  const unchanged = fresh.length && !changes.added.length && !changes.removed.length && !changes.changed.length && !moved.length && !doneChanged && board.querySelector('.you-card') && live.yoursSig === yoursSig && live.ideasSig === ideasSig;
  // Cards that did not change keep their DOM node: no flicker, no lost hover or focus.
  // (a card that just moved is always redrawn, so that it gets its halo; a card unknown to the previous draw is never reused)
  // Their clocks are brought up to date in place.
  for (const [n, node] of freshCards) if (oldCards.has(n) && prevSigs?.has(n) && !changes.changed.includes(n) && !movedSet.has(n)) syncTimes(oldCards.get(n), node);
  if (unchanged && board.querySelectorAll('[data-time]').length === holder.querySelectorAll('[data-time]').length) syncTimes(board, holder); // done column included
  if (!unchanged) for (const [n, node] of freshCards) if (oldCards.has(n) && prevSigs?.has(n) && !changes.changed.includes(n) && !movedSet.has(n)) node.replaceWith(oldCards.get(n));
  // The halo lasts 2.4 s; the class goes away after it, so that moving the node later does not replay it.
  for (const n of movedSet) { const node = freshCards.get(n); if (node) setTimeout(() => node.classList.remove('moved'), 2500); }
  // Cards that left stay in place, fading, then the space closes smoothly.
  const leaving = [], restore = [];
  if (!reduced()) for (const n of changes.removed) {
    const node = oldCards.get(n), laneClass = [...node.closest('.lane').classList].find((c) => c.startsWith('lane-'));
    const laneEl = holder.querySelector(`.${laneClass}`);
    if (!laneEl) continue;
    let grid = laneEl.querySelector('.tickets');
    if (!grid) { // the lane is now empty: keep a grid for the dying card until it is gone
      const empty = laneEl.querySelector('.lane-empty');
      grid = el('div', { class: 'tickets' });
      empty.replaceWith(grid);
      restore.push({ grid, empty });
    }
    node.classList.add('leaving');
    grid.insertBefore(node, grid.children[oldIndex.get(n)] || null);
    leaving.push(node);
  }
  if (!unchanged) {
    live.yoursSig = yoursSig;
    live.ideasSig = ideasSig;
    board.replaceChildren(...holder.childNodes);
    announceIdea.clear();
    flip(before);
    if (!reduced() && !live.instant) for (const n of changes.added) if (!oldCards.has(n)) freshCards.get(n).animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
    for (const node of leaving) node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.92)' }], { duration: 300, easing: EASE, fill: 'forwards' });
    if (leaving.length) setTimeout(() => {
      const mid = rectsOf(board);
      for (const node of leaving) node.remove();
      for (const { grid, empty } of restore) if (!grid.children.length && grid.isConnected) grid.replaceWith(empty);
      flip(mid);
    }, 300);
  }
  if (focusKey) board.querySelector(`[data-key="${focusKey}"]`)?.focus();
  // After a sorted card left (even if a refresh redrew the board during its fade).
  if (ideaFocus && !board.querySelector('.ticket.idea.leaving')) { board.querySelector(`[data-key="${ideaFocus}"]`)?.focus(); ideaFocus = null; }
  drawStatus();
}

function startLive() {
  clearInterval(live.tick);
  // Every 5 s the "à jour il y a" text moves; every minute the durations on the cards move.
  let n = 0;
  live.tick = setInterval(() => { drawStatus(); if ((++n % 12 === 0 || (current && Object.values(pendingState()).some((x) => x.backAt != null))) && live.issues && !$('board').hidden) drawBoard(); }, 5000);
}

function drawSite() {
  const url = siteLink(current.config.siteUrl, current.repo.homepage);
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

async function renderBoard() {
  drawSite();
  if (!live.drawn) {
    // Shown at once, without the cards' entrance (issue #327); the refresh below then brings it up to date silently.
    if (live.issues) {
      $('board').replaceChildren();
      live.instant = true;
      try { drawBoard(); } finally { live.instant = false; }
      $('issues-link').textContent = issuesLinkText(openIssueCount(live.issues));
    } else $('board').replaceChildren(skeleton());
  }
  clearTimeout(live.timer);
  await refresh();
}

// Any sign of life from the owner brings the 8 s rhythm (10 s for the dots) back (after 2 minutes of calm it slows to 30 s).
for (const type of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart']) {
  window.addEventListener(type, () => {
    const wasIdle = isIdle(live.activity, Date.now(), document.hidden);
    live.activity = Date.now();
    if (wasIdle && current && !document.hidden && !live.busy) schedule();
    // The dots come back to life too: a check at once instead of waiting out the 30 s (issue #488).
    if (wasIdle && !document.hidden) wakeDots();
  }, { passive: true });
}

// A gesture after a calm moment, or a return to the tab, checks the other projects' dots at once (issue #488),
// unless they were just checked (then the next round comes 10 s after it) or GitHub asked to wait.
function wakeDots() {
  if (!token) return;
  const wait = dotsWake({ now: Date.now(), last: dotsLast, pausedUntil: dotsPausedUntil });
  if (wait === 0) return refreshDots();
  if (wait != null) { clearTimeout(dotsTimer); dotsTimer = setTimeout(refreshDots, wait); }
}

// Coming back to the tab refreshes at once (unless it just did); while hidden it keeps polling every 30 s.
document.addEventListener('visibilitychange', () => {
  // The owner is back: the active rhythm (8 s board, 10 s dots) starts now.
  if (!document.hidden) { live.activity = Date.now(); wakeDots(); }
  if (!current) return clearTimeout(live.timer);
  if (document.hidden) return schedule();
  if (Date.now() - live.last > 5000) refresh(); else schedule();
});

function checkbox(id, checked, onchange) {
  return el('input', { type: 'checkbox', id, checked, onchange: (e) => onchange(e.target.checked) });
}

// ---- Machine of the factory jobs (issue #271) -------------------------------------------------------------------------
// The general setting and the dev server check live on a branch of the factory (written by scripts/runners.mjs).
const RUNNERS_BRANCH = 'factory-runners';
const MACHINE_CHOICES = [['dev-server', 'Serveur de dev'], ['github', 'Machines GitHub']];
// `held`: a status read while the focus was in « Paramètres », shown when it leaves; `shown`: the line on screen.
const machine = { settings: null, sha: null, general: 'dev-server', status: null, hash: null, repo: null, held: null, shown: null };

// One read of the runner files, past the browser cache (review #556): see machine.mjs.
const runnersFile = (path) => readRunnersFile(api, path);
// Both files for the settings line and the banner: a read already on its way is shared, never sent twice.
let runnersReading = null;
function runnersFiles() {
  if (runnersReading?.session === token) return runnersReading.files;
  const read = { session: token, files: Promise.all([runnersFile('settings.json'), runnersFile('status.json')]) };
  runnersReading = read;
  read.files.finally(() => { if (runnersReading === read) runnersReading = null; });
  return read.files;
}

async function loadMachine(project) {
  // Never the previous project's state while this one loads (or if it cannot be read), nor a status held for it.
  Object.assign(machine, { status: null, hash: null, repo: project.repo.full_name, held: null });
  await boardGate; // the board's cards first (review #556)
  if (current !== project) return;
  const [[settings, status], hash] = await Promise.all([runnersFiles(), repoKey(String(project.repo.id))]);
  if (current !== project) return;
  const general = settings.json?.machine === 'github' ? 'github' : 'dev-server';
  Object.assign(machine, { settings: settings.json, sha: settings.sha, general, status: status.json, hash, repo: project.repo.full_name, held: null });
  renderRules();
}

const machineRadios = (name, choices, value, onpick, disabled = false) => choices.map(([v, t]) => el('div', { class: 'row' },
  el('input', { type: 'radio', name, id: `${name}-${v}`, checked: value === v, disabled, onchange: () => onpick(v) }),
  el('label', { for: `${name}-${v}` }, t)));

// The « Machine des tâches » line for this project, with the dev server's state for it.
const currentMachineLine = () => machineLine({ status: machine.status, hash: machine.hash, isPrivate: current.repo.private, general: machine.general, project: current.config.machine || 'default', created: current.repo.created_at || null });

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
async function refreshRunnerAlert() {
  clearTimeout(runnerTimer);
  runnerTimer = setTimeout(() => refreshRunnerAlert().catch(() => {}), 15 * 60_000);
  if (!token || !projects.length) return;
  const session = token, round = ++runnerRound;
  await boardGate; // the board's cards first (review #556)
  if (token !== session || round !== runnerRound) return;
  const [settings, status] = await runnersFiles();
  const list = await Promise.all(projects.map(async (p) => {
    let own = 'default';
    try { own = JSON.parse(fromBase64(p.file?.content || '')).machine || 'default'; } catch { /* unreadable rules: the general setting */ }
    return { name: p.repo.name, hash: await repoKey(String(p.repo.id)), isPrivate: Boolean(p.repo.private), created: p.repo.created_at || null, project: own };
  }));
  if (token !== session || round !== runnerRound) return; // a newer round answers instead
  const names = forgottenProjects({ status: status.json, general: settings.json?.machine === 'github' ? 'github' : 'dev-server', projects: list });
  // The settings line follows the same fresh status (it was read when the project opened).
  if (current && status.json && machine.repo === current.repo.full_name && machine.hash) {
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
  renderProjectList();
}

// This project's machine. A warning is shown above « Avancé » instead (issue #342), never twice.
function machineFieldset(update, line) {
  const c = current.config;
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
  const body = JSON.stringify({ ...(fresh.json || machine.settings || {}), machine: choice, models }, null, 2) + '\n';
  const res = await api(`/repos/${FACTORY_REPO}/contents/settings.json`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'chore(factory): general settings from the panel', content: toBase64(body), branch: RUNNERS_BRANCH, ...(fresh.sha ? { sha: fresh.sha } : {}) }),
  });
  machine.settings = JSON.parse(body);
  machine.sha = res?.content?.sha || null;
  machine.general = choice;
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
  const session = token, project = current;
  // What was edited stays while the page is dirty: it is read again only when clean (or when it could not be read).
  const clean = !generalDirty() || general.unreadable;
  const read = clean && general.read?.session === session && general.read.project === project ? general.read : null;
  const mine = clean && !read ? { session, project } : null;
  general.shown = { session, project };
  // The full screen removes the page's side margins: the general page never opens in it (review #556).
  if (document.body.classList.contains('chat-fullscreen')) setChatFull(false);
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
  if (token !== session || current !== project || $('project-view').hidden) {
    if (general.shown?.session !== token || general.shown?.project !== current || $('project-view').hidden) closeGeneral();
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
  // Back on « Agent »: the answer is on screen now, its badge and « Nouvelle réponse » go at once (review #556).
  if (wasOpen && !$('chat').hidden && !$('project-view').hidden && current && chat.repo) refreshChat();
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
    if (current) renderRules();
    toast(`Réglages généraux enregistrés : ils servent dès le prochain lancement.${machineChanged ? ' Le changement de machine s\'applique dans une minute environ.' : ''}`);
  } finally { savingGeneral = false; }
}

function renderRules() {
  const c = current.config;
  // Rebuilt anyway: a dev server status held back while the owner typed shows now.
  if (machine.held && machine.hash && machine.repo === current.repo.full_name) { machine.status = machine.held; machine.held = null; }
  const update = (next) => { current.config = next; renderRules(); };
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
  const mode = effectiveProduction(c, current.delivery);
  const bySheet = !c.production && current.delivery?.mode === 'manual' ? [el('p', { id: 'production-sheet', class: 'muted small' }, 'Proposé par la fiche stack.')] : [];
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
    catalog.packs.map((p) => {
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
  const dirty = JSON.stringify(c) !== current.saved;
  const bar = el('div', { class: 'savebar' },
    el('button', { type: 'submit', class: 'secondary', disabled: !dirty }, 'Enregistrer'),
    el('span', { class: 'muted' }, dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'));
  const open = new Set([...form.querySelectorAll('details[data-pack][open]')].map((d) => d.dataset.pack));
  const name = current.repo.name;
  // Issue #342: the everyday choices stay in view, everything technical folds under « Avancé » (remembered per device).
  const line = currentMachineLine();
  machine.shown = JSON.stringify(line);
  const alert = line.keys ? [runnerAlertBox(line.text, { role: 'status' })]
    : line.tone === 'warn' ? [el('p', { class: 'machine-status machine-alert warn', role: 'status' }, line.text)] : [];
  const summary = advancedSummary({
    machine: effectiveMachine({ isPrivate: current.repo.private, project: c.machine, general: machine.general }),
    checksOn: CHECKS.filter(([k]) => c.checks[k]).length, checksTotal: CHECKS.length,
    packsOn: catalog.packs.filter((p) => c.skills[p.id]?.enabled).length,
  });
  // Kept open across re-renders from the page itself, so a blocked storage never folds it under the finger.
  const wasOpen = form.querySelector('details.advanced')?.open;
  const advanced = el('details', { class: 'advanced', open: wasOpen ?? store.get(ADVANCED_KEY) === 'open',
    ontoggle: (e) => { if (e.target.open) store.set(ADVANCED_KEY, 'open'); else store.del(ADVANCED_KEY); } },
    el('summary', {}, el('span', { class: 'advanced-title' }, 'Avancé'), el('span', { class: 'advanced-summary' }, summary)),
    machineFieldset(update, line),
    el('p', { class: 'rules-more' }, el('button', { type: 'button', class: 'link-button', onclick: (e) => openGeneral(e.currentTarget).catch((err) => toast(errorText(err))) }, 'Changer le réglage de tous les projets')),
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
  if ((current.config.extraChecks || []).some((x) => !x.label?.trim() || !x.command?.trim())) {
    toast('Chaque contrôle supplémentaire a besoin d\'un nom et d\'une commande.');
    return;
  }
  if (savingRules) return; // a second tap would send the same version twice, and GitHub refuses the second one
  savingRules = true;
  try { await writeRules(); } finally { savingRules = false; }
}
async function writeRules() {
  const projectDirty = JSON.stringify(current.config) !== current.saved;
  const machineChanged = current.config.machine !== JSON.parse(current.saved || '{}').machine;
  const wasMode = effectiveProduction(JSON.parse(current.saved || '{}'), current.delivery);
  if (projectDirty) await writeProjectRules();
  const released = projectDirty ? await productionModeChanged(wasMode, effectiveProduction(current.config, current.delivery)) : 0;
  // The dev server check applies the change now instead of at its next run (15 minutes at most).
  if (machineChanged) {
    api(`/repos/${FACTORY_REPO}/actions/workflows/runners.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) }).catch(() => {});
  }
  renderRules();
  drawSite();
  drawSub();
  // A new production mode: the line read for the former one hides at once and is read again (issue #397).
  if (wasMode !== effectiveProduction(current.config, current.delivery)) { drawGap(); refreshGap(true).catch(() => {}); }
  toast(released ? `Paramètres enregistrés. ${released} modification${released > 1 ? 's' : ''} mise${released > 1 ? 's' : ''} en ligne.` : 'Paramètres enregistrés. Ils s\'appliquent dans une minute environ.');
}
async function writeProjectRules() {
  const fresh = await api(`/repos/${current.repo.full_name}/contents/factory.config.json`);
  if (!fresh) throw saidError('Les paramètres de ce projet ont disparu de GitHub\u00a0: rechargez la page.');
  // The file changed since it was loaded (the factory, or another device): keep those changes and apply only
  // what was modified here, instead of overwriting them.
  if (fresh.sha !== current.file.sha) {
    const theirs = resolveConfig(parseRawConfig(fromBase64(fresh.content)).raw, catalog, defaults).config;
    current.config = mergeConfig(JSON.parse(current.saved), current.config, theirs);
  }
  const body = JSON.stringify(current.config, null, 2) + '\n';
  const res = await api(`/repos/${current.repo.full_name}/contents/factory.config.json`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'chore(factory): update rules from the panel', content: toBase64(body), sha: fresh.sha }),
  });
  const before = JSON.parse(current.saved || '{}').maxParallel;
  current.file = { ...res.content, content: toBase64(body) };
  current.saved = JSON.stringify(current.config);
  // The next visit opens with these settings, and reads the file again (its push date is not known yet).
  saves++;
  known.set(current.repo.full_name, { pushed: null, etag: null, file: current.file });
  rememberProjects();
  // More places: ask the factory to look at the queue now instead of at its next regular check.
  if (current.config.maxParallel > (before || 0)) wakeFactory(current.repo);
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
async function updateTrigger(repo) {
  const name = repo.full_name;
  if (triggers.done.has(name)) return;
  const session = token;
  const upgrade = async (branch) => {
    const file = await api(`/repos/${name}/contents/${TRIGGER_FILE}${branch ? `?ref=${branch}` : ''}`, { cache: 'no-store' });
    const text = file?.content ? fromBase64(file.content) : null;
    const upgraded = upgradeTrigger(text);
    if (!upgraded) return text != null && knownTrigger(text);
    if (token !== session) return false;
    await api(`/repos/${name}/contents/${TRIGGER_FILE}`, {
      method: 'PUT',
      body: JSON.stringify({ message: 'chore(factory): let every factory label wake the factory (from the panel)', content: toBase64(upgraded), sha: file.sha, ...(branch ? { branch } : {}) }),
    });
    return true;
  };
  try {
    const fresh = await upgrade(null);
    if (token !== session) return;
    if (fresh) triggers.fresh.add(name);
    await upgrade('preprod');
    if (token === session) triggers.done.add(name);
  } catch (e) {
    if (token !== session) return;
    if (e.status === 403 || e.status === 404) { triggers.done.add(name); toast(TRIGGER_REFUSED); }
    throw e;
  }
}

// `focus`: also put the cursor in the tab's field (a click on « Agent », not the arrow keys moving along the tabs).
function selectTab(name, focus = false) {
  const fromChat = !$('chat').hidden;
  for (const t of ['board', 'chat', 'rules']) {
    $(`tab-${t}`).setAttribute('aria-selected', String(name === t));
    $(t === 'rules' ? 'rules-panel' : t).hidden = name !== t;
  }
  // Away from « Agent », the chat keeps being checked in the background so its badge can light up (issue #283).
  if (name === 'chat') openChat(); else if (fromChat) scheduleChat();
  // Issue #460: the « Agent » tab uses exactly the height left under the header.
  document.body.classList.toggle('chat-wide', name === 'chat');
  if (name !== 'chat') setChatFull(false);
  fitChat();
  if (name === 'chat' && focus) focusChat();
}

// Opening « Agent » on a computer puts the cursor where there is something to type (issue #489): the read token
// while it is missing, the message box otherwise. Never on a phone: the keyboard would hide half the screen.
function focusChat() {
  if (!matchMedia('(pointer: fine)').matches) return;
  const field = $(needsReadToken() ? 'read-token' : 'chat-input');
  field.focus({ preventScroll: true }); // the browser would centre it, pushing the tabs off a short screen
  // A laptop screen can leave the box just below the fold: show it whole, with its focus ring.
  (field.closest('.composer') || field).scrollIntoView({ block: 'nearest' });
}

// Issue #473: the « Agent » tab at the usual width, or full screen (only the top bar and the project list stay).
// Never remembered: a reload opens it at the usual width.
function setChatFull(on) {
  document.body.classList.toggle('chat-fullscreen', on);
  const label = on ? 'Largeur normale' : 'Plein écran';
  $('chat-full').setAttribute('aria-label', label);
  $('chat-full').title = label;
  fitChat();
}
$('chat-full').addEventListener('click', () => setChatFull(!document.body.classList.contains('chat-fullscreen')));
// The full screen exists on a computer only: shrinking the window to a phone's width ends it.
matchMedia('(max-width: 700px)').addEventListener('change', (e) => { if (e.matches && document.body.classList.contains('chat-fullscreen')) setChatFull(false); });
// Échap leaves the full screen, unless it is closing a window opened over it (an enlarged image, a dialog).
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || !document.body.classList.contains('chat-fullscreen') || document.querySelector('dialog[open]')) return;
  setChatFull(false);
});

function fitChat() {
  const box = $('chat');
  if (box.hidden) return;
  box.style.setProperty('--chat-top', `${Math.max(0, box.getBoundingClientRect().top + scrollY)}px`);
}
addEventListener('resize', fitChat);
if ('ResizeObserver' in window) {
  const watch = new ResizeObserver(() => fitChat());
  for (const n of document.querySelectorAll('.top, .project-head, .tabs')) watch.observe(n);
}

// A new panel version is deployed (version.json, written by pages.yml) while this tab still runs the old one: the
// banner under the top bar says so, and the owner reloads when he wants (issue #572: never by itself). Checked every
// minute and when the tab comes back. One banner only, whatever the number of versions online meanwhile.
const BUILD = document.querySelector('meta[name="build"]')?.content || '';
async function checkVersion() {
  if (!/^[0-9a-f]{7,}$/.test(BUILD)) return; // local copy, not a deployed one
  if (!$('new-version').hidden) return; // already shown
  const live = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!live?.build || live.build === BUILD) return;
  $('new-version').hidden = false;
  fitBanner();
}
// The strip's height, for the phone rules that keep it above an open conversation (style.css).
function fitBanner() {
  const strip = $('new-version');
  document.documentElement.style.setProperty('--new-version-h', `${strip.hidden ? 0 : strip.getBoundingClientRect().height}px`);
}
addEventListener('resize', fitBanner);
if ('ResizeObserver' in window) new ResizeObserver(() => fitBanner()).observe($('new-version'));
// « Recharger »: never loses what is typed or still arriving, says what to do first instead.
$('new-version-reload').addEventListener('click', () => {
  const why = reloadBlocker(unsavedParts());
  if (why) return toast(why);
  location.reload();
});
let watching = false, retryTimer = null;
function watchVersion() {
  if (watching) return; // start() runs again after each failed attempt and each login: one watcher is enough
  watching = true;
  setInterval(checkVersion, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
}

const fetchJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

async function start() {
  watchVersion();
  try {
    if (!catalog) {
      let server;
      [catalog, defaults, server] = await Promise.all([fetchJson('catalog.json'), fetchJson('factory.config.json'),
        fetch('chat-server.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
      chat.server = chatServerUrl(server?.url);
    }
    if (!token) return show('login');
    // No digest on a plain-http address (no crypto.subtle): the panel then works without the memory.
    accountTag = await tokenTag(token).catch(() => null);
    const remembered = readProjectsCache(store.get(PROJECTS_KEY), accountTag);
    known = remembered?.known || new Map();
    if (remembered?.projects.length && !projects.length) {
      projects = remembered.projects;
      refreshStable().catch(() => {});
      refreshRuns();
      refreshRunnerAlert().catch(() => {});
      await openProject(store.get(PROJECT_KEY));
      refreshDots();
      return checkProjects();
    }
    const session = token;
    const fresh = await loadProjects();
    if (token !== session) return; // logged out meanwhile: this list belongs to the previous account
    projects = fresh;
  } catch (err) {
    // Only a refused token is forgotten. A flaky mobile network or a GitHub hiccup keeps it.
    if (err.status !== 401) {
      toast('Connexion impossible pour l\'instant. Nouvel essai dans 15 s.');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => start().catch(() => {}), 15_000);
      return;
    }
    resetSession();
    $('login-error').textContent = 'GitHub a refusé le jeton. Vérifiez-le ou créez-en un nouveau.';
    return show('login');
  }
  refreshStable().catch(() => {});
  refreshRuns();
  refreshRunnerAlert().catch(() => {});
  if (!projects.length) return show('empty');
  await openProject(store.get(PROJECT_KEY));
  refreshDots(); // after the board: the open project's dot comes from it
}

// Agent starts of the day, all projects together, refreshed every 5 minutes (the routines have a daily limit).
let runsTimer = null;
async function refreshRuns() {
  clearTimeout(runsTimer);
  runsTimer = setTimeout(refreshRuns, 5 * 60_000);
  await boardGate;
  if (!token || !projects.length) return;
  const from = parisMidnight();
  try {
    const counts = await mapLimit(projects, 2, async (p) => {
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
function drawSub() {
  const manual = effectiveProduction(current.config, current.delivery) === 'external';
  $('project-sub').textContent = `${current.repo.private ? 'Privé' : 'Public'} · ${current.config.maxParallel} en parallèle${manual ? ' · Mise en production externe' : ''}`;
}
async function loadDelivery(project) {
  // A failed read keeps the mode known from the last visit; only a missing sheet (404, null) forgets it.
  const file = await api(`/repos/${project.repo.full_name}/contents/${STACK_FILE}`).catch(() => undefined);
  if (current !== project || file === undefined) return;
  const delivery = file?.content ? deliveryOf(fromBase64(file.content)) : null;
  if (JSON.stringify(delivery) === JSON.stringify(current.delivery)) return;
  current.delivery = delivery;
  drawSub();
  drawGap(); // a line read for the former mode is hidden at once
  drawRelease();
  refreshGap(true).catch(() => {});
  if (!$('rules').contains(document.activeElement)) renderRules();
}

// ---- Écart de production (issue #369) ---------------------------------------------------------------------------
// Under the project's name: is the live site up to date with the validated changes? A version is live only once its
// host reported a successful publication (production.mjs). Read at most once a minute, with ETags.
const GAP_MS = 60_000;
// Kept per project while this tab stays open (issue #397): `views` its last line with the mode it was read for, `at`
// when it was read, `busy` the read going and `again` the forced read waiting for it.
const gap = { at: new Map(), busy: new Map(), again: new Map(), views: new Map() };
function refreshGap(force = false) {
  const project = current;
  const repo = project.repo.full_name;
  // One read at a time per project: opening a project and its first refresh must not fire the same requests twice.
  // A forced read (its production mode just read) waits for the one going, never lost behind it. A read of another
  // project never holds this one up.
  const busy = gap.busy.get(repo);
  if (busy) {
    if (!force) return busy;
    if (!gap.again.has(repo)) {
      const next = busy.catch(() => {}).then(() => { if (gap.again.get(repo) === next) gap.again.delete(repo); return current === project ? refreshGap(true) : null; });
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
  const project = current;
  await boardGate;
  if (current !== project) return; // another project opened meanwhile: its own read comes with it
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
  if (current !== project || gapMode(project) !== mode) return;
  gap.views.set(repo, { mode, view });
  drawGap();
}
function drawGap() {
  const kept = current && gap.views.get(current.repo.full_name);
  const view = kept && kept.mode === gapMode(current) ? kept.view : null;
  const on = Boolean(view && view.kind !== 'none');
  $('prod-gap').hidden = !on;
  $('prod-gap-sep').hidden = !on;
  if (!on) return;
  $('prod-gap').textContent = view.text;
  $('prod-gap').classList.toggle('failed', view.kind === 'failed');
}
const gapDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
$('prod-gap').addEventListener('click', () => {
  const view = gap.views.get(current.repo.full_name)?.view;
  if (!view) return;
  const base = current.repo.html_url;
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
async function refreshRelease() {
  const repo = current.repo.full_name;
  if (current.config.production !== 'approval') { release.pending = []; return drawRelease(); }
  const res = await cachedGet(`/repos/${repo}/issues?state=closed&labels=${encodeURIComponent(AWAITING)}&per_page=100`);
  if (current.repo.full_name !== repo) return;
  release.repo = repo;
  release.pending = awaitingOf(repo, res.data);
  release.changelog = release.pending.length ? await versionedChangelog(repo) : null;
  if (current.repo.full_name !== repo) return;
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
function drawRelease() {
  const btn = $('release');
  const on = current?.config.production === 'approval';
  btn.hidden = !on;
  placeNewFeature();
  if (!on) return;
  const pending = release.repo === current.repo.full_name ? release.pending : [];
  // Issue #370: a release is on its way while its request is still open on the board (one at a time).
  const running = (live.issues || []).some((i) => i.labels.includes('factory:production'));
  const b = releaseButton(pending, running);
  // The count in the mono face (Mono Numbers Rule).
  const m = /^(.*) \((\d+)\)$/.exec(b.text);
  btn.replaceChildren(...(m ? [`${m[1]} `, el('span', { class: 'num' }, `(${m[2]})`)] : [b.text]));
  btn.setAttribute('aria-disabled', String(b.disabled));
  btn.title = b.hint;
}
async function sendRelease(pending, version) {
  const repo = current.repo.full_name;
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
  const log = release.repo === current.repo.full_name ? release.changelog : null;
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
  const repo = current.repo.full_name;
  if (now === 'approval') {
    // Validated changes now wait on preprod, started from main (the relay creates it too if this fails).
    const main = current.repo.default_branch || 'main';
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
const FACTORY_REPO = 'phoibe/factory';
let stableChanges = [];
async function refreshStable() {
  await boardGate;
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

$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  token = $('token').value.trim();
  store.set(TOKEN_KEY, token);
  $('login-error').textContent = '';
  start();
});
$('logout').addEventListener('click', () => {
  resetSession({ forget: true });
  show('login');
});
function loadScript(src) {
  return new Promise((ok, ko) => document.head.append(el('script', { src, onload: ok, onerror: ko })));
}

async function openPhone() {
  const link = phoneLink(location.href, token, readToken);
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
$('project-switch').addEventListener('click', () => {
  $('projects-dialog-list').replaceChildren(...projectItems());
  $('projects-dialog').showModal();
  $('projects-dialog-list').querySelector('[aria-current="true"]')?.focus();
  refreshDots();
});
$('projects-close').addEventListener('click', () => $('projects-dialog').close());
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
  if (current?.repo.full_name !== repo) return;
  $('stack-date').textContent = sheet.date;
  $('stack-date').hidden = !sheet.date;
  $('stack-body').replaceChildren(...stackNodes(sheet.parsed));
}

async function openStack() {
  if (!current) return;
  const repo = current.repo.full_name;
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
    if (current?.repo.full_name !== repo) return;
    // A sheet already shown stays: only a fresh copy failed.
    if (cached) { toast("La fiche n'a pas pu être actualisée."); return; }
    const retry = el('button', { type: 'button', onclick: () => openStack().catch(() => {}) }, 'Réessayer');
    stackState("La fiche ne s'est pas chargée.", retry, true);
    return;
  }
  if (current?.repo.full_name !== repo) return;
  if (!file?.content) { stackCache.delete(repo); return showNoStack(repo); }
  const sheet = { parsed: parseStack(fromBase64(file.content)), date: stackDate(commits?.[0]?.commit?.committer?.date) };
  stackCache.set(repo, sheet);
  showStack(repo, sheet);
}

// No sheet yet: either its card is already on its way, or the owner can ask for it.
async function showNoStack(repo) {
  const open = ((await api(`/repos/${repo}/issues?labels=factory:stack&state=open&per_page=10`).catch(() => [])) || [])
    .find((i) => !i.pull_request && (i.labels || []).some((l) => (l.name || l) === 'factory:stack'));
  if (current?.repo.full_name !== repo) return;
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
    if (current?.repo.full_name === repo) {
      stackState("L'agent rédige la fiche.", followLink(card?.html_url));
      $('stack-close').focus();
      renderBoard().catch(() => {});
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
  if (!current) return;
  if (!confirm(question)) return;
  const btn = $(buttonId);
  btn.disabled = true;
  try {
    const issue = await api(`/repos/${current.repo.full_name}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, labels: [label], body }),
    });
    toast(done);
    if (issue?.html_url) window.open(issue.html_url, '_blank', 'noopener');
    await renderBoard();
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
// ---- Agent (chat) -------------------------------------------------------------------------------
// A chat with the agent. Two ways to reach it:
// - the chat server (server/chat on Modal, address in chat-server.json): the answer streams back within
//   seconds; conversations are JSON files on the project's `factory-chat` branch, read again every 30 s with
//   ETags (issue #563: an unchanged one is a free « 304 »);
// - otherwise, each conversation is a `factory:question` issue that wakes the agent's routine (a minute or
//   more). While an answer is awaited it is checked every 4 s, otherwise every 15 s, with ETags.
// Either way the owner only ever sees the chat.
const SEEN_KEY = 'factory.chat.seen';
const EXAMPLES = [
  'Que se passe-t-il si je ferme l\'appli au milieu d\'une saisie ?',
  'Je voudrais pouvoir exporter mes données.',
  'Le bouton « Enregistrer » ne réagit pas sur mon téléphone.',
];
// Issue #535: the conversations to put away once the agent's turn is over (id → what to say), kept in the browser so
// that a reload, another conversation or another project on the way does not lose them.
const LATER_KEY = 'factory.chat.later';
function laterMarks(repo) {
  const key = `${LATER_KEY}.${repo}`;
  // Read again at each use: another tab of the board may have added or used up one meanwhile.
  const read = () => {
    try {
      const saved = JSON.parse(store.get(key) || '[]');
      return new Map(Array.isArray(saved) ? saved.filter((e) => Array.isArray(e) && e.length === 2) : []);
    } catch { return new Map(); }
  };
  const save = (marks) => (marks.size ? store.set(key, JSON.stringify([...marks])) : store.del(key));
  return {
    has: (id) => read().has(id),
    get: (id) => read().get(id),
    set: (id, said) => { const marks = read(); marks.set(id, said); save(marks); },
    delete: (id) => { const marks = read(); if (marks.delete(id)) save(marks); },
    ids: () => [...read().keys()],
  };
}

const chat = { error: false, repo: null, list: null, open: null, issue: null, comments: [], etags: new Map(), timer: null, busy: false, pending: null, seen: {}, files: [], images: new Map(), server: null, conv: null, live: null, warmed: 0, badge: null, run: null, decided: new Map(), deciding: new Set(), refused: new Map(), later: laterMarks(null), created: createdMarks(store, null), recording: false };
const MAX_IMAGES = 4;

function resetChat() {
  clearTimeout(chat.timer);
  // A send still running belongs to the project the owner just left: it finishes without touching the screen.
  Object.assign(chat, { error: false, repo: current.repo.full_name, list: null, open: null, issue: null, comments: [], etags: new Map(), pending: null, conv: null, live: null, badge: null, run: null, sending: false, files: [], deciding: new Set(), refused: new Map(), later: laterMarks(current.repo.full_name), created: createdMarks(store, current.repo.full_name) });
  // A request made here whose choice is not recorded yet shows « Créée » with its link (review #556).
  chat.decided = new Map(chat.created.entries());
  $('chat-send').disabled = false;
  // A draft belongs to the project it was written for.
  $('chat-input').value = '';
  drawPendingImages();
  autosize();
  try { chat.seen = JSON.parse(store.get(`${SEEN_KEY}.${chat.repo}`) || '{}'); } catch { chat.seen = {}; }
  $('chat').classList.remove('viewing');
  // The old project's « new answers » count goes with it.
  $('chat-badge').hidden = true;
  $('chat-badge-label').textContent = '';
  if (!$('chat').hidden) openChat(); else scheduleChat(2000);
}

function markSeen(issue) {
  chat.seen[issue.number] = issue.comments || 0;
  store.set(`${SEEN_KEY}.${chat.repo}`, JSON.stringify(chat.seen));
}

// Instant mode: the time of the conversation whose answer is on screen.
function markServerSeen(id, updated) {
  chat.seen[id] = updated;
  store.set(`${SEEN_KEY}.${chat.repo}`, JSON.stringify(chat.seen));
}

// The open conversation is on screen: the Agent tab is shown and, on a phone, the thread rather than the list.
// The general page hides the tabs with CSS only: while it is open, the chat is not on screen (review #556).
const chatAway = () => $('chat').hidden || $('project-view').classList.contains('on-general');
const threadShown = () => !chatAway() && (!matchMedia('(max-width: 700px)').matches || $('chat').classList.contains('viewing'));

const isUnread = (c) => (chat.server ? serverUnread(c, chat.seen) : unread(c, chat.seen));

async function chatGet(path) {
  const hit = chat.etags.get(path);
  const res = await fetch(API + path, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...(hit ? { 'if-none-match': hit.etag } : {}) },
  });
  if (res.status === 304 && hit) return hit.data;
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw httpError(res.status, (await res.json().catch(() => ({}))).message);
  const data = guardRead(path, await res.json());
  const etag = res.headers.get('etag');
  if (etag) chat.etags.set(path, { etag, data });
  return data;
}

// Instant mode needs the read-only token: without it the « Agent » tab shows only the card that asks for it.
const needsReadToken = () => Boolean(chat.server) && !readToken;
function drawReadTokenCard() {
  const needed = needsReadToken();
  $('chat').classList.toggle('needs-token', needed);
  // Issue #473: the card has no full-screen button, so never leave the owner in full screen without a way out.
  if (needed && document.body.classList.contains('chat-fullscreen')) setChatFull(false);
  $('chat-setup').hidden = !needed;
  $('read-token-link').href = READ_TOKEN_URL;
  return needed;
}

// Forgets a read token the chat server refused (expired, deleted, or one that can write) and asks for a new one.
function readTokenRefused(message) {
  store.del(READ_TOKEN_KEY);
  readToken = null;
  drawReadTokenCard();
  showReadTokenError(message);
}

// Shows a refusal on the read-token card, never breaking a line at the hyphen of « ci-dessus » or « créez-en », nor
// leaving a « : » alone at the start of a line (issue #558).
function showReadTokenError(message) {
  const parts = String(message || '').split(/(\S*-\S+|\S+ [:;!?])/).map((part, i) => {
    if (i % 2 === 0) return part;
    const span = document.createElement('span');
    span.className = 'nowrap';
    span.textContent = part;
    return span;
  });
  $('read-token-error').replaceChildren(...parts.filter((part) => part !== ''));
}

// Checks a pasted read token with GitHub: it is a fine-grained one, belongs to the owner, reads the project, and cannot
// write (issue #558: nor launch automated tasks, change settings, or add an SSH key to the account).
async function checkReadToken(value) {
  if (value === token) return readTokenProblem({ same: true });
  if (!fineGrained(value)) return readTokenProblem({ classic: true }); // before sending it anywhere
  const call = (path, init = {}) => fetch(API + path, { ...init, cache: 'no-store', headers: { authorization: `Bearer ${value}`, accept: 'application/vnd.github+json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  // A 403's message is read too: a secondary rate limit may say so only there.
  const down = async (r) => githubBusy(r.status, r.headers, r.status === 403 ? (await r.clone().json().catch(() => ({})))?.message : '');
  const user = await call('/user');
  if (await down(user)) throw new Error('github');
  const owner = current.repo.owner?.login || current.repo.full_name.split('/')[0];
  if (user.status === 401) return readTokenProblem({ status: 401, owner });
  if (!user.ok) throw new Error('github');
  if (hasScopes(user.headers)) return readTokenProblem({ classic: true }); // only a classic token has scopes
  const { login } = await user.json();
  const repo = current.repo.full_name;
  // The commit-status probe needs a commit: the project's last one, read with this token (a read it may do). The other
  // probes do not wait for it. Without one to read (mostly a token that cannot see the project, 404), any 40-hex id
  // does: GitHub refuses the token or the empty body first.
  const head = call(`/repos/${repo}/commits/HEAD`, { headers: { accept: 'application/vnd.github.sha' } });
  const sha = head.then(async (r) => {
    if (await down(r)) throw new Error('github');
    const text = r.ok ? (await r.text()).trim() : '';
    return /^[0-9a-f]{40}$/.test(text) ? text : NO_SHA;
  });
  const [file, ...probes] = await Promise.all([call(`/repos/${repo}/contents/factory.config.json`),
    ...WRITE_PROBES.map(async ([method, path]) => call(probeUrl(repo, path, path.includes('{sha}') ? await sha : ''), { method, body: '{}' }))]);
  if ((await Promise.all([file, ...probes].map(down))).some(Boolean)) throw new Error('github');
  return readTokenProblem({ status: user.status, login, owner, readable: file.ok, writable: probes.some((p) => probeSaysWritable(p.status)) });
}

$('read-token-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = $('read-token').value.trim();
  if (!value || !current) return;
  const btn = $('read-token-save');
  const field = $('read-token');
  const fail = (message) => { showReadTokenError(message); field.setAttribute('aria-invalid', 'true'); field.focus(); };
  btn.disabled = true;
  btn.textContent = 'Vérification…';
  $('read-token-form').setAttribute('aria-busy', 'true');
  $('read-token-error').textContent = '';
  field.removeAttribute('aria-invalid');
  try {
    const problem = await checkReadToken(value);
    if (problem) return fail(problem);
    readToken = value;
    store.set(READ_TOKEN_KEY, value);
    $('read-token').value = '';
    await openChat();
    $('chat-input').focus();
  } catch {
    fail('GitHub ne répond pas, réessayez dans un instant.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Valider le jeton';
    $('read-token-form').removeAttribute('aria-busy');
  }
});

async function openChat() {
  if (!current) return;
  if (chat.repo !== current.repo.full_name) return resetChat();
  if (drawReadTokenCard()) return;
  pickDefaultConversation(); // the list fetched in the background, if any
  // Wakes the chat server up while the owner types (it sleeps when unused).
  if (chat.server && Date.now() - chat.warmed > 60_000) { chat.warmed = Date.now(); fetch(`${chat.server}/health`).catch(() => {}); }
  drawChat();
  await refreshChat();
}

// A JSON file of the `factory-chat` branch, or null. Read with its ETag (issue #563): an unchanged file is a free « 304 »
// and is parsed again from the text kept, so a change made on screen to the last copy never comes back.
async function branchJson(path) {
  const cache = chat.etags; // captured: a project switch mid-fetch must not write into the new project's map
  const url = `${API}/repos/${chat.repo}/contents/${path}?ref=${CHAT_BRANCH}`;
  const hit = cache.get(url);
  const res = await fetch(url, {
    cache: 'no-store', headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github.raw', ...(hit ? { 'if-none-match': hit.etag } : {}) },
  });
  if (res.status === 304 && hit) return JSON.parse(hit.text);
  if (res.status === 404) { cache.delete(url); return null; }
  if (!res.ok) throw httpError(res.status, (await res.json().catch(() => ({}))).message);
  const text = await res.text();
  const data = JSON.parse(text);
  const etag = res.headers.get('etag');
  if (etag) cache.set(url, { etag, text }); else cache.delete(url);
  return data;
}

async function refreshServerChat() {
  const repo = chat.repo;
  const index = await branchJson('index.json');
  if (chat.repo !== repo) return;
  chat.list = serverList(index);
  pickDefaultConversation();
  const id = chat.open;
  if (id && id !== 'new' && !chat.live) {
    const conv = await branchJson(`chats/${id}.json`);
    // An answer that could not be saved stays on screen (issue #395): the stored version does not have it.
    if (chat.repo === repo && chat.open === id && !chat.live && !(chat.conv?.unsaved && chat.conv.id === id)) chat.conv = conv;
    const entry = chat.list.find((c) => c.id === id);
    if (chat.repo === repo && chat.open === id && conv && entry && threadShown()) markServerSeen(id, entry.updated);
  }
}

// Once per project, when its conversations first arrive (issue #477): open the most recent one still open,
// else a new one. A draft already started keeps the new conversation.
// Only while the tab is shown: a background check from another tab must not choose (nor poll) a conversation.
function pickDefaultConversation() {
  if (chat.open != null || !chat.list || $('chat').hidden) return;
  const drafting = chat.live || chat.sending || chat.pending || chat.files.length || $('chat-input').value.trim();
  chat.open = drafting ? 'new' : defaultConversation(chat.list, Boolean(chat.server));
  if (chat.open === 'new') return;
  $('chat').classList.add('viewing');
  // Its answers are already there, not new ones: nothing to read out.
  announced = { id: chat.open, count: Infinity };
  drawChat(); // its title and « Chargement… » at once, never the new conversation meanwhile
}

async function refreshChat() {
  if (chat.busy) return;
  chat.busy = true;
  const repo = chat.repo;
  const clicks = chat.clicks;
  try {
    if (chat.server) { await refreshServerChat(); chat.error = false; drawChat(); return; }
    const list = await chatGet(`/repos/${repo}/issues?labels=${encodeURIComponent(CHAT_LABEL)}&state=all&sort=updated&direction=desc&per_page=50`);
    if (chat.repo !== repo) return;
    chat.list = conversations(list);
    chat.error = false;
    pickDefaultConversation();
    if (typeof chat.open === 'number') {
      const n = chat.open;
      const issue = await chatGet(`/repos/${repo}/issues/${n}`);
      const pages = Math.max(1, Math.ceil((issue.comments || 0) / 100));
      const comments = [];
      for (let p = 1; p <= pages; p++) comments.push(...trustNotes(await chatGet(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${p}`), repo.split('/')[0]));
      if (chat.repo !== repo || chat.open !== n) return;
      chat.issue = issue;
      chat.comments = comments;
      // The pending message shows until GitHub lists it.
      if (chat.pending && chatMessages(issue, comments).some((m) => m.who === 'me' && m.text === chat.pending.text && (m.images?.length || 0) === chat.pending.previews.length)) chat.pending = null;
      // Seen only when the answer is on screen: fetched in the background, it stays new. The owner's own
      // message, listed after they left, is never news.
      if (threadShown() || chatMessages(issue, comments).at(-1)?.who === 'me') markSeen(issue);
    }
    drawChat();
  } catch (err) {
    if (!chat.list) { chat.error = true; if (!$('chat').hidden) drawChatList(); }
    else if (!$('chat').hidden) toast('GitHub ne répond pas. Nouvel essai dans quelques secondes.');
  } finally {
    chat.busy = false;
    // The project or the conversation changed meanwhile (the owner clicked another one): fetch it now.
    scheduleChat(chat.repo !== repo || chat.clicks !== clicks ? 0 : undefined);
    // In both modes (the instant one returns early above), issue #535.
    if (chat.repo === repo) finishWhenDone();
    if (chat.repo === repo) recordCreated().catch(() => {});
  }
}

// Review #556: a request created here whose choice could not be written in its conversation is written at a later
// refresh. A card decided meanwhile (another device), or gone, only drops the mark: the request exists either way.
async function recordCreated() {
  const marks = chat.created, repo = chat.repo, server = chat.server, later = chat.later;
  const todo = marks.pending().filter(([key]) => !chat.deciding.has(key) && !decidingAnywhere.has(flightKey(repo, key)));
  if (!todo.length || chat.recording) return;
  chat.recording = true;
  let recorded = false;
  try {
    for (const [key, { url }] of todo) {
      const cut = key.lastIndexOf(':');
      const open = key.slice(0, cut), id = key.slice(cut + 1);
      try {
        let wrote = !server;
        if (server) {
          const path = `chats/${open}.json`;
          const { data } = await chatFile(repo, path);
          const card = (data?.messages || []).flatMap((m) => m.proposals || []).find((x) => x.id === id);
          if (card?.state === 'pending') {
            wrote = true;
            await writeChatFile(repo, path, (latest) => {
              if (!latest || !decideProposal(latest, id, 'created', url)) throw new Error('not recorded');
              return latest;
            }, `chore(factory): chat ${open}`);
          }
        } else {
          await api(`/repos/${repo}/issues/${open}/comments`, { method: 'POST', body: JSON.stringify({ body: decisionComment(id, 'created', url) }) });
          // One more comment on the conversation: already seen, never a « new answer ».
          if (chat.repo === repo && chat.seen[open] != null) {
            chat.seen[open] += 1;
            store.set(`${SEEN_KEY}.${repo}`, JSON.stringify(chat.seen));
          }
        }
        marks.delete(key);
        // Recorded now: the conversation is put away once its agent is done, as after a click (finishWhenDone).
        if (wrote) { later.set(server ? open : Number(open), FINISHED_SAID); recorded = true; }
      } catch (e) {
        // Gone, or locked: it will never pass. The request exists either way, so the mark is kept: the card stays
        // « Créée » and is never offered again, it is only no longer retried (review #556, round 3).
        if (e?.status === 404 || e?.status === 410 || (e?.status === 403 && /locked/i.test(e.githubMessage || ''))) marks.keep(key);
        /* otherwise tried again at the next refresh */
      }
    }
  } finally {
    chat.recording = false;
  }
  if (recorded && chat.repo === repo) await finishWhenDone();
}

// Every 4 s while an answer is awaited; otherwise every 15 s on « Agent », 30 s from the other tabs.
function scheduleChat(delay) {
  clearTimeout(chat.timer);
  if (!current || !chat.repo) return;
  const away = chatAway();
  if (delay == null && chat.server) delay = 30_000; // only picks up other devices' messages
  if (delay == null) {
    const waiting = chat.pending || (chat.issue && chatStatus(chat.issue, chatMessages(chat.issue, chat.comments)) === 'thinking')
      || (chat.list || []).some((c) => c.state === 'open' && c.labels?.some((l) => l.name === 'factory:running'));
    delay = waiting ? 4000 : away ? 30_000 : 15_000;
  }
  chat.timer = setTimeout(refreshChat, delay);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (current && chat.repo) refreshChat();
});

// The chat shows « and » glued to their word (quoteParts): during a copy that touches them, the glued spaces
// turn back into the message's own spaces, so the browser copies the exact text (plain and rich), then the
// screen gets them back. The page fills the clipboard itself: some Chromium versions turn a lone space of a
// copied <span> into &nbsp; in the rich copy.
document.addEventListener('copy', (e) => {
  const sel = getSelection();
  if (!sel || sel.isCollapsed) return;
  const glued = [...document.querySelectorAll('#chat-messages .glue')].filter((g) => sel.containsNode(g, true));
  if (!glued.length) return;
  // insertData then deleteData, not a new `data`: a selection ending inside the glue keeps its place.
  const swap = (g, v) => { const t = g.firstChild; const n = t.length; t.insertData(0, v); t.deleteData(v.length, n); };
  for (const g of glued) swap(g, g.dataset.v);
  setTimeout(() => { for (const g of glued) swap(g, '\u00A0'.repeat(g.dataset.v.length)); });
  if (!e.clipboardData) return;
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
  for (const g of box.querySelectorAll('.glue')) g.replaceWith(g.textContent);
  e.clipboardData.setData('text/plain', sel.toString());
  e.clipboardData.setData('text/html', box.innerHTML);
  e.preventDefault();
});

const timeOf = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const quoted = (text, edges) => quoteParts(text, edges).map((q) => (q.t === 'text' ? q.v
  : el('span', { class: 'glue', 'data-v': q.v }, '\u00A0'.repeat(q.v.length))));
// A bold, italic, link or code part next to a text part may hold the word its guillemet belongs to.
const holdsWord = (p) => p != null && p.t !== 'text' && p.t !== 'br';

function inlineNodes(parts) {
  return parts.flatMap((p, i) => {
    if (p.t === 'text') return quoted(p.v, { before: holdsWord(parts[i - 1]), after: holdsWord(parts[i + 1]) });
    if (p.t === 'br') return el('br');
    if (p.t === 'code') return el('code', {}, p.v);
    if (p.t === 'b') return el('strong', {}, inlineNodes(p.c));
    if (p.t === 'i') return el('em', {}, inlineNodes(p.c));
    if (p.t === 'a') return el('a', { href: p.href, target: '_blank', rel: 'noopener' }, inlineNodes(p.c));
    return null;
  });
}

// Issue #460: one click copies a command or a whole answer; a short word on the button confirms it.
async function copyText(btn, text) {
  const label = btn.querySelector('.copy-label');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {}
  btn.classList.toggle('copied', ok);
  label.textContent = ok ? 'Copié ✓' : 'Copie impossible';
  clearTimeout(btn.reset);
  btn.reset = setTimeout(() => { btn.classList.remove('copied'); label.textContent = btn.dataset.label; }, 2000);
}

const COPY_ICON = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return svg;
};

const copyButton = (label, cls, getText) => el('button', { type: 'button', class: `copy ${cls}`, 'data-label': label, onclick: (e) => copyText(e.currentTarget, getText()) },
  COPY_ICON(), el('span', { class: 'copy-label', 'aria-live': 'polite' }, label));

const TONE_NAMES = { warn: 'Attention', ok: 'Réussite', todo: 'À faire' };

function richText(text) {
  return markdown(text).map((b) => {
    if (b.type === 'p') return el('p', {}, inlineNodes(b.inline));
    if (b.type === 'quote') return el('blockquote', {}, inlineNodes(b.inline));
    if (b.type === 'callout') return el('p', { class: `callout ${b.tone}` }, el('span', { class: 'visually-hidden' }, `${TONE_NAMES[b.tone]} : `), inlineNodes(b.inline));
    if (b.type === 'pre') return el('div', { class: 'code' }, el('pre', {}, b.v), copyButton('Copier', 'copy-code', () => b.v));
    return el(b.type, {}, b.items.map((it) => el('li', {}, inlineNodes(it))));
  });
}

// Images live on the attachments branch; a private repository serves them only with the token, so each is
// fetched once and shown from a local copy.
function chatImage(path) {
  const img = el('img', { alt: 'Image envoyée', loading: 'lazy' });
  const link = el('a', { class: 'shot', target: '_blank', rel: 'noopener', 'aria-label': 'Agrandir l\'image', onclick: (e) => {
    if (!img.src || e.metaKey || e.ctrlKey || e.shiftKey) return; // a new tab when asked for
    e.preventDefault();
    openLightbox(img.src);
  } }, img);
  const show = (url) => { img.src = url; link.href = url; };
  if (path.startsWith('blob:')) { show(path); return link; }
  if (!chat.images.has(path)) {
    chat.images.set(path, fetch(`${API}/repos/${chat.repo}/contents/${path}?ref=${ATTACHMENTS_BRANCH}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github.raw' },
    }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((b) => URL.createObjectURL(b))
      .catch(() => { chat.images.delete(path); return null; }));
  }
  chat.images.get(path).then((url) => { if (url) show(url); else link.classList.add('broken'); });
  return link;
}

function openLightbox(src) {
  $('lightbox-img').src = src;
  $('lightbox').showModal();
}

function bubble(m) {
  const pics = (m.images || []).map(chatImage);
  const text = !m.text ? [] : m.who === 'agent' ? richText(m.text) : [el('p', {}, m.text.split('\n').flatMap((l, i) => (i ? [el('br'), ...quoted(l)] : quoted(l))))];
  return el('li', { class: `msg ${m.who}` },
    pics.length ? el('div', { class: 'shots' }, pics) : null,
    text.length ? el('div', { class: 'bubble' }, text) : null,
    ...(m.issues || []).map((i) => el('a', { class: 'issue-chip', href: safeGithubUrl(i.url), target: '_blank', rel: 'noopener' },
      el('strong', {}, i.kind === 'bug' ? 'Bug créé' : 'Fonctionnalité créée'), ` · ${i.title}`, el('span', { 'aria-hidden': 'true' }, ' ↗'))),
    ...(m.proposals || []).map(proposalCard),
    el('div', { class: 'msg-foot' },
      el('span', { class: 'meta' }, m.who === 'agent' ? 'Agent · ' : '', m.at ? timeOf(m.at) : 'envoi…'),
      m.who === 'agent' && m.text ? copyButton('Copier la réponse', 'copy-answer', () => m.text) : null));
}

// « Réfléchit… 0:42 · d'habitude, environ 1 à 2 min », the time ticking every second (issue #460).
const USUAL_WAIT = 'd\'habitude, environ 1 à 2 min';
function thinkingMeta(label, since) {
  const at = Date.parse(since || '') || Date.now();
  return el('span', { class: 'meta thinking-meta' }, label, ' ',
    el('span', { class: 'num', 'data-since': String(at) }, elapsed(Date.now() - at)),
    el('span', { class: 'usual' }, ` · ${USUAL_WAIT}`));
}
setInterval(() => {
  for (const n of document.querySelectorAll('[data-since]')) n.textContent = elapsed(Date.now() - Number(n.dataset.since));
}, 1000);


// ---- Requests the agent proposes (issue #492) ----------------------------------------------------
// Nothing is created until the owner clicks « Créer cette demande » on the card under the answer.
const cardKey = (p) => `${chat.open}:${p.id}`;
// A card being decided, by project: it outlives a project switch (resetChat), so coming back during the creation
// never offers a second one, and recordCreated never writes a choice decide is still writing (review #556).
const decidingAnywhere = new Set();
const flightKey = (repo, key) => `${repo}\n${key}`;

function proposalCard(p) {
  const key = cardKey(p);
  const s = { ...p, ...chat.decided.get(key) };
  const busy = chat.deciding.has(key) || decidingAnywhere.has(flightKey(chat.repo, key));
  const kind = s.kind === 'bug' ? 'Bug' : 'Fonctionnalité';
  const outcome = s.state === 'created'
    ? el('p', { class: 'proposal-done created' }, el('span', { class: 'proposal-check', 'aria-hidden': 'true' }, '✓'), el('strong', {}, 'Créée'),
      el('a', { href: safeGithubUrl(s.url), target: '_blank', rel: 'noopener' }, 'Voir la demande', el('span', { 'aria-hidden': 'true' }, ' ↗')))
    : s.state === 'ignored' ? el('p', { class: 'proposal-done' }, el('span', { 'aria-hidden': 'true' }, '✕'), 'Ignorée')
      : el('div', { class: 'proposal-actions' },
        el('button', { type: 'button', class: 'proposal-create', disabled: busy, 'aria-busy': busy ? 'true' : false, onclick: () => decide(p, 'created') }, busy ? 'Création…' : 'Créer cette demande'),
        el('button', { type: 'button', class: 'ghost', disabled: busy, onclick: () => decide(p, 'ignored') }, 'Ignorer'));
  return el('div', { class: `proposal${s.state === 'pending' ? '' : ' decided'}`, role: 'group', 'aria-label': `${kind} proposée : ${s.title}` },
    el('p', { class: 'proposal-kind' }, kind),
    el('p', { class: 'proposal-title' }, s.title),
    s.body ? el('details', {}, el('summary', {}, 'Lire le texte'), el('div', { class: 'proposal-body' }, richText(s.body))) : null,
    s.state === 'pending' && chat.refused.has(key) ? el('p', { class: 'proposal-error', role: 'alert' }, chat.refused.get(key) === 'ignored' ? 'Ce choix n\'a pas pu être enregistré. Réessayez dans un instant.' : 'La demande n\'a pas pu être créée. Réessayez dans un instant.') : null,
    outcome);
}

// The owner's choice on a card. A request is created once: the button is off while it is made, and in instant mode
// the stored conversation is read again first (another device may have decided already).
async function decide(p, state) {
  const key = cardKey(p);
  if (chat.deciding.has(key) || chat.decided.has(key) || decidingAnywhere.has(flightKey(chat.repo, key))) return;
  // Made from another tab of this browser and not recorded yet.
  if (chat.created.entries().some(([k]) => k === key)) return;
  const repo = chat.repo, open = chat.open, server = chat.server;
  // Only leaving the project ends what this click may show (resetChat makes new maps); sending a message does not.
  // The marks too: a request made here is remembered for this project, whatever is on screen when it is made.
  const decided = chat.decided, deciding = chat.deciding, refused = chat.refused, later = chat.later, marks = chat.created;
  const gone = () => chat.decided !== decided;
  const here = () => !gone() && chat.open === open;
  deciding.add(key);
  decidingAnywhere.add(flightKey(repo, key));
  refused.delete(key);
  drawChat();
  let url, finish = false, earlier = false;
  try {
    const path = `chats/${open}.json`;
    // An answer that could not be saved lives only on screen: its cards are decided there. Every other card is read
    // again from the stored conversation first (another device may have decided it already).
    let unsaved = null;
    if (server) {
      const { data } = await chatFile(repo, path);
      const stored = (data?.messages || []).flatMap((m) => m.proposals || []).find((x) => x.id === p.id);
      if (!stored) {
        if (chat.conv?.id === open && chat.conv.unsaved) unsaved = chat.conv;
        else throw new Error('card not found');
      } else if (stored.state !== 'pending') {
        if (here() && !chat.conv?.unsaved) chat.conv = data;
        else decided.set(key, { state: stored.state, ...(stored.url ? { url: stored.url } : {}) });
        return;
      }
    }
    if (state === 'created') url = (await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify(issueRequest(p)) })).html_url;
    decided.set(key, { state, ...(url ? { url } : {}) });
    // Until the choice is in the conversation, this device remembers the request and its link (review #556).
    if (url && !unsaved) marks.set(key, url);
    try {
      if (unsaved) decideProposal(unsaved, p.id, state, url);
      else if (server) {
        const conv = await writeChatFile(repo, path, (latest) => {
          // Never written from another conversation, nor when the card is gone or was decided meanwhile.
          if (!latest || !decideProposal(latest, p.id, state, url)) throw new Error('not recorded');
          return latest;
        }, `chore(factory): chat ${open}`);
        if (here() && !chat.conv?.unsaved) chat.conv = conv;
      } else {
        await api(`/repos/${repo}/issues/${open}/comments`, { method: 'POST', body: JSON.stringify({ body: decisionComment(p.id, state, url) }) });
        // The choice is one more comment on the conversation: already seen, never a « new answer ».
        if (chat.repo === repo && chat.seen[open] != null) {
          chat.seen[open] += 1;
          store.set(`${SEEN_KEY}.${repo}`, JSON.stringify(chat.seen));
        }
      }
      marks.delete(key);
      // Never while an answer is on its way (it may bring new cards), nor while another card of it is being decided.
      if (!unsaved && here()) {
        // An answer still on its way: the end waits for it (finishWhenDone, issue #521).
        if (answering()) later.set(open, state === 'created' || later.get(open) ? FINISHED_SAID : '');
        else {
          // The turn is over: this click decides now, and a mark left from the turn is used up here.
          earlier = Boolean(later.get(open));
          later.delete(open);
          finish = !chat.conv?.unsaved && ![...deciding].some((k) => k !== key && k.startsWith(`${open}:`)) && finishesConversation(conversationCards(open, decided));
        }
      } else if (!unsaved && !gone()) {
        // The owner went to another conversation meanwhile: it is put away from there, once its agent is done (#535).
        later.set(open, state === 'created' || later.get(open) ? FINISHED_SAID : '');
      }
    } catch {
      if (!gone()) toast(state === 'created' ? 'Demande créée, mais ce choix n\'a pas pu être enregistré dans la conversation.' : 'Ce choix n\'a pas pu être enregistré dans la conversation.');
    }
  } catch {
    refused.set(key, state); // said on the card itself, next to the button to try again
  } finally {
    deciding.delete(key);
    decidingAnywhere.delete(flightKey(repo, key));
    // Back on this project during the click: the screen's maps are new ones, they learn the request here.
    if (gone() && url && chat.repo === repo) chat.decided.set(key, { state: 'created', url });
    if (!gone() || chat.repo === repo) drawChat();
    if (url) renderBoard().catch(() => {});
  }
  if (finish) await closeConversation({ stay: true, said: state === 'created' || earlier ? FINISHED_SAID : undefined });
  else if (!gone()) finishWhenDone();
}

const FINISHED_SAID = 'Demande créée, conversation rangée dans « Terminées »';

// Issue #521: a card decided while the agent was still on its turn ends the conversation once that turn is over, if
// every card is then decided and a request was created (the answer may have brought new cards: then it stays open).
// Issue #535: checked for every conversation waiting for it, the open one or not, at each refresh.
async function finishWhenDone() {
  const later = chat.later;
  if (chat.finishing === later || !later.ids().length) return;
  chat.finishing = later;
  try {
    for (const id of later.ids()) {
      if (chat.later !== later) return;
      if ([...chat.deciding].some((k) => k.startsWith(`${id}:`))) continue;
      const seen = id === chat.open ? openThread(id) : await otherThread(id);
      // Still on its turn, not loaded yet, no answer after a long wait, or GitHub did not answer: the next refresh checks again.
      if (!seen || chat.later !== later || !later.has(id)) continue;
      // Away from it, the message names the conversation: the one on screen is not the one put away.
      const title = id === chat.open ? null : chat.list?.find((c) => (chat.server ? c.id : c.number) === id)?.title;
      const said = title && later.get(id) ? `Demande créée, « ${title} » rangée dans « Terminées »` : later.get(id);
      later.delete(id);
      if (!seen.closed && finishesConversation(seen.cards)) await closeConversation({ id, stay: true, said: said || undefined });
    }
  } finally {
    if (chat.finishing === later) chat.finishing = null;
  }
}

// The instant-mode conversations whose answer is on its way (« owner/repo:id »), whatever project is on screen.
const streaming = new Set();

// The open conversation as the screen has it, or null while its agent is on it.
function openThread(id) {
  if (answering() || streaming.has(`${chat.repo}:${id}`) || (chat.server ? chat.conv?.id !== id : chat.issue?.number !== id)) return null;
  if (!chat.server && chatStatus(chat.issue, chatMessages(chat.issue, chat.comments)) === 'late') return null;
  const closed = chat.server ? chat.list?.find((c) => c.id === id)?.state === 'closed' : chat.issue.state === 'closed';
  return { closed, cards: conversationCards(id, chat.decided) };
}

// Another conversation, read again from GitHub, or null while its agent is on it (or when it cannot be read).
async function otherThread(id) {
  const repo = chat.repo;
  const gone = { closed: true, cards: [] };
  try {
    if (chat.server) {
      if (chat.live || chat.sending || !chat.list || streaming.has(`${repo}:${id}`)) return null;
      const entry = chat.list.find((c) => c.id === id);
      if (!entry || entry.state === 'closed') return gone;
      const conv = await branchJson(`chats/${id}.json`);
      return chat.repo === repo && conv ? { closed: false, cards: threadCards(id, serverMessages(conv), chat.decided) } : null;
    }
    if (typeof id !== 'number') return gone;
    const issue = await chatGet(`/repos/${repo}/issues/${id}`);
    if (issue.state === 'closed') return gone;
    const comments = [];
    const pages = Math.max(1, Math.ceil((issue.comments || 0) / 100));
    for (let p = 1; p <= pages; p++) comments.push(...trustNotes(await chatGet(`/repos/${repo}/issues/${id}/comments?per_page=100&page=${p}`), repo.split('/')[0]));
    const messages = chatMessages(issue, comments);
    if (chat.repo !== repo || chatStatus(issue, messages) !== 'idle') return null;
    return { closed: false, cards: threadCards(id, messages, chat.decided) };
  } catch (e) {
    return e?.status === 404 ? gone : null;
  }
}

// The owner is waiting for an answer in the open conversation.
const answering = () => Boolean(chat.live || chat.sending || chat.pending)
  || (!chat.server && Boolean(chat.issue) && chatStatus(chat.issue, chatMessages(chat.issue, chat.comments)) === 'thinking');

// Every card of the open conversation, with the choices made on this screen (issue #516).
function conversationCards(open, decided) {
  const messages = chat.server ? serverMessages(chat.conv?.id === open ? chat.conv : null)
    : chat.issue?.number === open ? chatMessages(chat.issue, chat.comments) : [];
  return threadCards(open, messages, decided);
}

// The cards of a conversation's messages, with the choices made on this screen.
const threadCards = (id, messages, decided) => messages.flatMap((m) => m.proposals || []).map((p) => ({ ...p, ...decided.get(`${id}:${p.id}`) }));

// The answer being written by the chat server, updated in place as it streams.
function liveBubble() {
  const live = chat.live;
  return el('li', { class: 'msg agent', id: 'live-bubble' },
    live.text
      ? el('div', { class: 'bubble' }, richText(live.text))
      : el('div', { class: 'bubble typing', role: 'img', 'aria-label': 'L\'agent réfléchit' }, el('span'), el('span'), el('span')),
    thinkingMeta(live.status || 'Réfléchit…', live.since));
}

function drawLive() {
  const node = $('live-bubble');
  if (!node || !chat.live) return drawChat();
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  node.replaceWith(liveBubble());
  if (stick) list.scrollTop = list.scrollHeight;
}

function drawChatList() {
  const items = $('chat-items');
  if (!chat.list && chat.error) return items.replaceChildren(el('li', {}, el('div', { class: 'chat-error', role: 'alert' }, el('strong', {}, 'Impossible de charger les discussions'), el('span', { class: 'muted' }, 'Vérifiez votre connexion.'), el('button', { type: 'button', class: 'secondary', onclick: () => { chat.error = false; drawChatList(); refreshChat(); } }, 'Réessayer'))));
  if (!chat.list) return items.replaceChildren(el('li', { class: 'sk-chat' }, el('span', { class: 'visually-hidden' }, 'Chargement…'), el('span', { class: 'sk-bar', style: 'width:70%' }), el('span', { class: 'sk-bar', style: 'width:50%' })));
  if (!chat.list.length) return items.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Aucune conversation pour l\'instant.'));
  const open = chat.list.filter((c) => c.state === 'open');
  const done = chat.list.filter((c) => c.state !== 'open');
  const row = (c) => {
    const key = chat.server ? c.id : c.number;
    const thinking = chat.server ? Boolean(chat.live) && chat.open === key : c.state === 'open' && c.labels.some((l) => l.name === 'factory:running');
    const fresh = isUnread(c) && !(chat.open === key && threadShown());
    return el('li', {},
      el('button', { type: 'button', class: `conv${chat.open === key ? ' current' : ''}${fresh ? ' fresh' : ''}`, 'aria-current': chat.open === key ? 'true' : false, onclick: () => selectConversation(key) },
        el('span', { class: 'conv-title' }, c.title),
        el('span', { class: 'conv-meta' }, thinking ? el('span', { class: 'typing-dot', 'aria-hidden': 'true' }) : null,
          thinking ? 'L\'agent réfléchit' : fresh ? 'Nouvelle réponse' : timeOf(c.updated || c.updated_at))));
  };
  items.replaceChildren(...open.map(row), ...(done.length ? [el('li', { class: 'chat-sep' }, 'Terminées')] : []), ...done.map(row));
  const n = open.filter(isUnread).length;
  // Away from the thread, a screen reader hears that an answer came in (the badge itself is silent).
  if (chat.badge != null && n > chat.badge && !threadShown()) {
    const say = $('chat-badge-announce');
    say.textContent = '';
    requestAnimationFrame(() => { say.textContent = 'Nouvelle réponse de l\'agent.'; });
  }
  chat.badge = n;
  $('chat-badge').hidden = !n;
  $('chat-badge').textContent = String(n);
  $('chat-badge-label').textContent = n ? `${n} ${n > 1 ? 'nouvelles réponses' : 'nouvelle réponse'}` : '';
}

function drawChat() {
  fitChat();
  drawChatList();
  const isNew = (chat.open === 'new' || chat.open == null) && !chat.live;
  if (chat.server) return drawServerChat(isNew);
  $('chat-title').textContent = isNew ? 'Nouvelle conversation' : chat.issue?.title || chat.list?.find((c) => c.number === chat.open)?.title || '';
  $('chat-tools').hidden = isNew || !chat.issue;
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  if (isNew) {
    list.replaceChildren(el('li', { class: 'chat-intro' },
      el('p', { class: 'intro-title' }, 'Parlez à l\'agent de votre appli'),
      examples()));
  } else if (chat.issue && chat.issue.number === chat.open) {
    const messages = chatMessages(chat.issue, chat.comments);
    if (chat.pending) messages.push({ who: 'me', text: chat.pending.text, images: chat.pending.previews, at: null });
    const status = chat.pending ? 'thinking' : chatStatus(chat.issue, messages);
    const tail = status === 'thinking'
      ? el('li', { class: 'msg agent' }, el('div', { class: 'bubble typing', role: 'img', 'aria-label': 'L\'agent réfléchit' }, el('span'), el('span'), el('span')),
        thinkingMeta('Réfléchit…', chat.pending?.since || waitingSince(messages) || messages.findLast((m) => m.who === 'me')?.at))
      : status === 'late'
        ? el('li', { class: 'notice' }, 'Pas encore de réponse. Renvoyez votre message un peu plus tard.')
        : status === 'closed' ? el('li', { class: 'notice' }, 'Conversation terminée. Écrivez un message pour la reprendre.') : null;
    list.replaceChildren(...messages.map(bubble), ...(tail ? [tail] : []));
    announceAnswers(chat.issue.number, messages);
    $('chat-close').hidden = status === 'closed';
  } else {
    list.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Chargement…'));
  }
  if (stick || chat.pending) list.scrollTop = list.scrollHeight;
}

// The list is redrawn on every poll: only a new answer of the agent is read out, not the whole conversation again.
let announced = { id: null, count: 0 };
function announceAnswers(id, messages) {
  const count = messages.filter((m) => m.who === 'agent').length;
  // A new conversation gets its number with its first answer: still the same conversation.
  const same = announced.id === id || announced.id == null || announced.id === 'new';
  if (same && count > announced.count) {
    const live = $('chat-announce');
    live.textContent = ''; // the same words again must still be read out
    requestAnimationFrame(() => { live.textContent = 'Nouvelle réponse de l\'agent.'; });
  }
  announced = { id, count };
}

const examples = () => el('div', { class: 'examples' }, EXAMPLES.map((x) => el('button', { type: 'button', class: 'secondary example', onclick: () => { $('chat-input').value = x; autosize(); $('chat-input').focus(); } }, x)));

function drawServerChat(isNew) {
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const entry = chat.list?.find((c) => c.id === chat.open);
  $('chat-title').textContent = isNew ? 'Nouvelle conversation' : chat.conv?.title || entry?.title || (chat.live ? titleFrom(chat.pending?.text || 'Nouvelle conversation') : '');
  $('chat-tools').hidden = isNew || !chat.conv;
  $('chat-close').hidden = entry?.state === 'closed';
  if (isNew) {
    list.replaceChildren(el('li', { class: 'chat-intro' },
      el('p', { class: 'intro-title' }, 'Parlez à l\'agent de votre appli'),
      examples()));
  } else if (chat.conv || chat.live) {
    const messages = serverMessages(chat.conv);
    if (chat.pending) messages.push({ who: 'me', text: chat.pending.text, images: chat.pending.previews, at: null });
    const tail = chat.live ? liveBubble()
      : entry?.state === 'closed' ? el('li', { class: 'notice' }, 'Conversation terminée. Écrivez un message pour la reprendre.') : null;
    list.replaceChildren(...messages.map(bubble), ...(tail ? [tail] : []));
    announceAnswers(chat.open, messages);
  } else {
    list.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Chargement…'));
  }
  if (stick || chat.pending) list.scrollTop = list.scrollHeight;
}

function selectConversation(n) {
  if (chat.live && n !== chat.open) return toast('Attendez la fin de la réponse en cours.');
  chat.open = n;
  chat.clicks = (chat.clicks || 0) + 1; // a check already running fetches the old one: refreshChat checks again at once
  chat.pending = null;
  if (chat.issue?.number !== n) { chat.issue = null; chat.comments = []; }
  if (chat.conv?.id !== n) chat.conv = null;
  $('chat').classList.add('viewing');
  drawChat();
  const list = $('chat-messages');
  list.scrollTop = list.scrollHeight;
  if (n !== 'new') { clearTimeout(chat.timer); refreshChat(); }
  if (n === 'new' || matchMedia('(pointer: fine)').matches) $('chat-input').focus();
}

// The attachments branch holds images only (never merged); it is created on the first image.
async function ensureAttachmentsBranch(repo) {
  if (await api(`/repos/${repo}/branches/${ATTACHMENTS_BRANCH}`)) return;
  const tree = await api(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ tree: [
    { path: 'README.md', mode: '100644', type: 'blob', content: "# Pièces jointes\n\nImages envoyées par le propriétaire (chat du tableau, issues, PR), pour que l'agent puisse les voir. Ne pas fusionner.\n" },
    { path: 'vercel.json', mode: '100644', type: 'blob', content: '{ "git": { "deploymentEnabled": false } }\n' },
  ] }) });
  const commit = await api(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'chore(factory): attachments branch', tree: tree.sha, parents: [] }) });
  await api(`/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${ATTACHMENTS_BRANCH}`, sha: commit.sha }) }).catch((e) => {
    if (e.status !== 422) throw e; // 422: created meanwhile
  });
}

// Photos are scaled down to 1600 px and saved as JPEG: enough to read a screenshot, light to send.
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.88));
  const data = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(blob); });
  return data.split(',')[1];
}

async function uploadImages(repo, files) {
  if (!files.length) return [];
  await ensureAttachmentsBranch(repo);
  const paths = [];
  for (const f of files) {
    const path = imagePath('image/jpeg');
    await api(`/repos/${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: `chore(factory): chat image ${path}`, content: await shrink(f.file), branch: ATTACHMENTS_BRANCH }) });
    chat.images.set(path, Promise.resolve(f.url)); // already on screen: no download
    paths.push(path);
  }
  return paths;
}

function addImages(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  const room = MAX_IMAGES - chat.files.length;
  if (images.length > room) toast(`${MAX_IMAGES} images au plus par message.`);
  for (const file of images.slice(0, Math.max(0, room))) chat.files.push({ file, url: URL.createObjectURL(file) });
  drawPendingImages();
}

function drawPendingImages() {
  const box = $('chat-pending');
  box.hidden = !chat.files.length;
  box.replaceChildren(...chat.files.map((f, i) => el('div', { class: 'pending-image' },
    el('img', { src: f.url, alt: `Image ${i + 1} à envoyer` }),
    el('button', { type: 'button', class: 'remove', 'aria-label': `Retirer l'image ${i + 1}`, onclick: () => { chat.files.splice(i, 1); drawPendingImages(); } }, '×'))));
}

async function sendChat(text, withImages = true) {
  text = text.trim();
  const files = withImages ? [...chat.files] : [];
  if ((!text && !files.length) || !current) return;
  if (chat.sending) return;
  if (chat.server) return sendToServer(text, files, withImages);
  const repo = chat.repo;
  const btn = $('chat-send');
  const run = chat.run = {};
  const gone = () => chat.run !== run; // the owner switched project: nothing below may touch the new one
  btn.disabled = true;
  chat.sending = true;
  const sentTo = chat.open;
  chat.later.delete(sentTo); // writing again carries the conversation on: no end on the agent's previous turn (#521)
  try {
    if (typeof chat.open === 'number') { chat.pending = { text, previews: files.map((f) => f.url), since: new Date().toISOString() }; drawChat(); }
    const open = chat.open, wasClosed = chat.issue?.state === 'closed';
    const paths = await uploadImages(repo, files);
    const body = [text, ...paths.map((p) => imageBlock(repo, p))].filter(Boolean).join('\n\n');
    // Sent to the end even if the owner switched project meanwhile; only the screen updates below are skipped.
    if (typeof open !== 'number') {
      const issue = await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: titleFrom(text || 'Image envoyée'), labels: [CHAT_LABEL], body }) });
      if (gone()) return;
      chat.open = issue.number;
      chat.issue = issue;
      chat.comments = [];
      markSeen(issue);
    } else {
      if (wasClosed) await api(`/repos/${repo}/issues/${open}`, { method: 'PATCH', body: JSON.stringify({ state: 'open' }) });
      await api(`/repos/${repo}/issues/${open}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    }
    if (gone()) return;
    if (withImages) {
      $('chat-input').value = '';
      chat.files = [];
      drawPendingImages();
      autosize();
    }
    clearTimeout(chat.timer);
    chat.etags.clear();
    await refreshChat();
  } catch (e) {
    if (gone()) return;
    chat.pending = null;
    chat.later.delete(sentTo); // the turn never happened: no end of conversation on top of this error (#521)
    drawChat();
    toast(`Message non envoyé. ${errorText(e)} Votre texte est toujours là.`);
  } finally {
    if (!gone()) { chat.sending = false; btn.disabled = false; }
  }
}

// The open requests of the board shown, for the chat agent's duplicate check (issue #506); null when not loaded.
const boardRequests = (repo) => openRequests(live.repo === repo ? live.issues : null);

// Sends a message to the chat server and shows the answer as it is written.
async function sendToServer(text, files, withImages) {
  if (chat.live) return;
  const repo = chat.repo;
  const btn = $('chat-send');
  const run = chat.run = {};
  // The owner switched project: the answer is still read to the end (the server stops the agent when the panel hangs
  // up), then saved on the project it belongs to, but nothing is shown or restored on the other project.
  const gone = () => chat.run !== run;
  btn.disabled = true;
  const isNew = !chat.open || chat.open === 'new';
  // The marks of this project, even once the owner went to another one (they are read from the browser each time).
  const marks = chat.later, sentTo = chat.open;
  marks.delete(sentTo); // writing again carries the conversation on (#521)
  // Its answer is on its way even if the owner goes to another project and back: no end meanwhile (#535).
  const streamed = isNew ? null : `${repo}:${chat.open}`;
  if (streamed) streaming.add(streamed);
  chat.pending = { text, previews: files.map((f) => f.url) };
  const live = chat.live = { text: '', status: files.length ? 'Envoi des images…' : 'Envoi…', since: new Date().toISOString() };
  if (withImages) {
    $('chat-input').value = '';
    chat.files = [];
    drawPendingImages();
    autosize();
  }
  drawChat();
  let answer = null;
  try {
    const paths = await uploadImages(repo, files);
    // Never the full token: without the read-only one there is no chat (issue #395).
    if (!readToken) throw Object.assign(new Error('Créez d\'abord le jeton de lecture avec le bouton ci-dessus.'), { readToken: true });
    const res = await fetch(`${chat.server}/chat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${readToken}`, 'content-type': 'application/json' },
      // The open requests of this project, so the agent never proposes a duplicate (issue #506).
      body: JSON.stringify({ repo, conversation: isNew ? null : chat.open, message: text, images: paths, openRequests: boardRequests(repo) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) throw Object.assign(saidError('GitHub a refusé votre jeton de lecture : il a sans doute expiré ou été supprimé. Créez-en un nouveau avec le bouton ci-dessus.'), { readToken: true });
      if (body.code === 'writable') throw Object.assign(saidError(WRITABLE_TOKEN), { readToken: true });
      if (body.code === 'classic') throw Object.assign(saidError(CLASSIC_TOKEN), { readToken: true });
      throw saidError(body.error || `Le serveur de l'agent a répondu ${res.status}.`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const { events, rest } = ndjson(buffer + decoder.decode(value, { stream: true }));
      buffer = rest;
      for (const e of events) {
        if (e.type === 'status') live.status = e.text;
        else if (e.type === 'delta') { live.text += e.text; live.status = 'Écrit…'; }
        else if (e.type === 'draft') live.text = e.text;
        else if (e.type === 'reset') live.text = '';
        else if (e.type === 'answer') answer = e;
        else if (e.type === 'error') throw saidError(e.message);
      }
      if (!gone()) drawLive();
    }
    if (!answer) throw saidError('La réponse a été coupée.');
    // The answer is complete: from here on nothing may make the owner resend it (the issues would be made twice).
    live.status = 'Enregistre…';
    if (!gone()) drawLive();
    const id = conversationId(answer.conversation?.id, isNew ? null : chat.open);
    const { conv, saved } = await finishExchange(repo, id, { text, images: paths }, answer);
    // Its answer lives only on screen (or nowhere, on another project): never put away on top of it (#521, #535).
    if (!saved) marks.delete(conv.id);
    if (!gone()) {
      for (const [i, p] of paths.entries()) chat.images.set(p, Promise.resolve(chat.pending.previews[i]));
      chat.conv = conv;
      chat.open = conv.id;
      if (!saved) {
        toast('Réponse reçue, mais conversation non enregistrée. Ne renvoyez pas votre message.');
      }
      else {
        const c = { id: conv.id, title: conv.title, updated: conv.updated, state: 'open' };
        chat.list = serverList([c, ...(chat.list || []).filter((x) => x.id !== c.id)]);
        // Watched as it was written: seen. Finished while the owner was on another tab: the badge lights up.
        if (threadShown()) markServerSeen(c.id, c.updated);
        else if (!serverUnread(c, chat.seen)) markServerSeen(c.id, new Date(0).toISOString());
      }
    }
  } catch (e) {
    marks.delete(sentTo); // the agent did not answer: the conversation stays open with the message to resend (#521, #535)
    if (gone()) return;
    if (e.readToken) readTokenRefused(e.message);
    if (!$('chat-input').value) $('chat-input').value = text;
    // The images go back too: without them the message the owner resends would not be the same.
    if (withImages && !chat.files.length) { chat.files = files; drawPendingImages(); }
    autosize();
    toast(`L'agent n'a pas pu répondre. ${errorText(e)} Votre message est dans la zone de saisie, renvoyez-le.`);
  } finally {
    if (streamed) streaming.delete(streamed);
    if (!gone()) {
      chat.pending = null;
      chat.live = null;
      btn.disabled = false;
      drawChat();
      finishWhenDone();
    }
  }
}

const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const SAVE_TRIES = 5;

// After an answer: the panel saves the exchange on `factory-chat` with the full token (the chat server never writes).
// The requests the agent proposed are saved as cards waiting for the owner's click (issue #492), never created here.
// Never throws: a failure is said under the answer or in a toast.
async function finishExchange(repo, cid, mine, answer) {
  const proposals = wantedIssues(answer.issues);
  const tag = cardTag(); // the same card ids whether the answer is saved or only kept on screen
  const text = answer.text || '';
  const at = stamp();
  const base = newConversation(cid, mine.text || answer.conversation?.title || '', at);
  try {
    return { conv: await saveExchange(repo, cid, base, mine, text, at, proposals, tag), saved: true };
  } catch {
    const conv = addExchange(chat.conv?.id === cid ? structuredClone(chat.conv) : base, mine, `${text}\n\n_Cette réponse n'a pas pu être enregistrée._`, at, proposals, tag);
    conv.unsaved = true;
    return { conv, saved: false };
  }
}

// A JSON file of `factory-chat` with its sha (null when missing). Over 1 MB the contents API sends no content.
async function chatFile(repo, path) {
  // Never from the browser's cache (GitHub allows 60 s): an old sha would make every write of the retry fail.
  const meta = await api(`/repos/${repo}/contents/${path}?ref=${CHAT_BRANCH}`, { cache: 'no-store' });
  if (!meta) return { data: null, sha: null };
  if (meta.content) return { data: JSON.parse(fromBase64(meta.content)), sha: meta.sha };
  const res = await fetch(`${API}/repos/${repo}/contents/${path}?ref=${CHAT_BRANCH}`, { cache: 'no-store', headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github.raw' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return { data: await res.json(), sha: meta.sha };
}

// Writes `make(latest)` with the sha just read: GitHub refuses it if another save landed in between (another device,
// « Terminer »), and it starts again from the latest version.
async function writeChatFile(repo, path, make, message) {
  for (let attempt = 0; ; attempt++) {
    const { data, sha } = await chatFile(repo, path);
    let written;
    const next = make(data);
    try {
      written = await api(`/repos/${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, branch: CHAT_BRANCH, content: toBase64(JSON.stringify(next, null, 1) + '\n'), ...(sha ? { sha } : {}) }) });
      if (!written) throw new Error('404'); // the branch vanished: not saved
      return next;
    } catch (e) {
      if (![409, 422].includes(e.status) || attempt >= SAVE_TRIES - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1) * Math.random()));
    }
  }
}

async function ensureChatBranch(repo) {
  if (await api(`/repos/${repo}/branches/${CHAT_BRANCH}`)) return;
  const tree = await api(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ tree: [
    { path: 'README.md', mode: '100644', type: 'blob', content: "# Discussions\n\nConversations du chat du tableau de suivi avec l'agent. Ne pas fusionner.\n" },
    { path: 'vercel.json', mode: '100644', type: 'blob', content: '{ "git": { "deploymentEnabled": false } }\n' },
  ] }) });
  const commit = await api(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: `chore(factory): ${CHAT_BRANCH} branch`, tree: tree.sha, parents: [] }) });
  await api(`/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${CHAT_BRANCH}`, sha: commit.sha }) }).catch((e) => {
    if (e.status !== 422) throw e; // 422: created meanwhile
  });
}

async function saveExchange(repo, cid, base, mine, text, at, proposals, tag) {
  await ensureChatBranch(repo);
  const conv = await writeChatFile(repo, `chats/${cid}.json`, (latest) => {
    const next = addExchange(latest || structuredClone(base), mine, text, at, proposals, tag);
    next.id = cid; // a stored id is never trusted
    return next;
  }, `chore(factory): chat ${cid}`);
  await writeChatFile(repo, 'index.json', (index) => upsertIndex(index, conv), 'chore(factory): chat index');
  return conv;
}

// In server mode, « Terminer » only marks the conversation in the branch's index. Saved like any other write: another
// device may have saved the index meanwhile.
const closeServerConversation = (id) => writeChatFile(chat.repo, 'index.json', (index) => {
  if (!index) throw new Error('404');
  return index.map((c) => (c.id === id ? { ...c, state: 'closed' } : c));
}, 'chore(factory): chat index');

// « Terminer », or the end of a conversation whose cards are all decided (issue #516): then the conversation stays on
// screen (`stay`) and says how it ended (`said`).
async function closeConversation({ id = chat.open, stay = false, said } = {}) {
  const open = id;
  const server = chat.server;
  if (server ? !open || open === 'new' : typeof open !== 'number') return;
  try {
    if (server) {
      await closeServerConversation(open);
      // Shown at once, even when a refresh is already running (it would skip this one).
      if (chat.list) chat.list = chat.list.map((c) => (c.id === open ? { ...c, state: 'closed' } : c));
      drawChat();
    }
    else {
      await api(`/repos/${chat.repo}/issues/${open}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
      chat.etags.clear();
      if (chat.issue?.number === open) { chat.issue = { ...chat.issue, state: 'closed' }; drawChat(); }
    }
    toast(said || 'Conversation rangée dans « Terminées »');
    if (!stay) $('chat').classList.remove('viewing');
    chat.clicks = (chat.clicks || 0) + 1; // a check already running read the old state: it checks again at once
    await refreshChat();
  } catch (e) {
    toast(`Impossible de terminer la conversation. ${errorText(e)}`);
  }
}

function autosize() {
  const t = $('chat-input');
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
}

$('chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('chat-input').value); });
$('chat-input').addEventListener('input', autosize);
// Enter sends on a computer (Shift+Enter for a new line); on a phone, Enter is a new line and the button sends.
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) {
    e.preventDefault();
    $('chat-form').requestSubmit();
  }
});
$('chat-new').addEventListener('click', () => selectConversation('new'));
$('lightbox').addEventListener('click', () => $('lightbox').close());
$('lightbox').addEventListener('close', () => { $('lightbox-img').removeAttribute('src'); });
$('chat-back').addEventListener('click', () => { $('chat').classList.remove('viewing'); drawChatList(); });
$('chat-feature').addEventListener('click', () => sendChat(ASK.feature, false));
$('chat-bug').addEventListener('click', () => sendChat(ASK.bug, false));
$('chat-attach').addEventListener('click', () => $('chat-file').click());
$('chat-file').addEventListener('change', (e) => { addImages(e.target.files); e.target.value = ''; });
$('chat-input').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); addImages(files); }
});
for (const t of ['dragover', 'drop']) {
  document.querySelector('.chat-thread').addEventListener(t, (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    if (t === 'drop') addImages(e.dataTransfer.files);
  });
}
$('chat-close').addEventListener('click', () => closeConversation());

setupTabs(document.querySelector('.tabs'));
watchNumbers($('app'));
$('tab-board').addEventListener('click', () => { selectTab('board'); renderBoard(); });
// The arrow keys of the tab list click from code (untrusted): the keyboard stays on the tabs (WAI-ARIA tabs pattern).
$('tab-chat').addEventListener('click', (e) => selectTab('chat', e.isTrusted));
$('tab-rules').addEventListener('click', () => selectTab('rules'));
$('general-open').addEventListener('click', () => openGeneral($('general-open')).catch((err) => toast(errorText(err))));
$('general-back').addEventListener('click', () => closeGeneral(true));
$('general').addEventListener('submit', (e) => saveGeneral(e).catch((err) => toast(`Échec de l'enregistrement. ${errorText(err)}`)));
// The focus left « Paramètres » (after the browser moved it): a dev server status held back meanwhile shows now.
$('rules').addEventListener('focusout', () => setTimeout(() => {
  if (!machine.held || !machine.hash || !current || machine.repo !== current.repo.full_name || $('rules').contains(document.activeElement)) return;
  showMachineStatus(machine.held);
}));
$('rules').addEventListener('submit', (e) => saveRules(e).catch((err) => toast(`Échec de l'enregistrement. ${errorText(err)}`)));
start().catch((err) => toast(errorText(err)));

// Width diagnostic: only when the address asks for it (?largeur), listing what is wider than the screen,
// so the owner can send a screenshot from his phone.
function widthReport() {
  const w = document.documentElement.clientWidth;
  const vv = window.visualViewport;
  const out = [...document.querySelectorAll('body *')]
    .filter((e) => !e.closest('#width-report'))
    .map((e) => [e, e.getBoundingClientRect()])
    .filter(([, r]) => r.width && (r.right > w + 1 || r.left < -1))
    .map(([e, r]) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''} : ${Math.round(r.left)} → ${Math.round(r.right)}`);
  // A page the owner zoomed into is not too wide: only report real overflow at normal zoom.
  const zoomed = vv && Math.abs(vv.scale - 1) > 0.01;
  const wide = !zoomed && (document.documentElement.scrollWidth > w + 1 || out.length > 0);
  return { wide, text: `écran ${w} · fenêtre ${window.innerWidth} · page ${document.documentElement.scrollWidth} · zoom ${vv ? vv.scale.toFixed(2) : '?'}\n${out.slice(0, 30).join('\n') || 'aucun élément ne dépasse'}` };
}
function showWidthReport(force) {
  const { wide, text } = widthReport();
  if (!wide && !force) return;
  document.getElementById('width-report')?.remove();
  document.body.append(el('div', { id: 'width-report', style: 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9;background:#000;color:#fff;border-radius:8px;padding:8px;font:12px/1.4 ui-monospace,monospace' },
    el('p', { style: 'margin:0 0 6px;font-weight:700' }, 'La page est plus large que l\'écran : faites une capture et envoyez-la à Claude.'),
    el('pre', { style: 'margin:0;max-height:35vh;overflow:auto;white-space:pre-wrap' }, text),
    el('button', { type: 'button', style: 'margin-top:6px;background:#fff;color:#000;border:0', onclick: (e) => e.target.parentElement.remove() }, 'Fermer')));
}
if (new URLSearchParams(location.search).has('largeur')) setTimeout(() => showWidthReport(true), 4000);

// On a phone the secondary actions fold into « Plus »; on a computer they stay where they were.
const menuItems = [...document.querySelectorAll('[data-menu]')].map((node) => ({ node, home: node.parentNode, next: node.nextSibling }));
const phoneMq = matchMedia(PHONE);
function placeMenu() {
  const menu = $('more-menu');
  // The menu lives in the project view: with no project shown, the items stay in the header.
  // Project actions first, then what concerns the whole factory, « Se déconnecter » last.
  const ofProject = (i) => $('project-view').contains(i.home);
  if (phoneMq.matches && !$('project-view').hidden) [...menuItems.filter(ofProject), ...menuItems.filter((i) => !ofProject(i))].forEach(({ node }) => menu.append(node));
  else menuItems.slice().reverse().forEach(({ node, home, next }) => home.insertBefore(node, next && next.parentNode === home ? next : null));
  $('more').open = !(phoneMq.matches && !$('project-view').hidden);
  placeNewFeature();
}
// On a phone, a project with « Mise en production » keeps that button on the top line and
// « Nouvelle fonctionnalité » becomes the first line of « Plus » (issue #343).
function placeNewFeature() {
  const node = $('new-feature');
  const menu = $('more-menu');
  // Read the media query here: drawRelease may run before phoneMq is declared.
  if (matchMedia(PHONE).matches && !$('project-view').hidden && !$('release').hidden) {
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
