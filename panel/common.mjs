// What every screen of the panel shares (issue #560): who is signed in, which project is open, what is shown, the
// reset each screen declares, the « something unsaved » registry, the actions a part offers the others, the board gate.
// Imports only pure modules, so Node can load it for its tests.
import { tokenFromHash, readTokenFromHash, sessionKeys } from './lib.mjs';
import { READ_TOKEN_KEY } from './chat.mjs';

export const TOKEN_KEY = 'factory.token';
export const PROJECT_KEY = 'factory.project';
// The project list of the last visit, with what is known of each repository's settings file (issue #399).
export const PROJECTS_KEY = 'factory.projects';
export const $ = (id) => document.getElementById(id);
export const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
  keys: () => { try { return Object.keys(localStorage); } catch { return []; } },
};

// A phone opened from the QR code receives the token in the fragment: keep it, then wipe it from the address bar.
// The link also carries the chat's read-only token (issue #395).
const linked = tokenFromHash(location.hash);
if (linked) {
  store.set(TOKEN_KEY, linked);
  const read = readTokenFromHash(location.hash);
  if (read) store.set(READ_TOKEN_KEY, read); else store.del(READ_TOKEN_KEY);
  history.replaceState(null, '', location.pathname + location.search);
}
// `readToken`: the only token the chat server ever receives: it can read the projects, never change them (issue #395).
export const app = { token: store.get(TOKEN_KEY), readToken: store.get(READ_TOKEN_KEY), catalog: undefined, defaults: undefined, projects: [], current: null };
// Ask the browser not to clear the token when it tidies its storage (mobile browsers do).
if (app.token) navigator.storage?.persist?.().catch(() => {});

export function el(tag, attrs = {}, ...children) {
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

// A screen may move the toast out of the way of what it shows (the Agent tab's composer, issue #580).
const toastPlacers = [];
export function onToast(fn) { toastPlacers.push(fn); }
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  for (const place of toastPlacers) place();
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), Math.max(4000, msg.length * 80));
}

export const MACHINE_CHOICES = [['dev-server', 'Serveur de dev'], ['github', 'Machines GitHub']];

export const machineRadios = (name, choices, value, onpick, disabled = false) => choices.map(([v, t]) => el('div', { class: 'row' },
  el('input', { type: 'radio', name, id: `${name}-${v}`, checked: value === v, disabled, onchange: () => onpick(v) }),
  el('label', { for: `${name}-${v}` }, t)));

export const FACTORY_REPO = 'phoibe/factory';

// ---- Session ------------------------------------------------------------------------------------------------------------
// Forgets the session (tokens, projects, caches, live board): the next account never sees it. `forget` (logging out)
// also removes every stored project name (open project, read answers, clicks on their way); a refused token keeps them,
// so the owner pasting a renewed token finds the same project and the same unread marks.
// The session itself is forgotten first, then each screen's own reset runs, in the order the screens declared them.
const resets = [];
export function onReset(fn) { resets.push(fn); }
export function resetSession({ forget = false } = {}) {
  store.del(TOKEN_KEY); store.del(PROJECTS_KEY); store.del(READ_TOKEN_KEY);
  if (forget) for (const k of sessionKeys(store.keys())) store.del(k);
  app.token = null; app.readToken = null; app.projects = []; app.current = null;
  for (const reset of resets) reset();
}

// A refused token (expired, revoked) sends the owner back to the login page instead of leaving a frozen panel.
export function sessionExpired() {
  if (!app.token) return;
  resetSession();
  $('login-error').textContent = 'GitHub a refusé le jeton : il a sans doute expiré. Créez-en un nouveau et collez-le ici.';
  show('login');
}

// ---- Something unsaved --------------------------------------------------------------------------------------------------
// Each screen holding something a reload would lose says so here, with its kind (issue #572: the new-version banner says
// what to do first): 'settings' (unsaved settings), 'message' (a message typed or images waiting), 'answering' or
// 'unsent' (messages that could not be sent, kept in memory only, issue #580).
const holders = [];
export function onUnsaved(kind, fn) { holders.push({ kind, fn }); }
export const unsavedParts = () => {
  const parts = { settings: false, message: false, answering: false, unsent: false };
  for (const { kind, fn } of holders) if (fn()) parts[kind] = true;
  return parts;
};
export const hasUnsaved = () => holders.some(({ fn }) => Boolean(fn()));

// ---- What is shown ------------------------------------------------------------------------------------------------------
// The screen, the tab and the general page on screen. Every change tells every watcher, every time, even when nothing
// changed (« Agent » clicked while shown opens the chat again); a watcher may change the view from inside a notification.
const view = { screen: null, tab: 'board', general: false };
const watchers = [];
export const shown = () => ({ ...view });
export function onView(fn) { watchers.push(fn); }
function tell(what, was, focus = false) {
  const e = { what, ...view, was, focus };
  for (const fn of [...watchers]) fn(e);
}
export function show(id) {
  const was = { ...view };
  view.screen = id;
  for (const s of ['login', 'empty', 'project-view']) $(s).hidden = s !== id;
  $('nav').hidden = id === 'login';
  tell('screen', was);
}
// `focus`: also put the cursor in the tab's field (a click on « Agent », not the arrow keys moving along the tabs).
export function selectTab(name, focus = false) {
  const was = { ...view };
  view.tab = name;
  for (const t of ['board', 'chat', 'rules']) {
    $(`tab-${t}`).setAttribute('aria-selected', String(name === t));
    $(t === 'rules' ? 'rules-panel' : t).hidden = name !== t;
  }
  tell('tab', was, focus);
}
export function setGeneralOpen(on) {
  const was = { ...view };
  view.general = on;
  tell('general', was);
}

// ---- Actions between parts ----------------------------------------------------------------------------------------------
// A screen never imports another one: it asks for an action by name, which the part owning it provided.
const actions = new Map();
export function provide(name, fn) {
  if (actions.has(name)) throw new Error(`Action already provided: ${name}`);
  actions.set(name, fn);
}
export function call(name, ...args) {
  const fn = actions.get(name);
  if (!fn) throw new Error(`Unknown action: ${name}`);
  return fn(...args);
}

// ---- Board gate ---------------------------------------------------------------------------------------------------------
// The open board's own requests go first: everything else the page reads (the other projects' dots, the day's agent
// starts, the gap with production, « Déclarer stable ») waits for its first cards, at most BOARD_FIRST_MS. Fired all
// at once, these heavy lists (about 1 MB a page) shared the connection with the board, which took 8 to 20 s to show.
export const BOARD_FIRST_MS = 8000;
let boardGate = Promise.resolve();
let gateOpener = null; // set while the gate is held
export function holdForBoard() {
  if (gateOpener) return; // already held (a project opened while the first one loads): the board on screen opens it
  boardGate = new Promise((ok) => {
    const timer = setTimeout(() => openBoardGate(), BOARD_FIRST_MS);
    gateOpener = () => { clearTimeout(timer); gateOpener = null; ok(); };
  });
}
export function openBoardGate() { gateOpener?.(); }
export const boardFirst = () => boardGate;
holdForBoard(); // from the panel's start: the first board is the one waited for
