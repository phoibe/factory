import { COLUMNS, boardItems, toggleSkill, setPath, toBase64, fromBase64, tokenFromHash, phoneLink, previewFrom, focusComment, projectCandidates } from './lib.mjs?v=10';
import { LABEL as CHAT_LABEL, ASK, chatMessages, chatStatus, titleFrom, markdown, conversations, unread } from './chat.mjs?v=10';
import { stageMinutes, estimate, humanMinutes } from './eta.mjs';
import { progress, laneFor, actionFor, moves, agoText, pollDelay, timeLine } from './live.mjs';
import { resolveConfig } from './config-core.mjs';

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
  ['grilling', 'Grilling', "L'agent te pose des questions pour clarifier la feature avant d'écrire la spec."],
  ['specReview', 'Valider chaque spec', "Coché : tu valides chaque spec par « go ». Décoché : l'agent lance la construction seul et ne te demande ton accord que pour une spec sensible (données perdues, argent, sécurité, changement de vision ou de design)."],
  ['plan', 'Plan', "L'agent écrit un plan de construction avant de coder."],
  ['tdd', 'Code en TDD', "Les tests sont écrits avant le code."],
  ['review', 'Revue de code', "Un second agent, qui n'a pas écrit le code, le relit."],
  ['designPass', 'Passe design', "Le skill impeccable critique chaque écran créé ou modifié et corrige tout ce qu'il trouve."],
  ['screenshots', 'Captures avant/après', "Tu valides l'apparence avant les contrôles."],
  ['checks', 'Contrôles automatiques', 'Types, lint, tests, build, accessibilité, failles.'],
  ['acceptance', 'Recette', 'Tu testes la preview avant la mise en ligne.'],
];
const CHECKS = [
  ['typecheck', 'Types'], ['lint', 'Lint'], ['test', 'Tests'], ['build', 'Build'], ['a11y', 'Accessibilité de base'], ['audit', 'Failles connues des dépendances'],
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
  toast.t = setTimeout(() => t.classList.remove('show'), 4000);
}

async function api(path, init = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${(await res.json().catch(() => ({}))).message || ''}`), { status: res.status });
  return res.status === 204 ? null : res.json();
}

function show(id) {
  for (const s of ['login', 'empty', 'project-view']) $(s).hidden = s !== id;
  $('nav').hidden = id === 'login';
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
    toast(`GitHub n'a pas répondu pour ${failed.join(', ')}. Je réessaie dans 30 s.`);
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
  show('project-view');
  resetChat();
  renderRules();
  await renderBoard();
  if (!live.tick) startLive();
}

// ---- Live board -------------------------------------------------------------------------------
// The board polls GitHub every 15 s while visible. Requests carry the last ETag, so an unchanged
// answer is a 304 that GitHub does not count against the hourly limit.
const live = { repo: null, etags: new Map(), issues: null, events: [], previews: new Map(), targets: new Map(), prev: null, last: 0, failures: 0, timer: null, tick: null, busy: false };
const LANES = [
  ['yours', 'À toi de jouer', 'Rien ne t\'attend.'],
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
    if (first) Object.assign(live, { repo, etags: new Map(), issues: null, events: [], previews: new Map(), targets: new Map(), prev: null });
    const issues = await cachedGet(`/repos/${repo}/issues?state=open&per_page=100`);
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
    live.issues = issues.data.map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
    // From each card's latest comments: the PR's preview link (Vercel bot or the factory's message),
    // and the message the card should open on, instead of the top of the issue.
    let previewsChanged = false;
    for (const c of boardItems(live.issues)) {
      const page = Math.max(1, Math.ceil((c.comments || 0) / 100));
      const res = c.comments ? await cachedGet(`/repos/${repo}/issues/${c.number}/comments?per_page=100&page=${page}`).catch(() => null) : { data: [] };
      if (!res) continue;
      const url = c.pull_request ? previewFrom(res.data) : null;
      const target = focusComment(res.data);
      if (live.previews.get(c.number) !== url || live.targets.get(c.number) !== target) {
        live.previews.set(c.number, url);
        live.targets.set(c.number, target);
        previewsChanged = true;
      }
    }
    if (live.repo !== repo) return;
    live.last = Date.now();
    live.failures = 0;
    if (issues.changed || ev.changed || previewsChanged || first) drawBoard();
  } catch (err) {
    live.failures++;
    if (!live.issues) $('board').replaceChildren(el('p', { class: 'board-error' }, `GitHub ne répond pas (${err.message}). Nouvel essai dans quelques secondes.`));
  } finally {
    live.busy = false;
    drawStatus();
    if (live.again) refresh(); else schedule();
  }
}

function schedule() {
  clearTimeout(live.timer);
  if (document.hidden || $('board').hidden || !current) return;
  live.timer = setTimeout(refresh, pollDelay(live.failures));
}

function drawStatus() {
  const s = document.querySelector('.live');
  if (!s) return;
  const down = live.failures > 0;
  s.classList.toggle('down', down);
  s.querySelector('.live-text').textContent = down
    ? 'Connexion à GitHub perdue · nouvel essai automatique'
    : `En direct · à jour ${agoText(Date.now() - live.last)}`;
}

function stepTrack(c) {
  const p = progress(c);
  if (!p) return null;
  return el('div', { class: 'step' },
    el('ol', { class: 'track', 'aria-hidden': 'true' },
      Array.from({ length: p.total }, (_, i) => el('li', { class: i < p.index ? 'done' : i === p.index ? 'now' : '' }))),
    el('span', { class: 'step-name' }, `Étape ${p.index + 1}/${p.total} · ${p.name}${c.column === 'queued' ? ' à venir' : ''}`));
}

function card(c, lane, minutes, now, moved) {
  const e = estimate(c, live.events, minutes, now);
  const kind = c.labels.includes('factory:bug') ? 'Bug' : c.labels.includes('factory:audit') ? 'Review générale' : 'Feature';
  const blocked = c.column === 'blocked';
  const running = c.labels.includes('factory:running');
  const status = lane === 'yours'
    ? el('p', { class: 'cta' }, actionFor(c.column), el('span', { 'aria-hidden': 'true', class: 'arrow' }, '→'))
    : lane === 'working'
      ? el('p', { class: 'doing' }, el('span', { class: `dot${running || c.column === 'checks' ? ' on' : ''}`, 'aria-hidden': 'true' }),
        running ? 'Un agent travaille' : c.column === 'checks' ? 'Contrôles automatiques en cours' : 'Prise en charge imminente')
      : null;
  const preview = live.previews.get(c.number);
  const testIt = c.column === 'acceptance' && !running;
  return el('article', { class: `ticket ${lane}${blocked ? ' blocked' : ''}${moved ? ' moved' : ''}` },
    el('div', { class: 'ticket-top' },
      el('span', { class: 'kind' }, `${kind} · ${c.pull_request ? 'PR' : 'issue'} #${c.number}`),
      e.since != null ? el('span', { class: 'since' }, `depuis ${humanMinutes(e.since)}`) : null),
    el('h3', {}, el('a', { class: 'main', href: live.targets.get(c.number) || c.html_url, target: '_blank', rel: 'noopener', 'data-key': String(c.number) }, c.title)),
    testIt && preview ? null : status,
    preview ? el('a', { class: `preview button${testIt ? '' : ' secondary'}`, href: preview, target: '_blank', rel: 'noopener' },
      testIt ? 'Ouvrir la preview à tester' : 'Voir la preview', el('span', { 'aria-hidden': 'true' }, ' ↗')) : null,
    stepTrack(c),
    el('p', { class: 'eta' }, timeLine(e)),
    c.labels.includes('factory:skills-alert') ? el('p', { class: 'alert' }, 'Un skill attendu n\'a pas été utilisé (voir « Fabrication » dans la PR).') : null);
}

function drawBoard() {
  const board = $('board');
  const now = Date.now();
  const cards = boardItems(live.issues);
  const moved = moves(live.prev, cards);
  live.prev = new Map(cards.map((c) => [c.number, c.column]));
  const movedSet = new Set(moved.map((m) => m.number));
  for (const m of moved) toast(`« ${m.title} » : ${COLUMNS.find((c) => c.id === m.to)?.title || m.to}`);
  const minutes = stageMinutes(live.events, now);
  const byLane = Object.fromEntries(LANES.map(([id]) => [id, cards.filter((c) => laneFor(c) === id)]));
  const n = byLane.yours.length;
  const headline = n ? (n === 1 ? '1 chose t\'attend' : `${n} choses t'attendent`)
    : cards.length ? 'Rien ne t\'attend' : 'Aucune feature en cours';
  const sub = cards.length
    ? [byLane.working.length && `${byLane.working.length} en travail`, byLane.queued.length && `${byLane.queued.length} en file`].filter(Boolean).join(' · ') || 'Les agents attendent tes réponses.'
    : 'Lance-toi avec « Nouvelle feature ».';
  const focusKey = document.activeElement?.dataset?.key;
  board.replaceChildren(
    el('div', { class: `pulse-bar${n ? ' attention' : ''}` },
      el('div', {}, el('p', { class: 'headline' }, headline), el('p', { class: 'muted' }, sub)),
      el('p', { class: 'live', role: 'status' }, el('span', { class: 'live-dot', 'aria-hidden': 'true' }), el('span', { class: 'live-text' }))),
    ...LANES.filter(([id]) => cards.length || id === 'yours').map(([id, title, empty]) => el('section', { class: `lane lane-${id}`, 'aria-label': title },
      el('h2', {}, title, el('span', { class: 'count' }, String(byLane[id].length))),
      byLane[id].length
        ? el('div', { class: 'tickets' }, byLane[id].map((c) => card(c, id, minutes, now, movedSet.has(c.number))))
        : el('p', { class: 'lane-empty' }, empty))));
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
  if (live.repo !== current.repo.full_name) $('board').replaceChildren(el('p', { class: 'muted board-loading' }, 'Chargement…'));
  clearTimeout(live.timer);
  await refresh();
}

// Coming back to the tab refreshes at once (unless it just did), leaving it pauses the polling.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !current) return clearTimeout(live.timer);
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
    ...[['claude-cloud', 'Cloud Claude', 'Routine Claude Code, incluse dans ton abonnement (limite de lancements par jour).'],
      ['github-actions', 'GitHub Actions', 'Machines GitHub, illimitées sur un dépôt public, 2 000 minutes/mois en privé.']]
      .map(([v, t, d]) => el('div', { class: 'row' },
        el('input', { type: 'radio', name: 'runner', id: `runner-${v}`, checked: c.runner === v, onchange: () => update(setPath(c, 'runner', v)) }),
        el('div', {}, el('label', { for: `runner-${v}` }, t), el('p', {}, d)))),
    el('div', { class: 'row' },
      el('div', {}, el('label', { for: 'maxParallel' }, 'Features en parallèle'),
        el('p', {}, 'Les suivantes attendent en file.'),
        el('input', { type: 'number', id: 'maxParallel', min: '1', max: '10', value: String(c.maxParallel),
          onchange: (e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1) update(setPath(c, 'maxParallel', v)); } }))));
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
    el('button', { type: 'submit', disabled: !dirty }, 'Enregistrer'),
    el('span', { class: 'muted' }, dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'));
  const open = new Set([...form.querySelectorAll('details[open]')].map((d) => d.parentElement.querySelector('legend')?.textContent));
  form.replaceChildren(site, engine, stages, checks, ...packs, bar);
  for (const d of form.querySelectorAll('details')) if (open.has(d.parentElement.querySelector('legend')?.textContent)) d.open = true;
}

async function saveRules(e) {
  e.preventDefault();
  const fresh = await api(`/repos/${current.repo.full_name}/contents/factory.config.json`);
  const body = JSON.stringify(current.config, null, 2) + '\n';
  const res = await api(`/repos/${current.repo.full_name}/contents/factory.config.json`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'chore(factory): update rules from the panel', content: toBase64(body), sha: fresh.sha }),
  });
  current.file = { ...res.content, content: toBase64(body) };
  current.saved = JSON.stringify(current.config);
  renderRules();
  drawSite();
  toast('Règles enregistrées. Elles s\'appliquent dans une minute environ.');
}

function selectTab(name) {
  for (const t of ['board', 'chat', 'rules']) {
    $(`tab-${t}`).setAttribute('aria-selected', String(name === t));
    $(t).hidden = name !== t;
  }
  if (name === 'chat') openChat(); else clearTimeout(chat.timer);
}

async function start() {
  [catalog, defaults] = await Promise.all([fetch('catalog.json').then((r) => r.json()), fetch('factory.config.json').then((r) => r.json())]);
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
    $('login-error').textContent = `GitHub a refusé le jeton (${err.message}). Vérifie-le et réessaie.`;
    return show('login');
  }
  refreshStable().catch(() => {});
  if (!projects.length) return show('empty');
  await openProject(store.get(PROJECT_KEY));
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
$('logout').addEventListener('click', () => { store.del(TOKEN_KEY); token = null; show('login'); });
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
  $('phone-copy').onclick = () => navigator.clipboard.writeText(link).then(() => toast('Lien copié. Ouvre-le sur ton téléphone.'), () => toast('Copie impossible : scanne le code.'));
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
$('project').addEventListener('change', (e) => openProject(e.target.value));
$('general-review').addEventListener('click', () => startGeneralReview());

// Opens an issue labeled factory:audit: the relay starts the general review run (or queues it).
async function startGeneralReview() {
  if (!current) return;
  if (!confirm("Lancer une review générale ?\n\nL'agent critique et corrige tous les écrans (impeccable), puis relit et corrige tout le code. Il ouvre une PR que tu valideras comme une feature.")) return;
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
// A chat with the agent. Each conversation is a `factory:question` issue, which is what wakes the agent up;
// the owner only ever sees the chat. While an answer is awaited the conversation is checked every 4 s,
// otherwise every 15 s, with ETags so that unchanged answers cost nothing.
const SEEN_KEY = 'factory.chat.seen';
const EXAMPLES = [
  'Que se passe-t-il si je ferme l\'appli au milieu d\'une saisie ?',
  'Je voudrais pouvoir exporter mes données.',
  'Le bouton « Enregistrer » ne réagit pas sur mon téléphone.',
];
const chat = { repo: null, list: null, open: null, issue: null, comments: [], etags: new Map(), timer: null, busy: false, pending: null, seen: {} };

function resetChat() {
  clearTimeout(chat.timer);
  Object.assign(chat, { repo: current.repo.full_name, list: null, open: null, issue: null, comments: [], etags: new Map(), pending: null });
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
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  const etag = res.headers.get('etag');
  if (etag) chat.etags.set(path, { etag, data });
  return data;
}

async function openChat() {
  if (!current) return;
  if (chat.repo !== current.repo.full_name) return resetChat();
  drawChat();
  await refreshChat();
}

async function refreshChat() {
  if (chat.busy) return;
  chat.busy = true;
  const repo = chat.repo;
  try {
    const list = await chatGet(`/repos/${repo}/issues?labels=${encodeURIComponent(CHAT_LABEL)}&state=all&sort=updated&direction=desc&per_page=50`);
    if (chat.repo !== repo) return;
    chat.list = conversations(list);
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
      if (chat.pending && chatMessages(issue, comments).some((m) => m.who === 'me' && m.text === chat.pending.text)) chat.pending = null;
      markSeen(issue);
    }
    drawChat();
  } catch (err) {
    if (!$('chat').hidden) toast(`GitHub ne répond pas (${err.message}). Nouvel essai dans quelques secondes.`);
  } finally {
    chat.busy = false;
    scheduleChat();
  }
}

function scheduleChat() {
  clearTimeout(chat.timer);
  if (document.hidden || $('chat').hidden || !current) return;
  const waiting = chat.pending || (chat.issue && chatStatus(chat.issue, chatMessages(chat.issue, chat.comments)) === 'thinking');
  chat.timer = setTimeout(refreshChat, waiting ? 4000 : 15_000);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return clearTimeout(chat.timer);
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

function bubble(m) {
  return el('li', { class: `msg ${m.who}` },
    el('div', { class: 'bubble' }, m.who === 'agent' ? richText(m.text) : m.text.split('\n').flatMap((l, i) => (i ? [el('br'), l] : [l]))),
    el('span', { class: 'meta' }, m.who === 'agent' ? 'Agent · ' : '', m.at ? timeOf(m.at) : 'envoi…'));
}

function drawChatList() {
  const items = $('chat-items');
  if (!chat.list) return items.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Chargement…'));
  if (!chat.list.length) return items.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Aucune conversation pour l\'instant.'));
  const open = chat.list.filter((c) => c.state === 'open');
  const done = chat.list.filter((c) => c.state !== 'open');
  const row = (c) => {
    const thinking = c.state === 'open' && c.labels.some((l) => l.name === 'factory:running');
    const fresh = unread(c, chat.seen) && chat.open !== c.number;
    return el('li', {},
      el('button', { type: 'button', class: `conv${chat.open === c.number ? ' current' : ''}${fresh ? ' fresh' : ''}`, 'aria-current': chat.open === c.number ? 'true' : false, onclick: () => selectConversation(c.number) },
        el('span', { class: 'conv-title' }, c.title),
        el('span', { class: 'conv-meta' }, thinking ? el('span', { class: 'typing-dot', 'aria-hidden': 'true' }) : null,
          thinking ? 'L\'agent réfléchit' : fresh ? 'Nouvelle réponse' : timeOf(c.updated_at))));
  };
  items.replaceChildren(...open.map(row), ...(done.length ? [el('li', { class: 'chat-sep' }, 'Terminées')] : []), ...done.map(row));
  const n = open.filter((c) => unread(c, chat.seen)).length;
  $('chat-badge').hidden = !n;
  $('chat-badge').textContent = String(n);
}

function drawChat() {
  drawChatList();
  const isNew = chat.open === 'new' || chat.open == null;
  $('chat-title').textContent = isNew ? 'Nouvelle conversation' : chat.issue?.title || '…';
  $('chat-tools').hidden = isNew || !chat.issue;
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  if (isNew) {
    list.replaceChildren(el('li', { class: 'chat-intro' },
      el('p', { class: 'intro-title' }, 'Parle à l\'agent de ton appli'),
      el('p', { class: 'muted' }, 'Pose une question sur son fonctionnement, propose une idée ou décris un problème. L\'agent lit le code pour te répondre, en général en une à trois minutes. Il peut ensuite en faire une feature ou un bug.'),
      el('div', { class: 'examples' }, EXAMPLES.map((x) => el('button', { type: 'button', class: 'secondary example', onclick: () => { $('chat-input').value = x; autosize(); $('chat-input').focus(); } }, x)))));
  } else if (chat.issue && chat.issue.number === chat.open) {
    const messages = chatMessages(chat.issue, chat.comments);
    if (chat.pending) messages.push({ who: 'me', text: chat.pending.text, at: null });
    const status = chat.pending ? 'thinking' : chatStatus(chat.issue, messages);
    const tail = status === 'thinking'
      ? el('li', { class: 'msg agent' }, el('div', { class: 'bubble typing', 'aria-label': 'L\'agent réfléchit' }, el('span'), el('span'), el('span')),
        el('span', { class: 'meta' }, 'L\'agent réfléchit · en général 1 à 3 min'))
      : status === 'late'
        ? el('li', { class: 'notice' }, 'Pas encore de réponse. L\'agent a peut-être atteint sa limite de lancements du jour : renvoie ton message un peu plus tard.')
        : status === 'closed' ? el('li', { class: 'notice' }, 'Conversation terminée. Écris un message pour la reprendre.') : null;
    list.replaceChildren(...messages.map(bubble), ...(tail ? [tail] : []));
    $('chat-close').hidden = status === 'closed';
  } else {
    list.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Chargement…'));
  }
  if (stick || chat.pending) list.scrollTop = list.scrollHeight;
}

function selectConversation(n) {
  chat.open = n;
  chat.pending = null;
  if (chat.issue?.number !== n) { chat.issue = null; chat.comments = []; }
  $('chat').classList.add('viewing');
  drawChat();
  const list = $('chat-messages');
  list.scrollTop = list.scrollHeight;
  if (n !== 'new') { clearTimeout(chat.timer); refreshChat(); }
  if (n === 'new' || matchMedia('(pointer: fine)').matches) $('chat-input').focus();
}

async function sendChat(text) {
  text = text.trim();
  if (!text || !current) return;
  const repo = chat.repo;
  const btn = $('chat-send');
  btn.disabled = true;
  try {
    if (typeof chat.open !== 'number') {
      const issue = await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: titleFrom(text), labels: [CHAT_LABEL], body: text }) });
      chat.open = issue.number;
      chat.issue = issue;
      chat.comments = [];
      markSeen(issue);
    } else {
      chat.pending = { text };
      drawChat();
      if (chat.issue?.state === 'closed') await api(`/repos/${repo}/issues/${chat.open}`, { method: 'PATCH', body: JSON.stringify({ state: 'open' }) });
      await api(`/repos/${repo}/issues/${chat.open}/comments`, { method: 'POST', body: JSON.stringify({ body: text }) });
    }
    $('chat-input').value = '';
    autosize();
    clearTimeout(chat.timer);
    chat.etags.clear();
    await refreshChat();
  } catch (e) {
    chat.pending = null;
    drawChat();
    toast(`Message non envoyé : ${e.message}. Ton texte est toujours là, réessaie.`);
  } finally {
    btn.disabled = false;
  }
}

async function closeConversation() {
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
$('chat-feature').addEventListener('click', () => sendChat(ASK.feature));
$('chat-bug').addEventListener('click', () => sendChat(ASK.bug));
$('chat-close').addEventListener('click', () => closeConversation());
$('new-question').addEventListener('click', () => { selectTab('chat'); selectConversation('new'); });

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
    el('p', { style: 'margin:0 0 6px;font-weight:700' }, 'La page est plus large que l\'écran : fais une capture et envoie-la à Claude.'),
    el('pre', { style: 'margin:0;max-height:35vh;overflow:auto;white-space:pre-wrap' }, text),
    el('button', { type: 'button', style: 'margin-top:6px;background:#fff;color:#000;border:0', onclick: (e) => e.target.parentElement.remove() }, 'Fermer')));
}
setTimeout(() => showWidthReport(new URLSearchParams(location.search).has('largeur')), 4000);
