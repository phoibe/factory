import { COLUMNS, boardItems, doneItems, doneView, olderNote, doneAgo, previewFrom, focusComment, openIssueCount, issuesLinkText, sessionFrom, tabTitle, ideaItems, ideasToShow, deliveredIssue, releaseOutcome, releaseList, siteLink } from './lib.mjs';
import { answerForPr } from './answer.mjs';
import { stageMinutes, estimate, humanMinutes, parseEstimate, buildingMinutes, kindParts } from './eta.mjs';
import { noteClick, noteReturn, pendingNow, untakenAnswer, heldCards, holdLine, goLabel, sentLine } from './pending.mjs';
import { yoursList, progress, laneFor, actionFor, moves, statusText, pollDelay, timeLine, isIdle, cardChanges, shouldSlide, withoutTimes, syncTimes, cardSig, commentsStale, waitsText, waitsEta, stillWaited, relaunchWaits } from './live.mjs';
import { waitedFor } from './waits.mjs';
import { readRelaunch, relaunchLine } from './relaunch.mjs';
import { trustNotes } from './trust.mjs';
import { errorText } from './errors.mjs';
import { projectDot, blockedNumbers } from './projects.mjs';
import { $, store, app, el, toast, onReset, shown, selectTab, openBoardGate, provide, call } from './common.mjs';
import { etags, api, cachedGet, mapLimit } from './github.mjs';

provide('renderBoard', renderBoard);
provide('board', boardInfo);
provide('stopLive', stopLive);

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
export function enterBoard(repo) {
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

function mergeEvents(fresh) {
  const seen = new Set(live.events.map((e) => e.id));
  live.events = [...fresh.filter((e) => !seen.has(e.id)), ...live.events];
}

async function refresh() {
  if (!app.current) return;
  const repo = app.current.repo.full_name;
  if (live.busy?.repo === repo) { live.again = true; return; }
  // A refresh of a project left meanwhile does not hold this one up: it notices it was replaced and drops its answers.
  const run = { repo };
  live.busy = run;
  live.again = false;
  if (live.repo !== repo) enterBoard(repo);
  const same = () => live.busy === run && live.repo === repo && app.current?.repo.full_name === repo;
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
    const release = app.current.config.production === 'approval' ? call('refreshRelease').catch(soft(null)) : null;
    const [eventsChanged] = await Promise.all([deepEvents(), comments, release, doneRead.then(doneReleases), call('refreshGap')]);
    if (!same()) return;
    call('setDot', repo, projectDot(live.issues, live.waits));
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
  if (!app.current) return;
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
    if (lane && !lane.querySelector('.release-fold[open]')) { doneHeight.delete(app.current?.repo.full_name); lane.style.removeProperty('--done-card-height'); }
  },
},
el('summary', {
  'data-key': `fold-${key}`,
  onclick: (e) => {
    const lane = e.currentTarget.closest('.lane-done');
    if (!lane || lane.querySelector('.release-fold[open]')) return;
    const px = Math.max(...[...lane.querySelectorAll('.ticket')].map((t) => t.getBoundingClientRect().height));
    doneHeight.set(app.current?.repo.full_name, px);
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
const goKey = (c) => `${app.current.repo.full_name}#${c.number}@${c.column}`;
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
    if (app.current?.repo.full_name === repo) { const b = goBtn(c, btn); b.textContent = goState(c).text; b.setAttribute('aria-label', goName(c)); }
    toast(SENT[c.column] || `« ${goWord(c)} » envoyé.`);
    // An « ok » waits for GitHub like any answer: the card goes to « En attente de GitHub » until its column changes.
    if (c.reply === 'ok' && app.current?.repo.full_name === repo) { const now = Date.now(); savePending({ ...pendingState(), [c.number]: { column: c.column, clickedAt: now, backAt: now, sent: true } }); }
    await refresh();
  } catch (e) {
    toast(`Envoi impossible. ${errorText(e)}`);
    sentGo.delete(key);
    sendingGo.delete(key);
    if (app.current?.repo.full_name === repo) btn = goBtn(c, btn); // the board may have been redrawn while the answer was on its way
    btn.disabled = false;
    btn.textContent = goText(c);
    btn.setAttribute('aria-label', goName(c));
  }
}
const goBtn = (c, fallback) => document.querySelector(`button.go[data-go="${c.number}"]`) || fallback;
// A touch sends at once: « Envoi… » until GitHub answers, then the usual message (issue #450, no countdown).
function answerGo(c, btn) {
  const repo = app.current.repo.full_name, key = goKey(c);
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
const pendingKey = () => `factory.pending.${app.current.repo.full_name}`;
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
    if (!li || !app.current || !link) return;
    if (e.type === 'auxclick' && e.button !== 1) return; // right click: « copy link », not an answer
    // Reading a plate answered by a button (« go », « Ok ») is not answering it: looking at the captures, the preview or
    // the recette keeps it in « À vous de jouer »; only the button sends it to « En attente de GitHub ».
    if (li.querySelector('button.go')) return;
    const c = live.issues && boardItems(live.issues).find((x) => x.number === Number(li.dataset.number));
    if (c) savePending(noteClick(pendingState(), c, Date.now()));
  });
}
function owedReturn() {
  if (!app.current || !live.issues) return;
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
const sortingIdea = (repo = app.current?.repo.full_name) => sortingIdeas.get(repo) || sortingIdeas.set(repo, new Map()).get(repo);
const refusedIdea = (repo = app.current?.repo.full_name) => refusedIdeas.get(repo) || refusedIdeas.set(repo, new Set()).get(repo);
let ideaFocus = null; // the button the focus goes on to once the sorted card is gone
const announceIdea = new Set(); // refusals not yet drawn: read aloud once, not again at every later redraw
const ideaRects = () => new Map([...$('board').querySelectorAll('.ticket.idea[data-idea]')].map((n) => [n.dataset.idea, n.getBoundingClientRect()]));
function ideasLane(ideas) {
  if (!ideas.length) return null;
  const pick = app.current?.config?.autoPick === true;
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
  const target = app.current.repo; // the owner may switch project before GitHub answers
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
    if (keep && pick) call('wakeFactory', target, { say: true });
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
    el('section', { class: 'lane lane-done', 'aria-label': 'Terminé', style: doneHeight.has(app.current?.repo.full_name) && doneShown.shown.some((d) => openReleases.has(d.url)) ? `--done-card-height: ${doneHeight.get(app.current?.repo.full_name)}px` : null },
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

export function startLive() {
  clearInterval(live.tick);
  // Every 5 s the "à jour il y a" text moves; every minute the durations on the cards move.
  let n = 0;
  live.tick = setInterval(() => { drawStatus(); if ((++n % 12 === 0 || (app.current && Object.values(pendingState()).some((x) => x.backAt != null))) && live.issues && shown().tab === 'board') drawBoard(); }, 5000);
}

export async function renderBoard() {
  call('drawSite');
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
    if (wasIdle && app.current && !document.hidden && !live.busy) schedule();
    // The dots come back to life too: a check at once instead of waiting out the 30 s (issue #488).
    if (wasIdle && !document.hidden) call('wakeDots');
  }, { passive: true });
}

// Coming back to the tab refreshes at once (unless it just did); while hidden it keeps polling every 30 s.
document.addEventListener('visibilitychange', () => {
  // The owner is back: the active rhythm (8 s board, 10 s dots) starts now.
  if (!document.hidden) { live.activity = Date.now(); call('wakeDots'); }
  if (!app.current) return clearTimeout(live.timer);
  if (document.hidden) return schedule();
  if (Date.now() - live.last > 5000) refresh(); else schedule();
});

export function boardInfo() { return { repo: live.repo, issues: live.issues, activity: live.activity, ticking: Boolean(live.tick) }; }
function stopLive() { clearTimeout(live.timer); clearInterval(live.tick); live.tick = null; }

$('tab-board').addEventListener('click', () => { selectTab('board'); renderBoard(); });

onReset(() => {
  openReleases.clear(); doneHeight.clear(); boards.clear();
  clearTimeout(live.timer); clearInterval(live.tick); live.tick = null;
  Object.assign(live, { repo: null, issues: null, drawn: false, busy: null });
});
