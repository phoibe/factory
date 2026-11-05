import { COLUMNS, boardItems, doneItems, doneAgo, toggleSkill, setPath, toBase64, fromBase64, tokenFromHash, phoneLink, previewFrom, focusComment, issuesUrl, projectCandidates, sessionFrom, chatServerUrl, mergeConfig, tabTitle } from './lib.mjs?v=16';
import { LABEL as CHAT_LABEL, ASK, ATTACHMENTS_BRANCH, CHAT_BRANCH, chatMessages, chatStatus, titleFrom, markdown, conversations, unread, safeGithubUrl, imagePath, imageBlock, ndjson, serverMessages, serverList } from './chat.mjs?v=13';
import { stageMinutes, estimate, humanMinutes, parseEstimate, buildingMinutes } from './eta.mjs';
import { yoursList, progress, laneFor, actionFor, moves, agoText, statusText, pollDelay, timeLine, isIdle, cardChanges, shouldSlide, withoutTimes, syncTimes } from './live.mjs?v=6';
import { resolveConfig } from './config-core.mjs';
import { watchNumbers } from './numbers.mjs';
import { setupTabs } from './tabs.mjs';
import { startCountdown } from './countdown.mjs';
import { parisMidnight, runsToday, runsText } from './runs.mjs';

const API = 'https://api.github.com';
const TOKEN_KEY = 'factory.token';
const PROJECT_KEY = 'factory.project';
const REVIEW_BODY = ['Review générale demandée depuis le tableau.', '',
  '1. Passe design : critique impeccable de tous les écrans, puis correction de tout ce qu\'elle trouve.',
  '2. Revue de code générale de toute l\'appli, puis correction.', '',
  'Ce qui demande une vraie nouvelle feature devient une issue à part.'].join('\n');
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const STAGES = [
  ['grilling', 'Questions préalables', "L'agent vous pose des questions pour clarifier la demande avant d'écrire la spec."],
  ['specReview', 'Valider chaque spec', "Coché : vous validez chaque spec par « go ». Décoché : l'agent lance la construction seul et ne vous demande votre accord que pour une spec sensible (données perdues, argent, sécurité, changement de vision ou de design)."],
  ['plan', 'Plan', "L'agent écrit un plan de construction avant de coder."],
  ['tdd', 'Tests avant le code', "Les tests sont écrits avant le code."],
  ['review', 'Revue de code', "Un second agent, qui n'a pas écrit le code, le relit."],
  ['designPass', 'Passe design', "Le skill impeccable critique chaque écran créé ou modifié et corrige tout ce qu'il trouve."],
  ['screenshots', 'Captures avant/après', "Vous validez l'apparence avant les contrôles."],
  ['checks', 'Contrôles automatiques', 'Types, lint, tests, build, accessibilité, failles.'],
  ['acceptance', 'Recette', 'Vous testez la preview (ou relisez le résumé) avant la mise en ligne.'],
];
const CHECKS = [
  ['typecheck', 'Types'], ['lint', 'Style du code'], ['test', 'Tests'], ['build', 'Construction'], ['a11y', 'Accessibilité de base'], ['audit', 'Failles connues des dépendances'],
];

// A phone opened from the QR code receives the token in the fragment: keep it, then wipe it from the address bar.
const linked = tokenFromHash(location.hash);
if (linked) {
  store.set(TOKEN_KEY, linked);
  history.replaceState(null, '', location.pathname + location.search);
}
let token = store.get(TOKEN_KEY);
// Ask the browser not to clear the token when it tidies its storage (mobile browsers do).
if (token) navigator.storage?.persist?.().catch(() => {});
let catalog, defaults, projects = [], current = null;

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

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), Math.max(4000, msg.length * 80));
}

// A refused token (expired, revoked) sends the owner back to the login page instead of leaving a frozen panel.
function sessionExpired() {
  if (!token) return;
  store.del(TOKEN_KEY); token = null; projects = []; current = null;
  clearTimeout(chat.timer); clearTimeout(live.timer); clearInterval(live.tick); live.tick = null; live.repo = null;
  $('login-error').textContent = 'GitHub a refusé le jeton : il a sans doute expiré. Créez-en un nouveau et collez-le ici.';
  show('login');
}

async function api(path, init = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (res.status === 404) return null;
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${(await res.json().catch(() => ({}))).message || ''}`), { status: res.status });
  return res.status === 204 ? null : res.json();
}

function show(id) {
  for (const s of ['login', 'empty', 'project-view']) $(s).hidden = s !== id;
  $('nav').hidden = id === 'login';
  if (typeof placeMenu === 'function') placeMenu();
}

// A repository is a project when it holds factory.config.json. The template is not one (it is copied to start
// a project). Repositories are checked a few at a time: firing one request per repository at once can trip
// GitHub's anti-abuse limit, and the refused ones then silently vanished from the list.
async function loadProjects() {
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await api(`/user/repos?affiliation=owner&sort=pushed&per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const failed = [];
  const configOf = async (r) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await api(`/repos/${r.full_name}/contents/factory.config.json`);
      } catch (err) {
        if (err.status === 401) throw err;
        if (attempt >= 2) { failed.push(r.name); return null; }
        await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
      }
    }
  };
  const found = await mapLimit(projectCandidates(repos), 4, async (r) => {
    const file = await configOf(r);
    return file ? { repo: r, file } : null;
  });
  if (failed.length) {
    toast(`GitHub n'a pas répondu pour ${failed.join(', ')}. Nouvel essai dans 30 s.`);
    setTimeout(() => reloadProjects().catch(() => {}), 30_000);
  }
  return found.filter(Boolean);
}

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
  if (current) renderProjectSelect(); else await openProject(store.get(PROJECT_KEY));
}

function renderProjectSelect() {
  const sel = $('project');
  sel.replaceChildren(...projects.map((p) => el('option', { value: p.repo.full_name }, p.repo.name)));
  sel.value = current.repo.full_name;
}

async function openProject(fullName) {
  current = projects.find((p) => p.repo.full_name === fullName) || projects[0];
  store.set(PROJECT_KEY, current.repo.full_name);
  renderProjectSelect();
  const raw = JSON.parse(fromBase64(current.file.content));
  const { config, warnings } = resolveConfig(raw, catalog, defaults);
  current.config = config;
  current.saved = JSON.stringify(config);
  for (const w of warnings) console.warn(w);
  $('project-name').textContent = current.repo.name;
  $('project-sub').textContent = `${current.repo.private ? 'Privé' : 'Public'} · moteur : ${config.runner === 'claude-cloud' ? 'cloud Claude' : 'GitHub Actions'} · ${config.maxParallel} en parallèle`;
  const base = current.repo.html_url;
  $('new-feature').href = `${base}/issues/new?template=feature.yml`;
  $('new-bug').href = `${base}/issues/new?template=bug.yml`;
  $('new-project').href = `${base}/issues/new?template=project.yml`;
  // An already framed project gets « Revoir le cadrage »: the agent then updates the brief, never the foundations.
  const r = current.repo.full_name;
  const framed = (await Promise.all(['PRODUCT.md', 'docs/PRODUCT.md'].map((f) => api(`/repos/${r}/contents/${f}`).catch(() => null)))).some(Boolean);
  $('new-project').textContent = framed ? 'Revoir le cadrage' : 'Cadrer le projet';
  $('new-project').title = framed
    ? "Change la vision, le périmètre, le design ou la stack : l'agent met la fiche produit à jour et crée les nouvelles features, sans refaire les fondations."
    : "À faire une fois, avant la première feature : vision, design et stack.";
  $('issues-link').href = issuesUrl(base);
  show('project-view');
  resetChat();
  renderRules();
  await renderBoard();
  if (!live.tick) startLive();
}

// ---- Live board -------------------------------------------------------------------------------
// The board polls GitHub every 15 s while visible. Requests carry the last ETag, so an unchanged
// answer is a 304 that GitHub does not count against the hourly limit.
const live = { repo: null, etags: new Map(), issues: null, events: [], previews: new Map(), targets: new Map(), sessions: new Map(), plans: new Map(), prev: null, sigs: null, done: [], doneSig: null, doneLoaded: false, activity: Date.now(), last: 0, failures: 0, timer: null, tick: null, busy: false };
const LANES = [
  ['yours', 'À vous de jouer', 'Rien ne vous attend.'],
  ['working', 'Les agents travaillent', 'Aucun agent ne travaille en ce moment.'],
  ['queued', 'En file d\'attente', 'La file est vide.'],
];

async function cachedGet(path) {
  const hit = live.etags.get(path);
  const res = await fetch(API + path, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...(hit ? { 'if-none-match': hit.etag } : {}) },
  });
  if (res.status === 304 && hit) return { data: hit.data, changed: false };
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  const etag = res.headers.get('etag');
  if (etag) live.etags.set(path, { etag, data });
  return { data, changed: true };
}

function mergeEvents(fresh) {
  const seen = new Set(live.events.map((e) => e.id));
  live.events = [...fresh.filter((e) => !seen.has(e.id)), ...live.events];
}

async function refresh() {
  if (live.busy) { live.again = true; return; }
  live.busy = true;
  live.again = false;
  const repo = current.repo.full_name;
  try {
    const first = live.repo !== repo;
    if (first) Object.assign(live, { repo, etags: new Map(), issues: null, events: [], previews: new Map(), targets: new Map(), sessions: new Map(), plans: new Map(), prev: null, sigs: null, done: [], doneSig: null, doneLoaded: false });
    // Every page: beyond 100 open items, the others would silently vanish from the board.
    const issues = { data: [], changed: false };
    for (let page = 1; page <= 10; page++) {
      const res = await cachedGet(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
      issues.data.push(...res.data);
      issues.changed ||= res.changed;
      if (res.data.length < 100) break;
    }
    const closed = await cachedGet(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`).catch(() => ({ data: null, changed: false }));
    const ev = await cachedGet(`/repos/${repo}/issues/events?per_page=100&page=1`).catch(() => ({ data: [], changed: false }));
    if (first) {
      for (let page = 2; page <= 3 && ev.data.length === 100; page++) {
        const batch = await api(`/repos/${repo}/issues/events?per_page=100&page=${page}`).catch(() => []);
        mergeEvents(batch);
        if (batch.length < 100) break;
      }
    }
    if (live.repo !== repo) return; // the owner switched project meanwhile
    if (ev.changed) mergeEvents(ev.data);
    if (closed.data) { live.done = doneItems(closed.data); live.doneLoaded = true; }
    live.issues = issues.data.map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
    // From each card's latest comments: the PR's preview link (Vercel bot or the factory's message),
    // and the message the card should open on, instead of the top of the issue.
    let previewsChanged = false;
    for (const c of boardItems(live.issues)) {
      const page = Math.max(1, Math.ceil((c.comments || 0) / 100));
      const res = c.comments ? await cachedGet(`/repos/${repo}/issues/${c.number}/comments?per_page=100&page=${page}`).catch(() => null) : { data: [] };
      if (!res) continue;
      // The agent's estimate may sit on the page before the last one on a long thread.
      const before = page > 1 ? await cachedGet(`/repos/${repo}/issues/${c.number}/comments?per_page=100&page=${page - 1}`).catch(() => null) : { data: [] };
      if (!before) continue;
      const url = c.pull_request ? previewFrom(res.data) : null;
      const target = focusComment(res.data);
      const session = sessionFrom([...before.data, ...res.data]);
      if (live.sessions.get(c.number) !== session) {
        live.sessions.set(c.number, session);
        previewsChanged = true;
      }
      const plan = parseEstimate([...before.data, ...res.data]);
      if (JSON.stringify(live.plans.get(c.number) ?? null) !== JSON.stringify(plan)) {
        live.plans.set(c.number, plan);
        previewsChanged = true;
      }
      if (live.previews.get(c.number) !== url || live.targets.get(c.number) !== target) {
        live.previews.set(c.number, url);
        live.targets.set(c.number, target);
        previewsChanged = true;
      }
    }
    if (live.repo !== repo) return;
    live.last = Date.now();
    live.failures = 0;
    if (issues.changed || closed.changed || ev.changed || previewsChanged || first) drawBoard();
  } catch (err) {
    live.failures++;
    if (!live.issues) $('board').replaceChildren(el('div', { class: 'board-error', role: 'alert' }, el('strong', {}, 'Connexion perdue'), el('span', {}, 'GitHub ne répond pas pour le moment.'), el('button', { type: 'button', class: 'secondary', onclick: () => refresh() }, 'Réessayer')));
  } finally {
    live.busy = false;
    drawStatus();
    if (live.again) refresh(); else schedule();
  }
}

function schedule() {
  clearTimeout(live.timer);
  if (!current) return;
  live.timer = setTimeout(refresh, pollDelay(live.failures, isIdle(live.activity, Date.now(), document.hidden)));
}

function drawStatus() {
  const s = document.querySelector('.live');
  if (!s) return;
  const down = live.failures > 0;
  s.classList.toggle('down', down);
  s.querySelector('.live-text').textContent = statusText(live.failures, Date.now() - live.last);
}

function stepTrack(c) {
  const p = progress(c);
  if (!p) return null;
  return el('div', { class: 'step' },
    el('ol', { class: 'track', 'aria-hidden': 'true' },
      Array.from({ length: p.total }, (_, i) => el('li', { class: i < p.index ? 'done' : i === p.index ? 'now' : '' }))),
    el('span', { class: 'step-name' }, `Étape ${p.index + 1}/${p.total} · ${p.name}${c.column === 'queued' ? ' à venir' : ''}`));
}

// The button names what it asks for, not a generic « Répondre ».
const REPLY_LABELS = { spec: 'Valider la spec', visual: 'Valider les captures', acceptance: 'Tester', blocked: 'Débloquer' };
const replyLabel = (column) => REPLY_LABELS[column] || 'Répondre';

function card(c, lane, minutes, now, moved) {
  const plan = live.plans.get(c.number);
  const typical = plan && minutes.bySize ? { ...minutes, building: minutes.bySize[plan.size] } : minutes;
  const e = estimate(c, live.events, typical, now, plan);
  const kind = c.labels.includes('factory:bug') ? 'Bug' : c.labels.includes('factory:audit') ? 'Review générale' : 'Feature';
  const running = c.labels.includes('factory:running');
  // Red means « waiting for you to unblock it »: not while an agent is working on it after your answer.
  const blocked = c.column === 'blocked' && !running;
  const status = lane === 'yours'
    ? el('p', { class: 'cta' }, c.column === 'acceptance' && !live.previews.get(c.number) ? 'Relisez et validez' : actionFor(c.column),
      el('span', { 'aria-hidden': 'true', class: 'arrow' }, '→'))
    : lane === 'working'
      ? el('p', { class: 'doing' }, el('span', { class: `dot${running || c.column === 'checks' ? ' on' : ''}`, 'aria-hidden': 'true' }),
        running ? 'Un agent travaille' : c.column === 'checks' ? 'Contrôles automatiques en cours' : 'Prise en charge imminente',
        running && live.sessions.get(c.number)
          ? el('a', { class: 'session', href: live.sessions.get(c.number), target: '_blank', rel: 'noopener' }, 'Voir ce qu\'il fait', el('span', { 'aria-hidden': 'true' }, ' ↗'))
          : null)
      : null;
  const preview = live.previews.get(c.number);
  const testIt = c.column === 'acceptance' && !running;
  const article = el('article', { class: `ticket ${lane}${blocked ? ' blocked' : ''}`, 'data-number': String(c.number) },
    el('div', { class: 'ticket-top' },
      el('span', { class: 'kind' }, `${kind} · ${c.pull_request ? 'PR' : 'demande'} #${c.number}`),
      e.since != null ? el('span', { class: 'since', 'data-time': '' }, `depuis ${humanMinutes(e.since)}`) : null),
    el('h3', {}, el('a', { class: 'main', href: live.targets.get(c.number) || c.html_url, target: '_blank', rel: 'noopener', 'data-key': String(c.number) }, c.title)),
    testIt && preview ? null : status,
    preview ? el('a', { class: `preview button${testIt ? '' : ' secondary'}`, href: preview, target: '_blank', rel: 'noopener' },
      testIt ? 'Ouvrir la preview à tester' : 'Voir la preview', el('span', { 'aria-hidden': 'true' }, ' ↗')) : null,
    stepTrack(c),
    el('p', { class: 'eta', 'data-time': '' }, timeLine(e)),
    c.labels.includes('factory:auto-picked') ? el('p', { class: 'eta' }, 'Piochée automatiquement') : null,
    // Only once the factory is done with it: while an agent catches the step up, there is nothing for you to see.
    // Not on the captures either: they come right after the catch-up, and the summary is only refreshed after the checks.
    c.labels.includes('factory:skills-alert') && lane === 'yours' && c.column !== 'visual'
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

// The « À vous » card: everything that waits for an answer, oldest first. Only its « go » buttons are blue.
// A « go » waits 5 seconds and can be cancelled; nothing is stored, so leaving the page cancels it.
const pendingGo = new Map();
const sentGo = new Set(); // « go » already posted this session: the card shows no second « go » while it waits for the agent
async function sendGo(c, btn) {
  try {
    await api(`/repos/${current.repo.full_name}/issues/${c.number}/comments`, { method: 'POST', body: JSON.stringify({ body: 'go' }) });
    toast('« go » envoyé. La construction démarre.');
    await refresh();
  } catch (e) {
    toast(`Envoi impossible : ${e.message}`);
    sentGo.delete(c.number);
    btn.disabled = false;
    btn.textContent = 'go';
    btn.classList.remove('undo');
  }
}
const goBtn = (c, fallback) => document.querySelector(`button.go[data-go="${c.number}"]`) || fallback;
function answerGo(c, btn) {
  const running = pendingGo.get(c.number);
  if (running) { running.cancel(); pendingGo.delete(c.number); toast('« go » annulé.'); btn.textContent = 'go'; btn.classList.remove('undo'); return; }
  btn.classList.add('undo');
  toast('« go » part dans 5 s. Touchez le bouton pour annuler.');
  const handle = startCountdown({
    seconds: 5,
    tick: (n) => { const h = pendingGo.get(c.number); if (h) h.left = n; const b = goBtn(c, btn); b.textContent = `Annuler (${n} s)`; b.classList.add('undo'); },
    done: () => { pendingGo.delete(c.number); const b = goBtn(c, null); if (!b) return; sentGo.add(c.number); b.disabled = true; b.classList.remove('undo'); b.textContent = 'Envoi…'; sendGo(c, b); },
  });
  handle.left = 5;
  pendingGo.set(c.number, handle);
}

function skeleton() {
  const bar = (w) => el('span', { class: 'sk-bar', style: `width:${w}` });
  const box = () => el('div', { class: 'sk-card' }, bar('40%'), bar('85%'), bar('60%'));
  return el('div', { class: 'skeleton', role: 'status' }, el('span', { class: 'visually-hidden' }, 'Chargement…'), box(), box(), box());
}

function youCard(yours, headline, sub) {
  const status = el('p', { class: 'live' }, el('span', { class: 'live-dot', 'aria-hidden': 'true' }), el('span', { class: 'live-text' }, statusText(live.failures, Date.now() - live.last)));
  if (!yours.length) return el('div', { class: 'you-card calm' }, el('p', { class: 'headline' }, headline), el('p', { class: 'muted' }, sub), status);
  return el('section', { class: 'you-card', 'aria-label': 'À vous' },
    el('p', { class: 'headline' }, headline),
    el('ul', { class: 'you-list' }, yours.map((c) => el('li', { class: `you-item${c.column === 'blocked' ? ' blocked' : ''}` },
      el('div', { class: 'you-what' },
        el('span', { class: 'num' }, `#${c.number}`),
        el('a', { class: 'you-title', 'data-key': String(c.number), href: live.targets.get(c.number) || c.html_url, target: '_blank', rel: 'noopener' }, c.title),
        c.column === 'blocked' ? el('span', { class: 'blocked-tag' }, 'Bloqué') : null,
        el('span', { class: 'muted' }, c.column === 'acceptance' && !live.previews.get(c.number) ? 'Relisez et validez' : actionFor(c.column))),
      c.labels.includes('factory:skills-alert') ? el('p', { class: 'alert' }, 'Une étape attendue manque (voir « Fabrication » dans la PR).') : null,
      live.previews.get(c.number) ? el('a', { class: 'button secondary', href: live.previews.get(c.number), target: '_blank', rel: 'noopener' }, c.column === 'acceptance' ? 'Ouvrir la preview à tester' : 'Voir la preview', el('span', { 'aria-hidden': 'true' }, ' ↗')) : null,
      c.reply === 'go'
        ? el('button', { type: 'button', disabled: sentGo.has(c.number), class: pendingGo.has(c.number) ? 'go undo' : 'go', 'data-go': String(c.number), 'aria-label': `go pour #${c.number} ${c.title}`, onclick: (e) => answerGo(c, e.currentTarget) }, pendingGo.has(c.number) ? `Annuler (${pendingGo.get(c.number).left} s)` : sentGo.has(c.number) ? 'Envoi…' : 'go')
        : el('a', { class: 'button secondary', href: live.targets.get(c.number) || c.html_url, target: '_blank', rel: 'noopener' }, replyLabel(c.column))))),
    status);
}

function drawBoard() {
  const board = $('board');
  const now = Date.now();
  const cards = boardItems(live.issues);
  const moved = moves(live.prev, cards);
  live.prev = new Map(cards.map((c) => [c.number, c.column]));
  const movedSet = new Set(moved.map((m) => m.number));
  for (const m of moved) toast(`« ${m.title} » : ${COLUMNS.find((c) => c.id === m.to)?.title || m.to}`);
  const doneSig = live.doneLoaded ? live.done.map((d) => `${d.number}:${d.title}`).join('|') : null;
  const doneChanged = doneSig !== null && live.doneSig !== doneSig;
  if (live.doneSig != null) {
    const known = new Set(live.doneSig.split('|').map((x) => x.split(':')[0]));
    for (const d of live.done) if (!known.has(String(d.number))) toast(`« ${d.title} » : ${COLUMNS.find((c) => c.id === 'done').title}`);
  }
  live.doneSig = doneSig;
  const sizes = Object.fromEntries([...live.plans].filter(([, p]) => p).map(([n, p]) => [n, p.size]));
  const minutes = { ...stageMinutes(live.events, now) };
  // Without an estimate from the agent, a building card falls back to the history of builds of the same size.
  minutes.bySize = buildingMinutes(live.events, now, sizes);
  const byLane = Object.fromEntries(LANES.map(([id]) => [id, cards.filter((c) => laneFor(c) === id)]));
  const yours = yoursList(cards);
  const n = yours.length;
  document.title = tabTitle(n);
  const headline = n ? (n === 1 ? '1 chose vous attend' : `${n} choses vous attendent`)
    : cards.length ? 'Rien ne vous attend' : 'Aucune feature en cours';
  const sub = cards.length
    ? [byLane.working.length && `${byLane.working.length} en travail`, byLane.queued.length && `${byLane.queued.length} en file`].filter(Boolean).join(' · ') || 'Les agents attendent vos réponses.'
    : 'Lancez-vous avec « Nouvelle fonctionnalité ».';
  const focusKey = document.activeElement?.dataset?.key;
  const oldCards = cardsOf(board);
  const before = rectsOf(board);
  const fresh = [
    youCard(yours, headline, sub),
    ...LANES.filter(([id]) => id !== 'yours' && cards.length).map(([id, title, empty]) => el('section', { class: `lane lane-${id}`, 'aria-label': title },
      el('h2', {}, title, el('span', { class: 'count' }, String(byLane[id].length))),
      byLane[id].length
        ? el('div', { class: 'tickets' }, byLane[id].map((c) => card(c, id, minutes, now, movedSet.has(c.number))))
        : el('p', { class: 'lane-empty' }, empty))),
    el('section', { class: 'lane lane-done', 'aria-label': 'Terminé' },
      el('h2', {}, 'Terminé', el('span', { class: 'count' }, String(live.done.length))),
      live.done.length
        ? el('div', { class: 'tickets' }, live.done.map((d) => el('article', { class: 'ticket done' },
          el('h3', {}, el('a', { class: 'main', href: d.url, target: '_blank', rel: 'noopener' }, d.title)),
          el('p', { class: 'finished' }, el('span', { 'aria-hidden': 'true' }, '✓ '), 'Terminé', el('span', { class: 'when', 'data-time': '' }, ` · ${doneAgo(d.mergedAt, now)}`)))))
        : el('p', { class: 'lane-empty' }, "Rien de livré pour l'instant"))];
  const yoursSig = JSON.stringify(yours.map((c) => [c.number, c.title, c.reply, c.column, live.targets.get(c.number), live.previews.get(c.number), c.labels.includes('factory:skills-alert')]));
  const holder = el('div', {}, ...fresh);
  const freshCards = cardsOf(holder);
  const changes = cardChanges(live.sigs, new Map([...freshCards].map(([k, v]) => [k, v.dataset.sig])));
  const prevSigs = live.sigs;
  live.sigs = new Map([...freshCards].map(([k, v]) => [k, v.dataset.sig]));
  const oldIndex = new Map([...oldCards].map(([n, node]) => [n, [...node.parentNode.children].indexOf(node)]));
  // Decided first: reusing a card moves its node out of the board, so nothing may be reused when the board is left as it is
  // (otherwise the cards leave with the discarded draw and the lane stays empty until the next change).
  const unchanged = fresh.length && !changes.added.length && !changes.removed.length && !changes.changed.length && !moved.length && !doneChanged && board.querySelector('.you-card') && live.yoursSig === yoursSig;
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
    board.replaceChildren(...holder.childNodes);
    flip(before);
    if (!reduced()) for (const n of changes.added) if (!oldCards.has(n)) freshCards.get(n).animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
    for (const node of leaving) node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.92)' }], { duration: 300, easing: EASE, fill: 'forwards' });
    if (leaving.length) setTimeout(() => {
      const mid = rectsOf(board);
      for (const node of leaving) node.remove();
      for (const { grid, empty } of restore) if (!grid.children.length && grid.isConnected) grid.replaceWith(empty);
      flip(mid);
    }, 300);
  }
  if (focusKey) board.querySelector(`[data-key="${focusKey}"]`)?.focus();
  drawStatus();
}

function startLive() {
  clearInterval(live.tick);
  // Every 5 s the "à jour il y a" text moves; every minute the durations on the cards move.
  let n = 0;
  live.tick = setInterval(() => { drawStatus(); if (++n % 12 === 0 && live.issues && !$('board').hidden) drawBoard(); }, 5000);
}

function drawSite() {
  const url = current.config.siteUrl || current.repo.homepage || '';
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
  if (live.repo !== current.repo.full_name) $('board').replaceChildren(skeleton());
  clearTimeout(live.timer);
  await refresh();
}

// Any sign of life from the owner brings the 8 s rhythm back (after 2 minutes of calm it slows to 30 s).
for (const type of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart']) {
  window.addEventListener(type, () => {
    const wasIdle = isIdle(live.activity, Date.now(), document.hidden);
    live.activity = Date.now();
    if (wasIdle && current && !document.hidden && !live.busy) schedule();
  }, { passive: true });
}

// Coming back to the tab refreshes at once (unless it just did); while hidden it keeps polling every 30 s.
document.addEventListener('visibilitychange', () => {
  if (!current) return clearTimeout(live.timer);
  if (document.hidden) return schedule();
  live.activity = Date.now();
  if (Date.now() - live.last > 5000) refresh(); else schedule();
});

function checkbox(id, checked, onchange) {
  return el('input', { type: 'checkbox', id, checked, onchange: (e) => onchange(e.target.checked) });
}

function renderRules() {
  const c = current.config;
  const update = (next) => { current.config = next; renderRules(); };
  const form = $('rules');
  const site = el('fieldset', {}, el('legend', {}, 'Site en ligne'),
    el('label', { for: 'site-url' }, 'Adresse du site'),
    el('p', { class: 'muted' }, 'Le lien affiché sous le nom du projet. Sur Vercel : le domaine de production, par exemple https://habitudes.vercel.app.'),
    el('input', { type: 'url', id: 'site-url', placeholder: 'https://…', value: c.siteUrl || '', inputmode: 'url',
      onchange: (e) => {
        const v = e.target.value.trim();
        if (v && !/^https:\/\/\S+$/.test(v)) { toast('L\'adresse doit commencer par https://'); return; }
        const next = structuredClone(c);
        if (v) next.siteUrl = v; else delete next.siteUrl;
        update(next);
      } }));
  const engine = el('fieldset', {}, el('legend', {}, 'Moteur des agents'),
    ...[['claude-cloud', 'Cloud Claude', 'Routine Claude Code, incluse dans votre abonnement (limite de lancements par jour).'],
      ['github-actions', 'GitHub Actions', 'Machines GitHub, illimitées sur un dépôt public, 2 000 minutes/mois en privé.']]
      .map(([v, t, d]) => el('div', { class: 'row' },
        el('input', { type: 'radio', name: 'runner', id: `runner-${v}`, checked: c.runner === v, onchange: () => update(setPath(c, 'runner', v)) }),
        el('div', {}, el('label', { for: `runner-${v}` }, t), el('p', {}, d)))),
    el('div', { class: 'row' },
      el('div', {}, el('label', { for: 'maxParallel' }, 'Features en parallèle'),
        el('p', {}, 'Comptées pendant que l\'agent construit : une feature libère sa place dès que sa PR est ouverte. Les suivantes attendent en file.'),
        el('input', { type: 'number', id: 'maxParallel', min: '1', max: '10', value: String(c.maxParallel),
          onchange: (e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1) update(setPath(c, 'maxParallel', v)); } }))),
    el('div', { class: 'row' }, checkbox('autoPick', c.autoPick === true, (on) => update(setPath(c, 'autoPick', on))),
      el('div', {}, el('label', { for: 'autoPick' }, 'Piocher dans les fiches existantes'),
        el('p', {}, 'Quand une place est libre et la file vide, la factory prend une fiche ouverte. Étiquettes : factory:urgent, factory:no-pick.'))));
  const stages = el('fieldset', {}, el('legend', {}, 'Étapes'),
    STAGES.map(([k, t, d]) => el('div', { class: 'row' }, checkbox(`stage-${k}`, c.stages[k], (on) => update(setPath(c, `stages.${k}`, on))),
      el('div', {}, el('label', { for: `stage-${k}` }, t), el('p', {}, d)))));
  const checks = el('fieldset', {}, el('legend', {}, 'Contrôles automatiques'),
    CHECKS.map(([k, t]) => el('div', { class: 'row' }, checkbox(`check-${k}`, c.checks[k], (on) => update(setPath(c, `checks.${k}`, on))),
      el('label', { for: `check-${k}` }, t))));
  const packs = catalog.packs.map((p) => {
    const pc = c.skills[p.id];
    const on = p.skills.filter((s) => pc.skills[s.id]).length;
    return el('fieldset', {}, el('legend', {}, `Skills : ${p.name}`),
      el('div', { class: 'row' }, checkbox(`pack-${p.id}`, pc.enabled, (v) => update(setPath(c, `skills.${p.id}.enabled`, v))),
        el('div', {}, el('label', { for: `pack-${p.id}` }, 'Pack activé'), el('p', {}, `${on} skill(s) sur ${p.skills.length} · ${p.repo} · ${p.license}`))),
      el('details', { open: p.skills.length <= 3 }, el('summary', {}, 'Choisir les skills'),
        el('div', { class: 'pack-skills', 'aria-disabled': String(!pc.enabled) },
          p.skills.map((s) => el('div', { class: 'row' },
            checkbox(`skill-${s.id}`, pc.skills[s.id], (v) => update(toggleSkill(c, p.id, s.id, v))),
            el('div', {}, el('label', { for: `skill-${s.id}` }, s.id), el('p', {}, s.description.length > 220 ? s.description.slice(0, 217) + '…' : s.description)))))));
  });
  const dirty = JSON.stringify(c) !== current.saved;
  const bar = el('div', { class: 'savebar' },
    el('button', { type: 'submit', class: 'secondary', disabled: !dirty }, 'Enregistrer'),
    el('span', { class: 'muted' }, dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'));
  const open = new Set([...form.querySelectorAll('details[open]')].map((d) => d.parentElement.querySelector('legend')?.textContent));
  form.replaceChildren(site, engine, stages, checks, ...packs, bar);
  for (const d of form.querySelectorAll('details')) if (open.has(d.parentElement.querySelector('legend')?.textContent)) d.open = true;
}

async function saveRules(e) {
  e.preventDefault();
  const fresh = await api(`/repos/${current.repo.full_name}/contents/factory.config.json`);
  // The file changed since it was loaded (the factory, or another device): keep those changes and apply only
  // what was modified here, instead of overwriting them.
  if (fresh.sha !== current.file.sha) {
    const theirs = resolveConfig(JSON.parse(fromBase64(fresh.content)), catalog, defaults).config;
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
  // More places: ask the factory to look at the queue now instead of at its next regular check.
  if (current.config.maxParallel > (before || 0)) {
    api(`/repos/${current.repo.full_name}/actions/workflows/factory.yml/dispatches`, {
      method: 'POST', body: JSON.stringify({ ref: current.repo.default_branch, inputs: { payload: '{"tick":true}' } }),
    }).catch(() => {});
  }
  renderRules();
  drawSite();
  toast('Règles enregistrées. Elles s\'appliquent dans une minute environ.');
}

function selectTab(name) {
  for (const t of ['board', 'chat', 'rules']) {
    $(`tab-${t}`).setAttribute('aria-selected', String(name === t));
    $(t === 'rules' ? 'rules-panel' : t).hidden = name !== t;
  }
  if (name === 'chat') openChat(); else clearTimeout(chat.timer);
}

// A new panel version is deployed (version.json, written by pages.yml) while this tab still runs the old one:
// reload by itself, as soon as nothing typed would be lost. Checked every minute and when the tab comes back.
const BUILD = document.querySelector('meta[name="build"]')?.content || '';
async function checkVersion() {
  if (!/^[0-9a-f]{7,}$/.test(BUILD)) return; // local copy, not a deployed one
  const live = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!live?.build || live.build === BUILD) return;
  const unsaved = (current && JSON.stringify(current.config) !== current.saved) || Boolean($('chat-input')?.value.trim());
  if (unsaved) return toast('Une nouvelle version du panneau est en ligne : elle se chargera dès que vous aurez enregistré.');
  location.reload();
}
function watchVersion() {
  setInterval(checkVersion, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
}

async function start() {
  watchVersion();
  let server;
  [catalog, defaults, server] = await Promise.all([fetch('catalog.json').then((r) => r.json()), fetch('factory.config.json').then((r) => r.json()),
    fetch('chat-server.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  chat.server = chatServerUrl(server?.url);
  if (!token) return show('login');
  try {
    projects = await loadProjects();
  } catch (err) {
    // Only a refused token is forgotten. A flaky mobile network or a GitHub hiccup keeps it.
    if (err.status !== 401) {
      toast('GitHub ne répond pas. Nouvel essai dans 15 s.');
      setTimeout(() => start().catch(() => {}), 15_000);
      return;
    }
    store.del(TOKEN_KEY);
    token = null;
    $('login-error').textContent = `GitHub a refusé le jeton (${err.message}). Vérifiez-le et réessayez.`;
    return show('login');
  }
  refreshStable().catch(() => {});
  refreshRuns();
  if (!projects.length) return show('empty');
  await openProject(store.get(PROJECT_KEY));
}

// Agent starts of the day, all projects together, refreshed every 5 minutes (the routines have a daily limit).
let runsTimer = null;
async function refreshRuns() {
  clearTimeout(runsTimer);
  runsTimer = setTimeout(refreshRuns, 5 * 60_000);
  if (!token || !projects.length) return;
  const from = parisMidnight();
  try {
    const counts = await mapLimit(projects, 2, async (p) => {
      const events = [];
      for (let page = 1; page <= 5; page++) {
        const batch = await api(`/repos/${p.repo.full_name}/issues/events?per_page=100&page=${page}`);
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

// « Déclarer stable »: projects follow the factory's `stable` branch; this shows how far main is ahead of it.
const FACTORY_REPO = 'phoibe/factory';
let stableChanges = [];
async function refreshStable() {
  const cmp = await api(`/repos/${FACTORY_REPO}/compare/stable...main`);
  stableChanges = (cmp?.commits || []).map((c) => c.commit.message.split('\n')[0]).filter((s) => !s.startsWith('chore(factory)'));
  const btn = $('stable');
  btn.hidden = !cmp || cmp.ahead_by === 0;
  btn.textContent = `Déclarer stable (${cmp?.ahead_by || 0})`;
}

$('stable').addEventListener('click', async () => {
  const list = stableChanges.slice(-8).map((s) => `• ${s}`).join('\n');
  if (!confirm(`Déclarer stable la version en cours de la factory ?\n\n${list}\n\nSes tests sont relancés d'abord : s'ils sont rouges, rien ne change. Sinon tous les projets prennent cette version à leur prochain run.`)) return;
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
    toast(`Impossible de déclarer stable : ${e.message} (le jeton doit avoir accès au dépôt factory)`);
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
  store.del(TOKEN_KEY); token = null; projects = []; current = null;
  clearTimeout(chat.timer); clearTimeout(live.timer); clearInterval(live.tick); live.tick = null;
  show('login');
});
function loadScript(src) {
  return new Promise((ok, ko) => document.head.append(el('script', { src, onload: ok, onerror: ko })));
}

async function openPhone() {
  const link = phoneLink(location.href, token);
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
$('phone-open').addEventListener('click', () => openPhone().catch((err) => toast(`Erreur : ${err.message}`)));
$('phone-close').addEventListener('click', () => $('phone').close());
$('project').addEventListener('change', (e) => openProject(e.target.value).catch((err) => { toast(`Ce projet ne s'ouvre pas : ${err.message}`); if (current) $('project').value = current.repo.full_name; }));
$('general-review').addEventListener('click', () => startGeneralReview());

// Opens an issue labeled factory:audit: the relay starts the general review run (or queues it).
async function startGeneralReview() {
  if (!current) return;
  if (!confirm("Lancer une review générale ?\n\nL'agent critique et corrige tous les écrans (impeccable), puis relit et corrige tout le code. Il ouvre une PR que vous validerez comme une feature.")) return;
  const btn = $('general-review');
  btn.disabled = true;
  try {
    const issue = await api(`/repos/${current.repo.full_name}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Review générale de l\'appli', labels: ['factory:audit'], body: REVIEW_BODY }),
    });
    toast('Review générale lancée');
    if (issue?.html_url) window.open(issue.html_url, '_blank', 'noopener');
    await renderBoard();
  } catch (e) {
    toast(`Impossible de lancer la review : ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}
// ---- Discussion -------------------------------------------------------------------------------
// A chat with the agent. Two ways to reach it:
// - the chat server (server/chat on Modal, address in chat-server.json): the answer streams back within
//   seconds; conversations are JSON files on the project's `factory-chat` branch;
// - otherwise, each conversation is a `factory:question` issue that wakes the agent's routine (a minute or
//   more). While an answer is awaited it is checked every 4 s, otherwise every 15 s, with ETags.
// Either way the owner only ever sees the chat.
const SEEN_KEY = 'factory.chat.seen';
const EXAMPLES = [
  'Que se passe-t-il si je ferme l\'appli au milieu d\'une saisie ?',
  'Je voudrais pouvoir exporter mes données.',
  'Le bouton « Enregistrer » ne réagit pas sur mon téléphone.',
];
const chat = { error: false, repo: null, list: null, open: null, issue: null, comments: [], etags: new Map(), timer: null, busy: false, pending: null, seen: {}, files: [], images: new Map(), server: null, conv: null, live: null, warmed: 0 };
const MAX_IMAGES = 4;

function resetChat() {
  clearTimeout(chat.timer);
  Object.assign(chat, { error: false, repo: current.repo.full_name, list: null, open: null, issue: null, comments: [], etags: new Map(), pending: null, conv: null, live: null });
  try { chat.seen = JSON.parse(store.get(`${SEEN_KEY}.${chat.repo}`) || '{}'); } catch { chat.seen = {}; }
  $('chat').classList.remove('viewing');
  if (!$('chat').hidden) openChat();
}

function markSeen(issue) {
  chat.seen[issue.number] = issue.comments || 0;
  store.set(`${SEEN_KEY}.${chat.repo}`, JSON.stringify(chat.seen));
}

async function chatGet(path) {
  const hit = chat.etags.get(path);
  const res = await fetch(API + path, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...(hit ? { 'if-none-match': hit.etag } : {}) },
  });
  if (res.status === 304 && hit) return hit.data;
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  const etag = res.headers.get('etag');
  if (etag) chat.etags.set(path, { etag, data });
  return data;
}

async function openChat() {
  if (!current) return;
  if (chat.repo !== current.repo.full_name) return resetChat();
  // Wakes the chat server up while the owner types (it sleeps when unused).
  if (chat.server && Date.now() - chat.warmed > 60_000) { chat.warmed = Date.now(); fetch(`${chat.server}/health`).catch(() => {}); }
  drawChat();
  await refreshChat();
}

// A JSON file of the `factory-chat` branch, or null.
async function branchJson(path) {
  const res = await fetch(`${API}/repos/${chat.repo}/contents/${path}?ref=${CHAT_BRANCH}`, {
    cache: 'no-store', headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github.raw' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function refreshServerChat() {
  const repo = chat.repo;
  const index = await branchJson('index.json');
  if (chat.repo !== repo) return;
  chat.list = serverList(index);
  const id = chat.open;
  if (id && id !== 'new' && !chat.live) {
    const conv = await branchJson(`chats/${id}.json`);
    if (chat.repo === repo && chat.open === id && !chat.live) chat.conv = conv;
  }
}

async function refreshChat() {
  if (chat.busy) return;
  chat.busy = true;
  const repo = chat.repo;
  try {
    if (chat.server) { await refreshServerChat(); chat.error = false; drawChat(); return; }
    const list = await chatGet(`/repos/${repo}/issues?labels=${encodeURIComponent(CHAT_LABEL)}&state=all&sort=updated&direction=desc&per_page=50`);
    if (chat.repo !== repo) return;
    chat.list = conversations(list);
    chat.error = false;
    if (typeof chat.open === 'number') {
      const n = chat.open;
      const issue = await chatGet(`/repos/${repo}/issues/${n}`);
      const pages = Math.max(1, Math.ceil((issue.comments || 0) / 100));
      const comments = [];
      for (let p = 1; p <= pages; p++) comments.push(...await chatGet(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${p}`));
      if (chat.repo !== repo || chat.open !== n) return;
      chat.issue = issue;
      chat.comments = comments;
      // The pending message shows until GitHub lists it.
      if (chat.pending && chatMessages(issue, comments).some((m) => m.who === 'me' && m.text === chat.pending.text && (m.images?.length || 0) === chat.pending.previews.length)) chat.pending = null;
      markSeen(issue);
    }
    drawChat();
  } catch (err) {
    if (!chat.list) { chat.error = true; if (!$('chat').hidden) drawChatList(); }
    else if (!$('chat').hidden) toast(`GitHub ne répond pas (${err.message}). Nouvel essai dans quelques secondes.`);
  } finally {
    chat.busy = false;
    scheduleChat();
  }
}

function scheduleChat() {
  clearTimeout(chat.timer);
  if ($('chat').hidden || !current) return;
  if (chat.server) { chat.timer = setTimeout(refreshChat, 30_000); return; } // only picks up other devices' messages
  const waiting = chat.pending || (chat.issue && chatStatus(chat.issue, chatMessages(chat.issue, chat.comments)) === 'thinking');
  chat.timer = setTimeout(refreshChat, waiting ? 4000 : 15_000);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (current && !$('chat').hidden) refreshChat();
});

const timeOf = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

function inlineNodes(parts) {
  return parts.map((p) => {
    if (p.t === 'text') return p.v;
    if (p.t === 'br') return el('br');
    if (p.t === 'code') return el('code', {}, p.v);
    if (p.t === 'b') return el('strong', {}, inlineNodes(p.c));
    if (p.t === 'i') return el('em', {}, inlineNodes(p.c));
    if (p.t === 'a') return el('a', { href: p.href, target: '_blank', rel: 'noopener' }, inlineNodes(p.c));
    return null;
  });
}

function richText(text) {
  return markdown(text).map((b) => {
    if (b.type === 'p') return el('p', {}, inlineNodes(b.inline));
    if (b.type === 'quote') return el('blockquote', {}, inlineNodes(b.inline));
    if (b.type === 'pre') return el('pre', {}, b.v);
    return el(b.type, {}, b.items.map((it) => el('li', {}, inlineNodes(it))));
  });
}

// Images live on the attachments branch; a private repository serves them only with the token, so each is
// fetched once and shown from a local copy.
function chatImage(path) {
  const img = el('img', { alt: 'Image envoyée', loading: 'lazy' });
  const link = el('a', { class: 'shot', target: '_blank', rel: 'noopener' }, img);
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

function bubble(m) {
  const pics = (m.images || []).map(chatImage);
  const text = !m.text ? [] : m.who === 'agent' ? richText(m.text) : [el('p', {}, m.text.split('\n').flatMap((l, i) => (i ? [el('br'), l] : [l])))];
  return el('li', { class: `msg ${m.who}` },
    pics.length ? el('div', { class: 'shots' }, pics) : null,
    text.length ? el('div', { class: 'bubble' }, text) : null,
    ...(m.issues || []).map((i) => el('a', { class: 'issue-chip', href: safeGithubUrl(i.url), target: '_blank', rel: 'noopener' },
      el('strong', {}, i.kind === 'bug' ? 'Bug créé' : 'Feature créée'), ` · ${i.title}`, el('span', { 'aria-hidden': 'true' }, ' ↗'))),
    el('span', { class: 'meta' }, m.who === 'agent' ? 'Agent · ' : '', m.at ? timeOf(m.at) : 'envoi…'));
}

// The answer being written by the chat server, updated in place as it streams.
function liveBubble() {
  const live = chat.live;
  return el('li', { class: 'msg agent', id: 'live-bubble' },
    live.text
      ? el('div', { class: 'bubble' }, richText(live.text))
      : el('div', { class: 'bubble typing', 'aria-label': 'L\'agent réfléchit' }, el('span'), el('span'), el('span')),
    el('span', { class: 'meta' }, live.status || 'Réfléchit…'));
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
    const fresh = !chat.server && unread(c, chat.seen) && chat.open !== key;
    return el('li', {},
      el('button', { type: 'button', class: `conv${chat.open === key ? ' current' : ''}${fresh ? ' fresh' : ''}`, 'aria-current': chat.open === key ? 'true' : false, onclick: () => selectConversation(key) },
        el('span', { class: 'conv-title' }, c.title),
        el('span', { class: 'conv-meta' }, thinking ? el('span', { class: 'typing-dot', 'aria-hidden': 'true' }) : null,
          thinking ? 'L\'agent réfléchit' : fresh ? 'Nouvelle réponse' : timeOf(c.updated || c.updated_at))));
  };
  items.replaceChildren(...open.map(row), ...(done.length ? [el('li', { class: 'chat-sep' }, 'Terminées')] : []), ...done.map(row));
  const n = chat.server ? 0 : open.filter((c) => unread(c, chat.seen)).length;
  $('chat-badge').hidden = !n;
  $('chat-badge').textContent = String(n);
}

function drawChat() {
  drawChatList();
  const isNew = (chat.open === 'new' || chat.open == null) && !chat.live;
  if (chat.server) return drawServerChat(isNew);
  $('chat-title').textContent = isNew ? 'Nouvelle conversation' : chat.issue?.title || '…';
  $('chat-tools').hidden = isNew || !chat.issue;
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  if (isNew) {
    list.replaceChildren(el('li', { class: 'chat-intro' },
      el('p', { class: 'intro-title' }, 'Parlez à l\'agent de votre appli'),
      el('p', { class: 'muted' }, 'Posez une question sur son fonctionnement, proposez une idée ou décrivez un problème. L\'agent lit le code pour vous répondre, en général en une à trois minutes. Il peut ensuite en faire une feature ou un bug.'),
      examples()));
  } else if (chat.issue && chat.issue.number === chat.open) {
    const messages = chatMessages(chat.issue, chat.comments);
    if (chat.pending) messages.push({ who: 'me', text: chat.pending.text, images: chat.pending.previews, at: null });
    const status = chat.pending ? 'thinking' : chatStatus(chat.issue, messages);
    const tail = status === 'thinking'
      ? el('li', { class: 'msg agent' }, el('div', { class: 'bubble typing', 'aria-label': 'L\'agent réfléchit' }, el('span'), el('span'), el('span')),
        el('span', { class: 'meta' }, 'L\'agent réfléchit · en général 1 à 3 min'))
      : status === 'late'
        ? el('li', { class: 'notice' }, 'Pas encore de réponse. L\'agent a peut-être atteint sa limite de lancements du jour : renvoyez votre message un peu plus tard.')
        : status === 'closed' ? el('li', { class: 'notice' }, 'Conversation terminée. Écrivez un message pour la reprendre.') : null;
    list.replaceChildren(...messages.map(bubble), ...(tail ? [tail] : []));
    $('chat-close').hidden = status === 'closed';
  } else {
    list.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Chargement…'));
  }
  if (stick || chat.pending) list.scrollTop = list.scrollHeight;
}

const examples = () => el('div', { class: 'examples' }, EXAMPLES.map((x) => el('button', { type: 'button', class: 'secondary example', onclick: () => { $('chat-input').value = x; autosize(); $('chat-input').focus(); } }, x)));

function drawServerChat(isNew) {
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const entry = chat.list?.find((c) => c.id === chat.open);
  $('chat-title').textContent = isNew ? 'Nouvelle conversation' : chat.conv?.title || entry?.title || (chat.live ? titleFrom(chat.pending?.text || 'Nouvelle conversation') : '…');
  $('chat-tools').hidden = isNew || !chat.conv;
  $('chat-close').hidden = entry?.state === 'closed';
  if (isNew) {
    list.replaceChildren(el('li', { class: 'chat-intro' },
      el('p', { class: 'intro-title' }, 'Parlez à l\'agent de votre appli'),
      el('p', { class: 'muted' }, 'Posez une question sur son fonctionnement, proposez une idée ou décrivez un problème, avec une capture si vous le souhaitez. L\'agent lit le code et vous répond en quelques secondes. Il peut ensuite en faire une feature ou un bug.'),
      examples()));
  } else if (chat.conv || chat.live) {
    const messages = serverMessages(chat.conv);
    if (chat.pending) messages.push({ who: 'me', text: chat.pending.text, images: chat.pending.previews, at: null });
    const tail = chat.live ? liveBubble()
      : entry?.state === 'closed' ? el('li', { class: 'notice' }, 'Conversation terminée. Écrivez un message pour la reprendre.') : null;
    list.replaceChildren(...messages.map(bubble), ...(tail ? [tail] : []));
  } else {
    list.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Chargement…'));
  }
  if (stick || chat.pending) list.scrollTop = list.scrollHeight;
}

function selectConversation(n) {
  if (chat.live && n !== chat.open) return toast('Attendez la fin de la réponse en cours.');
  chat.open = n;
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
  btn.disabled = true;
  chat.sending = true;
  try {
    if (typeof chat.open === 'number') { chat.pending = { text, previews: files.map((f) => f.url) }; drawChat(); }
    const paths = await uploadImages(repo, files);
    const body = [text, ...paths.map((p) => imageBlock(repo, p))].filter(Boolean).join('\n\n');
    if (typeof chat.open !== 'number') {
      const issue = await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: titleFrom(text || 'Image envoyée'), labels: [CHAT_LABEL], body }) });
      chat.open = issue.number;
      chat.issue = issue;
      chat.comments = [];
      markSeen(issue);
    } else {
      if (chat.issue?.state === 'closed') await api(`/repos/${repo}/issues/${chat.open}`, { method: 'PATCH', body: JSON.stringify({ state: 'open' }) });
      await api(`/repos/${repo}/issues/${chat.open}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    }
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
    chat.pending = null;
    drawChat();
    toast(`Message non envoyé : ${e.message}. Votre texte est toujours là, réessayez.`);
  } finally {
    chat.sending = false;
    btn.disabled = false;
  }
}

// Sends a message to the chat server and shows the answer as it is written.
async function sendToServer(text, files, withImages) {
  if (chat.live) return;
  const repo = chat.repo;
  const btn = $('chat-send');
  btn.disabled = true;
  const isNew = !chat.open || chat.open === 'new';
  chat.pending = { text, previews: files.map((f) => f.url) };
  chat.live = { text: '', status: files.length ? 'Envoi des images…' : 'Envoi…' };
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
    const res = await fetch(`${chat.server}/chat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ repo, conversation: isNew ? null : chat.open, message: text, images: paths }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `le serveur a répondu ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const { events, rest } = ndjson(buffer + decoder.decode(value, { stream: true }));
      buffer = rest;
      for (const e of events) {
        if (e.type === 'status') chat.live.status = e.text;
        else if (e.type === 'delta') { chat.live.text += e.text; chat.live.status = 'Écrit…'; }
        else if (e.type === 'draft') chat.live.text = e.text;
        else if (e.type === 'reset') chat.live.text = '';
        else if (e.type === 'answer') answer = e;
        else if (e.type === 'error') throw new Error(e.message);
        else if (e.type === 'done') {
          const c = e.conversation;
          chat.conv = chat.conv || { id: c.id, title: c.title, messages: [] };
          chat.conv.messages.push({ who: 'me', text, images: paths, at: new Date().toISOString() },
            { who: 'agent', text: answer?.text || '', issues: answer?.issues || [], at: c.updated });
          for (const [i, p] of paths.entries()) chat.images.set(p, Promise.resolve(chat.pending.previews[i]));
          if (e.saved === false) toast('Réponse reçue, mais conversation non enregistrée. Ne renvoyez pas votre message.');
          else {
            if (chat.repo === repo) chat.open = c.id;
            chat.list = serverList([{ ...c }, ...(chat.list || []).filter((x) => x.id !== c.id)]);
          }
        }
      }
      drawLive();
    }
    if (!answer) throw new Error('la réponse a été coupée');
  } catch (e) {
    if (!$('chat-input').value) $('chat-input').value = text;
    autosize();
    toast(`L'agent n'a pas pu répondre : ${e.message}. Votre message est remis dans la zone de saisie : renvoyez-le.`);
  } finally {
    chat.pending = null;
    chat.live = null;
    btn.disabled = false;
    drawChat();
    if (answer?.issues?.length) renderBoard().catch(() => {});
  }
}

// In server mode, « Terminer » only marks the conversation in the branch's index.
async function closeServerConversation() {
  const meta = await api(`/repos/${chat.repo}/contents/index.json?ref=${CHAT_BRANCH}`);
  const index = JSON.parse(fromBase64(meta.content)).map((c) => (c.id === chat.open ? { ...c, state: 'closed' } : c));
  await api(`/repos/${chat.repo}/contents/index.json`, { method: 'PUT', body: JSON.stringify({
    message: 'chore(factory): chat index', branch: CHAT_BRANCH, sha: meta.sha, content: toBase64(JSON.stringify(index, null, 1) + '\n') }) });
}

async function closeConversation() {
  if (chat.server && chat.open && chat.open !== 'new') {
    try {
      await closeServerConversation();
      toast('Conversation rangée dans « Terminées »');
      $('chat').classList.remove('viewing');
      await refreshChat();
    } catch (e) {
      toast(`Impossible de terminer la conversation : ${e.message}`);
    }
    return;
  }
  if (typeof chat.open !== 'number') return;
  try {
    await api(`/repos/${chat.repo}/issues/${chat.open}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
    chat.etags.clear();
    toast('Conversation rangée dans « Terminées »');
    $('chat').classList.remove('viewing');
    await refreshChat();
  } catch (e) {
    toast(`Impossible de terminer la conversation : ${e.message}`);
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
$('new-question').addEventListener('click', () => { selectTab('chat'); selectConversation('new'); });

setupTabs(document.querySelector('.tabs'));
watchNumbers($('app'));
$('tab-board').addEventListener('click', () => { selectTab('board'); renderBoard(); });
$('tab-chat').addEventListener('click', () => selectTab('chat'));
$('tab-rules').addEventListener('click', () => selectTab('rules'));
$('rules').addEventListener('submit', (e) => saveRules(e).catch((err) => toast(`Échec de l'enregistrement : ${err.message}`)));
start().catch((err) => toast(`Erreur : ${err.message}`));

// Width diagnostic: shows by itself when something is wider than the screen (or with ?largeur),
// listing the culprits, so the owner can send a screenshot from his phone.
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
setTimeout(() => showWidthReport(new URLSearchParams(location.search).has('largeur')), 4000);

// On a phone the secondary actions fold into « Plus »; on a computer they stay where they were.
const menuItems = [...document.querySelectorAll('[data-menu]')].map((node) => ({ node, home: node.parentNode, next: node.nextSibling }));
const phoneMq = matchMedia('(max-width: 600px)');
function placeMenu() {
  const menu = $('more-menu');
  // The menu lives in the project view: with no project shown, the items stay in the header.
  if (phoneMq.matches && !$('project-view').hidden) menuItems.forEach(({ node }) => menu.append(node));
  else menuItems.slice().reverse().forEach(({ node, home, next }) => home.insertBefore(node, next && next.parentNode === home ? next : null));
  $('more').open = !(phoneMq.matches && !$('project-view').hidden);
}
placeMenu();
phoneMq.addEventListener('change', placeMenu);
// Tapping outside, Escape or an action closes « Plus » on a phone.
const closeMore = () => { if (phoneMq.matches) $('more').open = false; };
document.addEventListener('click', (e) => { if (!$('more').contains(e.target) || e.target.closest('#more-menu a, #more-menu button')) closeMore(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });
