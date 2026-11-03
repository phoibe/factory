import { COLUMNS, boardItems, waitsForOwner, toggleSkill, setPath, toBase64, fromBase64 } from './lib.mjs';
import { stageMinutes, estimate, etaText } from './eta.mjs';
import { resolveConfig } from './config-core.mjs';

const API = 'https://api.github.com';
const TOKEN_KEY = 'factory.token';
const PROJECT_KEY = 'factory.project';
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const STAGES = [
  ['grilling', 'Grilling', "L'agent te pose des questions pour clarifier la feature avant d'écrire la spec."],
  ['plan', 'Plan', "L'agent écrit un plan de construction avant de coder."],
  ['tdd', 'Code en TDD', "Les tests sont écrits avant le code."],
  ['review', 'Revue de code', "Un second agent, qui n'a pas écrit le code, le relit."],
  ['designPass', 'Passe design', "Le skill impeccable soigne les écrans touchés."],
  ['screenshots', 'Captures avant/après', "Tu valides l'apparence avant les contrôles."],
  ['checks', 'Contrôles automatiques', 'Types, lint, tests, build, accessibilité, failles.'],
  ['acceptance', 'Recette', 'Tu testes la preview avant la mise en ligne.'],
];
const CHECKS = [
  ['typecheck', 'Types'], ['lint', 'Lint'], ['test', 'Tests'], ['build', 'Build'], ['a11y', 'Accessibilité de base'], ['audit', 'Failles connues des dépendances'],
];

let token = store.get(TOKEN_KEY);
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
  if (!res.ok) throw new Error(`${res.status} ${(await res.json().catch(() => ({}))).message || ''}`);
  return res.status === 204 ? null : res.json();
}

function show(id) {
  for (const s of ['login', 'empty', 'project-view']) $(s).hidden = s !== id;
  $('nav').hidden = id === 'login';
}

async function loadProjects() {
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await api(`/user/repos?affiliation=owner&sort=pushed&per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const found = await Promise.all(repos.filter((r) => !r.archived).map(async (r) => {
    const file = await api(`/repos/${r.full_name}/contents/factory.config.json`).catch(() => null);
    return file ? { repo: r, file } : null;
  }));
  return found.filter(Boolean);
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
  $('new-question').href = `${base}/issues/new?template=question.yml`;
  show('project-view');
  renderRules();
  await renderBoard();
}

async function renderBoard() {
  const board = $('board');
  board.replaceChildren(el('p', { class: 'muted' }, 'Chargement…'));
  const items = (await api(`/repos/${current.repo.full_name}/issues?state=open&per_page=100`))
    .map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  const cards = boardItems(items);
  // Label history of the repo (most recent first), for the time estimates. Never blocks the board.
  const events = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await api(`/repos/${current.repo.full_name}/issues/events?per_page=100&page=${page}`).catch(() => []);
    events.push(...batch);
    if (batch.length < 100) break;
  }
  const now = Date.now();
  const minutes = stageMinutes(events, now);
  const mine = cards.filter((c) => waitsForOwner(c.labels));
  const summary = mine.length
    ? el('p', { class: 'summary' }, mine.length === 1 ? '1 élément attend ta réponse.' : `${mine.length} éléments attendent ta réponse.`)
    : el('p', { class: 'summary calm' }, cards.length ? 'Rien ne t\'attend : les agents travaillent.' : 'Aucune feature en cours. Lance-toi avec « Nouvelle feature ».');
  const grid = el('div', { class: 'board' }, COLUMNS.map((col) => {
    const inCol = cards.filter((c) => c.column === col.id);
    return el('section', { class: `column${col.yours ? ' yours' : ''}`, 'aria-label': col.title },
      el('h2', {}, col.title, el('span', {}, String(inCol.length))),
      inCol.length ? inCol.map((c) => el('a', { class: `item${waitsForOwner(c.labels) ? ' you' : ''}`, href: c.html_url, target: '_blank', rel: 'noopener' },
        c.title,
        el('small', {}, `${c.pull_request ? 'PR' : 'Issue'} #${c.number}${c.labels.includes('factory:running') ? ' · un agent travaille' : waitsForOwner(c.labels) ? ' · à toi' : ''}`),
        el('small', { class: 'eta' }, etaText(estimate(c, events, minutes, now)))))
        : el('p', { class: 'empty-col' }, '—'));
  }));
  board.replaceChildren(summary, grid);
}

function checkbox(id, checked, onchange) {
  return el('input', { type: 'checkbox', id, checked, onchange: (e) => onchange(e.target.checked) });
}

function renderRules() {
  const c = current.config;
  const update = (next) => { current.config = next; renderRules(); };
  const form = $('rules');
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
  form.replaceChildren(engine, stages, checks, ...packs, bar);
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
  toast('Règles enregistrées. Elles s\'appliquent dans une minute environ.');
}

function selectTab(name) {
  $('tab-board').setAttribute('aria-selected', String(name === 'board'));
  $('tab-rules').setAttribute('aria-selected', String(name === 'rules'));
  $('board').hidden = name !== 'board';
  $('rules').hidden = name !== 'rules';
}

async function start() {
  [catalog, defaults] = await Promise.all([fetch('catalog.json').then((r) => r.json()), fetch('factory.config.json').then((r) => r.json())]);
  if (!token) return show('login');
  try {
    projects = await loadProjects();
  } catch (err) {
    store.del(TOKEN_KEY);
    token = null;
    $('login-error').textContent = `GitHub a refusé le jeton (${err.message}). Vérifie-le et réessaie.`;
    return show('login');
  }
  if (!projects.length) return show('empty');
  await openProject(store.get(PROJECT_KEY));
}

$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  token = $('token').value.trim();
  store.set(TOKEN_KEY, token);
  $('login-error').textContent = '';
  start();
});
$('logout').addEventListener('click', () => { store.del(TOKEN_KEY); token = null; show('login'); });
$('project').addEventListener('change', (e) => openProject(e.target.value));
$('tab-board').addEventListener('click', () => { selectTab('board'); renderBoard(); });
$('tab-rules').addEventListener('click', () => selectTab('rules'));
$('rules').addEventListener('submit', (e) => saveRules(e).catch((err) => toast(`Échec de l'enregistrement : ${err.message}`)));
start().catch((err) => toast(`Erreur : ${err.message}`));
