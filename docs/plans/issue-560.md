# Split the panel's code screen by screen (issue #560) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task (one implementer per task, each reviewed before the next starts). Steps use checkbox (`- [ ]`) syntax for tracking. **Every task touches `panel/app.mjs`: the tasks are strictly sequential (1 → 9), none can run in parallel.**

**Goal:** `panel/app.mjs` (3 600 lines, all the screens and all their state in one module) becomes one module per screen plus a small common part, with nothing visible changing.

**Architecture:** `panel/app.mjs` stays the only script `index.html` loads and only wires the parts (`start()`, `openProject()`, the version watcher). `panel/common.mjs` holds what every screen shares: who is signed in, which project is open, **which screen, tab and general page are shown** (with a « the view changed » subscription), the reset each screen declares for itself, the « something unsaved » registry, and a small registry of named actions through which a screen asks another one for something. `panel/github.mjs` holds the GitHub readers (`api`, `cachedGet`). Seven `panel/screen-*.mjs` modules each keep their own state; a screen never imports another screen.

**Tech Stack:** browser ES modules without a build step, Node 22 `node --test`, Playwright e2e and a11y journeys (already there). No dependency added.

**Spec:** issue #560, last `<!-- factory-spec -->` comment (`gh api repos/phoibe/factory/issues/560/comments --jq '.[] | select(.body | contains("factory-spec")) | .body'`), « Notes techniques » included. The build saves it to `docs/specs/`, not this plan.

**Starting point:** commit `4ebe6e1` (main after #556). Line numbers below are those of `panel/app.mjs` at that commit. **They shift after every task: always find a function by its name, never by its number.**

## Global Constraints

- **Nothing visible changes**: same screens, texts, DOM, ids, classes, focus moves, requests to GitHub, timers and delays, on a computer and on a phone. `panel/index.html` changes on one line only (`app.mjs?v=92` → `app.mjs?v=93`); `panel/style.css` and the existing pure modules (`lib`, `live`, `chat`, `eta`, `pending`, `projects`, `production`, `machine`, `settings`, …) are not touched.
- **Move, do not rewrite.** A function moves with its body and its comments unchanged. The only edits allowed inside a moved body are the ones this plan lists: the six state names (`token` → `app.token`, …), `boardGate` → `boardFirst()`, a call to another screen → `call('name', …)`, and the « what is shown » reads of section « View reads ». No renaming, no reformatting, no « while I am here ».
- **No test assertion is weakened or removed.** The three tests that read `app.mjs` as text are repointed (Task 2) and keep everything they guarantee. e2e and a11y files are not edited at all.
- **A real defect found on the way is not fixed here**: note it (file, function, what happens) in the task report; it becomes an « idée à trier » at the end.
- **No new dependency**, no build step, no new folder: the new modules sit flat in `panel/` like the others (`pages.yml` copies `panel/*`, `e2e/fixture.mjs` serves `panel/`, `test/panel-imports.test.mjs` scans `panel/` only).
- **Cache trap.** Every new module is imported with exactly one specifier everywhere, born at `?v=1` and staying at 1 for this whole PR: `./common.mjs?v=1`, `./github.mjs?v=1`, `./screen-<name>.mjs?v=1`. Two specifiers = the browser loads the module twice and its state is doubled. Existing modules keep the specifier `app.mjs` uses today, copied verbatim (`./lib.mjs?v=28`, `./chat.mjs?v=28`, `./live.mjs?v=15`, `./errors.mjs`, …). `test/panel-imports.test.mjs` enforces it.
- **An imported `let` is read-only**: shared state lives in the `app` object of `common.mjs`; a screen's own state stays a private `let`/`const` of its module, reached from outside only through a function.
- Code, comments, commit messages in English; owner-facing texts stay as they are (French). Never edit `.factory/` nor `.claude/skills/`.
- **After every task**, all of this is green before the commit:

```bash
npm test                      # 1559 tests at the starting point, 36 s; only grows
npm run lint && npm run typecheck && npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 600 npm run test:e2e    # 52 files, 359 tests, 0 fail; about 4 min (238 s measured on 4 CPUs)
CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 npm run test:a11y   # 5 files, 7 tests; about 11 s
```

  The spec says `timeout 300` for e2e: measured at 238 s it is too tight, use `timeout 600` (and a tool timeout of 600 000 ms or more, or run it in the background). `typecheck` is only `node --check`: an undeclared name or a missing import shows at run time only, so **the e2e run is the real check of every move**; a blank page fails all 359 at once.

## Target layout

| File | Holds |
|---|---|
| `panel/app.mjs` | imports of the parts in a fixed order, `openProject`, `start`, the version watcher (`BUILD`, `checkVersion`, `watchVersion`), `fetchJson`, `setupTabs`/`watchNumbers`, the `?largeur` width report. No screen state. |
| `panel/common.mjs` | `$`, `store`, `el`, `toast`, `machineRadios`, keys and constants, `app` (token, readToken, catalog, defaults, projects, current), reset registry, unsaved registry, view state + subscription, actions registry, board gate. Imports only `./lib.mjs?v=28` and `./chat.mjs?v=28` (so Node can load it for its tests). |
| `panel/github.mjs` | `API`, `etags`, `guardRead`, `api`, `cachedGet`, `mapLimit`. Separate from `common.mjs` because it imports `trust.mjs` and `ratelimit.mjs`, which only exist next to the panel once deployed (`scripts/lib/`): Node cannot resolve them from `panel/`, so a common module importing them could not be unit-tested. |
| `panel/screen-login.mjs` | sign-in form, « Se déconnecter ». |
| `panel/screen-projects.mjs` | project list, its dots, the remembered list. |
| `panel/screen-header.mjs` | top of a project: site line, production gap, « Mise en production », « Déclarer stable », stack sheet, « Sur mon téléphone », runs of the day, general review / UI polish, the « Plus » menu. |
| `panel/screen-board.mjs` | « Suivi ». |
| `panel/screen-chat.mjs` | « Agent ». |
| `panel/screen-rules.mjs` | « Paramètres », with the machine line, the dev-server alert and the project's trigger. |
| `panel/screen-general.mjs` | « Réglages généraux ». |

### `common.mjs` interface (built in Task 1, used by every later task)

```js
export const TOKEN_KEY, PROJECT_KEY, PROJECTS_KEY, FACTORY_REPO, MACHINE_CHOICES, BOARD_FIRST_MS;
export const $;                       // (id) => document.getElementById(id), evaluated at call time
export const store;                   // { get, set, del, keys }
export const app;                     // { token, readToken, catalog, defaults, projects, current }
export function el(tag, attrs = {}, ...children);
export function toast(msg);
export const machineRadios;           // (name, choices, value, onpick, disabled = false) => nodes

export function onReset(fn);          // a screen declares what it forgets with the session
export function resetSession({ forget = false } = {});
export function sessionExpired();

export function onUnsaved(fn);        // a screen declares « I hold something a reload would lose »
export function hasUnsaved();         // true as soon as one of them says so

export function shown();              // copy of { screen: null|'login'|'empty'|'project-view', tab: 'board'|'chat'|'rules', general: boolean }
export function onView(fn);           // fn(e), e = { what: 'screen'|'tab'|'general', screen, tab, general, was: { screen, tab, general }, focus }
export function show(id);
export function selectTab(name, focus = false);
export function setGeneralOpen(on);

export function provide(name, fn);    // a part offers an action to the others; a second provider of the same name throws
export function call(name, ...args);  // runs it and returns its result (promises included); an unknown name throws

export function holdForBoard();
export function openBoardGate();
export function boardFirst();         // the promise to wait for: the open board's first cards, at most BOARD_FIRST_MS
```

Rules every later task relies on:

- `resetSession` first forgets the session itself (stored keys, then `app.token = null; app.readToken = null; app.projects = []; app.current = null;`), **then** runs every declared reset in the order they were declared. « Common first » matters: the general page's reset calls `closeGeneral()`, which must see `app.current === null`.
- `show`, `selectTab` and `setGeneralOpen` update the state, do their own DOM part, then tell **every** watcher, **every time**, even when nothing changed: clicking « Agent » while it is shown opens the chat again today, and every `show('project-view')` replaces the « Plus » menu. `e` describes that change; a watcher that needs the latest state reads `shown()`. A watcher may change the view from inside a notification (the general page closes itself when the project screen goes away).
- Initial view = what `index.html` shows before any script: `{ screen: null, tab: 'board', general: false }`.

### Actions between parts (final state)

Inside a `screen-*.mjs`, a function of another part is always reached with `call`. `app.mjs` may import a screen's exports directly. Each screen `provide`s its whole column the day it is created; while a provider still lives in `app.mjs`, `app.mjs` provides the action for it (« temporary provide », removed when the provider moves).

| Action | Provided by | Called from |
|---|---|---|
| `openProject(fullName)` → Promise | `app.mjs` | projects (`checkProjects` ×2, `reloadProjects`, `pickProject`) |
| `start()` → Promise | `app.mjs` | login (form) |
| `openGeneral(from)` → Promise | general | rules (`renderRules`, the « Changer le réglage… » link) |
| `closeGeneral()` | general | projects (`pickProject`) |
| `renderRules()` | rules | general (`saveGeneral`), header (`loadDelivery`) |
| `machineSettings()` → object or null | rules | general (`writeGeneral`) |
| `generalWritten({ settings, sha, general })` | rules | general (`writeGeneral`) |
| `wakeFactory(repo, opts)` | rules | board (`sortIdea`) |
| `refreshRunnerAlert()` → Promise | rules | projects (`checkProjects`) |
| `forgotten()` → Set of names | rules | projects (`projectItems`, `renderProjectList`) |
| `renderProjectList()` | projects | rules (`refreshRunnerAlert`) |
| `settingsSaved(project)` | projects | rules (`writeProjectRules`) |
| `setDot(repo, dot)` | projects | board (`refresh`) |
| `wakeDots()` | projects | board (activity and visibility listeners) |
| `refreshRuns()` | header | projects (`checkProjects`) |
| `refreshRelease()` → Promise | header | board (`refresh`) |
| `refreshGap(force)` → Promise | header | board (`refresh`), rules (`writeRules`) |
| `drawSite()` | header | board (`renderBoard`), rules (`writeRules`) |
| `drawSub()`, `drawGap()` | header | rules (`writeRules`) |
| `productionModeChanged(was, now)` → Promise of a number | header | rules (`writeRules`) |
| `renderBoard()` → Promise | board | header (`askStack`, `startRun`), chat (`decide`) |
| `board()` → `{ repo, issues, activity, ticking }` | board | chat (`boardRequests`), header (`drawRelease`), projects (`dotsIdle`) |
| `stopLive()` | board | projects (`checkProjects`, no project left) |

### View reads (the only logic rewrites)

A screen may read its own DOM; « what is shown » is asked to `common.mjs`. Each line is equivalent today because only `show`, `selectTab`, `openGeneral` and `closeGeneral` write these attributes:

| Today | Becomes | Task |
|---|---|---|
| `const fromChat = !$('chat').hidden` (in `selectTab`) | `e.was.tab === 'chat'` | 2 |
| `if (typeof placeMenu === 'function') placeMenu()` (in `show`) | the header's own `onView` calls `placeMenu()` (the test was always true: a hoisted function) | 2, 5 |
| `$('project-view').hidden` (twice in `openGeneral`) | `shown().screen !== 'project-view'` | 3 |
| `$('project-view').classList.contains('on-general')` (in `chatAway`) | `shown().general` | 3 |
| `!$('project-view').hidden` (twice in `placeMenu`, once in `placeNewFeature`) | `shown().screen === 'project-view'` | 5 |
| `$('chat').hidden` (`resetChat`, `chatAway`, `pickDefaultConversation`, `refreshChat` ×2) | `shown().tab !== 'chat'` | 7 |
| `!$('board').hidden` (in `startLive`) | `shown().tab === 'board'` | 8 |

`$('general-view').hidden` inside `openGeneral`/`closeGeneral`, `document.body.classList.contains('chat-fullscreen')` inside the chat, `$('rules').contains(document.activeElement)` stay as they are.

## Review Focus

- **A stateful module loaded twice** (one import written `./common.mjs`, another `./common.mjs?v=1`): two sessions, two views, a screen that « does not know » again. Pinned by `test/panel-imports.test.mjs` (existing, every task) and by the import rules of `test/panel-screens.test.mjs` (Task 2).
- **A token refused in the middle of anything** (401 on `api`, `cachedGet`, `chatGet`, or `loadProjects`' own fetch): the one reset runs, every screen forgets, the sign-in page shows its sentence; nothing of the previous account is left for the next one. Pinned by `test/panel-common.test.mjs` (Task 1: resets all run, after the session is forgotten) and `test/panel-session.test.mjs` (Task 2: one reset, every reader calls `sessionExpired`).
- **The same tab or the same screen asked again** (« Agent » clicked while shown, a project reopened by `checkProjects`): the watchers still run. Pinned by `test/panel-common.test.mjs` (Task 1).
- **A reaction that silently depended on another one's place** in `show()`, `selectTab()` or `resetSession()`: the order of watchers and resets is the order the modules are imported. Pinned by the fixed import order of `app.mjs` (Task 9 test) and « common first » (Task 1 test). Independence was checked for today's reactions (general, project list, chat full screen, « Plus » menu); an implementer who finds a dependency stops and reports it.
- **An action nobody provides, or misspelt**: it would only throw when the owner clicks. Pinned by `test/panel-screens.test.mjs` (Task 2: every `call('x'` has exactly one `provide('x'`).

---

### Task 1: the common part, tests first

**Parallélisation :** séquentielle (première tâche).

**Files:**
- Create: `test/panel-common.test.mjs`
- Create: `panel/common.mjs`
- `panel/app.mjs` and `panel/index.html` are **not** touched: nothing loads `common.mjs` yet, the page is unchanged.

**Interfaces:**
- Consumes: `tokenFromHash`, `readTokenFromHash`, `sessionKeys` from `./lib.mjs?v=28`; `READ_TOKEN_KEY` from `./chat.mjs?v=28`.
- Produces: the `common.mjs` interface above, exactly those names.

- [ ] **Step 1: Write the failing tests** in `test/panel-common.test.mjs`.

Node has no page: the file installs a minimal one on `globalThis` **before** importing the module, and imports a fresh copy per test (`?case=N`). The import-time `holdForBoard()` starts an 8 s timer: `load` opens the gate at once so the test process does not wait for it.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

let n = 0;
function page({ hash = '', stored = {} } = {}) {
  const nodes = new Map();
  const node = () => ({ hidden: false, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } });
  const storage = Object.assign(Object.create({
    getItem(k) { return Object.hasOwn(this, k) ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  }), stored);
  const replaced = [];
  const set = (k, value) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  set('document', { getElementById: (id) => nodes.get(id) || nodes.set(id, node()).get(id) });
  set('localStorage', storage);
  set('location', { hash, pathname: '/panel/', search: '' });
  set('history', { replaceState: (...a) => replaced.push(a) });
  return { $: (id) => document.getElementById(id), storage, replaced };
}
async function load(opts, { keepGate = false } = {}) {
  const p = page(opts);
  const m = await import(`../panel/common.mjs?case=${++n}`);
  if (!keepGate) m.openBoardGate();
  return { ...p, m };
}
const signedIn = { 'factory.token': 't', 'factory.projects': '[]', 'factory.chatToken': 'r', 'factory.project': 'o/r', 'factory.chat.seen.o/r': '{}', 'factory.advanced': 'open' };
```

Tests (names and assertions):

```js
test('the session starts from what the browser kept', async () => {
  const { m } = await load({ stored: signedIn });
  assert.deepEqual({ ...m.app }, { token: 't', readToken: 'r', catalog: undefined, defaults: undefined, projects: [], current: null });
});

test('a token in the address is kept and wiped from the address bar', async () => {
  const { m, storage, replaced } = await load({ hash: '#jeton=abc&lecture=def', stored: { 'factory.chatToken': 'old' } });
  assert.equal(m.app.token, 'abc');
  assert.equal(m.app.readToken, 'def');
  assert.equal(storage['factory.token'], 'abc');
  assert.deepEqual(replaced, [[null, '', '/panel/']]);
  const alone = await load({ hash: '#jeton=abc', stored: { 'factory.chatToken': 'old' } });
  assert.equal(alone.m.app.readToken, null, 'a link without the read token forgets the stored one');
});

test('resetSession forgets the session first, then runs the reset every screen declared, in order', async () => {
  const { m, storage } = await load({ stored: signedIn });
  m.app.projects = [{}]; m.app.current = {};
  const seen = [];
  m.onReset(() => seen.push(['a', m.app.token, m.app.readToken, m.app.projects.length, m.app.current]));
  m.onReset(() => seen.push(['b', storage['factory.token'] ?? null]));
  m.resetSession();
  assert.deepEqual(seen, [['a', null, null, 0, null], ['b', null]]);
  assert.deepEqual(Object.keys(storage).sort(), ['factory.advanced', 'factory.chat.seen.o/r', 'factory.project'], 'a refused token keeps the project names');
});

test('logging out also forgets every stored project name, never the display preference', async () => {
  const { m, storage } = await load({ stored: signedIn });
  let runs = 0;
  m.onReset(() => { runs++; });
  m.resetSession({ forget: true });
  assert.deepEqual(Object.keys(storage), ['factory.advanced']);
  assert.equal(runs, 1);
});

test('a refused token resets once and shows the sign-in page with its sentence; signed out, it does nothing', async () => {
  const { m, $ } = await load({ stored: signedIn });
  let runs = 0;
  m.onReset(() => { runs++; });
  m.sessionExpired();
  assert.equal(runs, 1);
  assert.equal(m.shown().screen, 'login');
  assert.equal($('login').hidden, false);
  assert.equal($('nav').hidden, true);
  assert.equal($('login-error').textContent, 'GitHub a refusé le jeton : il a sans doute expiré. Créez-en un nouveau et collez-le ici.');
  m.sessionExpired();
  assert.equal(runs, 1, 'already signed out');
});

test('show() says which screen is shown and tells every watcher, even for the same screen again', async () => {
  const { m, $ } = await load();
  assert.deepEqual(m.shown(), { screen: null, tab: 'board', general: false });
  const events = [];
  m.onView((e) => events.push([e.what, e.screen, e.was.screen]));
  m.show('project-view');
  m.show('project-view');
  m.show('empty');
  assert.deepEqual(events, [['screen', 'project-view', null], ['screen', 'project-view', 'project-view'], ['screen', 'empty', 'project-view']]);
  assert.deepEqual(['login', 'empty', 'project-view'].map((s) => $(s).hidden), [true, false, true]);
  assert.equal($('nav').hidden, false);
  const copy = m.shown(); copy.screen = 'login';
  assert.equal(m.shown().screen, 'empty', 'shown() gives a copy');
});

test('selectTab() says which tab is shown, what was shown before, and whether the focus is asked', async () => {
  const { m, $ } = await load();
  const events = [];
  m.onView((e) => events.push([e.what, e.tab, e.was.tab, e.focus]));
  m.selectTab('chat', true);
  m.selectTab('chat');
  m.selectTab('rules');
  assert.deepEqual(events, [['tab', 'chat', 'board', true], ['tab', 'chat', 'chat', false], ['tab', 'rules', 'chat', false]]);
  assert.deepEqual(['board', 'chat', 'rules-panel'].map((id) => $(id).hidden), [true, true, false]);
  assert.deepEqual(['board', 'chat', 'rules'].map((t) => $(`tab-${t}`).attrs['aria-selected']), ['false', 'false', 'true']);
});

test('the general page is part of the view; a watcher may change the view from inside a notification', async () => {
  const { m } = await load();
  const heard = [];
  m.onView((e) => { if (e.what === 'screen' && e.screen !== 'project-view') m.setGeneralOpen(false); });
  m.onView((e) => heard.push([e.what, e.general, e.was.general]));
  m.show('project-view');
  m.setGeneralOpen(true);
  m.show('login');
  assert.deepEqual(heard, [['screen', false, false], ['general', true, false], ['general', false, true], ['screen', true, true]]);
  assert.equal(m.shown().general, false);
});

test('something is unsaved as soon as one screen says so', async () => {
  const { m } = await load();
  assert.equal(m.hasUnsaved(), false);
  let dirty = false;
  m.onUnsaved(() => null);
  m.onUnsaved(() => dirty);
  assert.equal(m.hasUnsaved(), false);
  dirty = true;
  assert.equal(m.hasUnsaved(), true);
});

test('call() runs the action a part provided and gives its result back; unknown or provided twice throws', async () => {
  const { m } = await load();
  m.provide('double', (x) => x * 2);
  m.provide('later', async () => 'done');
  assert.equal(m.call('double', 21), 42);
  assert.equal(await m.call('later'), 'done');
  assert.throws(() => m.call('nope'), /Unknown action: nope/);
  assert.throws(() => m.provide('double', () => 0), /Action already provided: double/);
});

test('the board gate opens with the first cards, or by itself after BOARD_FIRST_MS; holding it again makes a new wait', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { m } = await load({}, { keepGate: true });
  assert.equal(m.BOARD_FIRST_MS, 8000);
  const settled = (p) => { const s = { done: false }; p.then(() => { s.done = true; }); return s; };
  const first = settled(m.boardFirst());
  t.mock.timers.tick(7999); await new Promise(setImmediate);
  assert.equal(first.done, false);
  t.mock.timers.tick(1); await new Promise(setImmediate);
  assert.equal(first.done, true);
  m.holdForBoard();
  const held = m.boardFirst();
  m.holdForBoard();
  assert.equal(m.boardFirst(), held, 'already held: the same wait');
  const second = settled(held);
  m.openBoardGate(); await new Promise(setImmediate);
  assert.equal(second.done, true);
});
```

- [ ] **Step 2: Run them, see them fail**

Run: `node --test test/panel-common.test.mjs`
Expected: every test FAILS with `Cannot find module … panel/common.mjs`.

- [ ] **Step 3: Write `panel/common.mjs`**

**Copy** (the originals stay in `app.mjs` until Task 2) with body and comments unchanged, adding `export`: `TOKEN_KEY`, `PROJECT_KEY`, `PROJECTS_KEY` (l. 26-29), `$` and `store` (37-43), the phone-link block `const linked … history.replaceState` (60-68), `el` (84-96), `toast` (100-106), `MACHINE_CHOICES` (1284), `machineRadios` (1312-1314), `FACTORY_REPO` (2158), `BOARD_FIRST_MS` and the gate (363-377, with its top-level `holdForBoard();`; `boardGate` and `gateOpener` stay private, `boardFirst = () => boardGate`).

State: `export const app = { token: store.get(TOKEN_KEY), readToken: store.get(READ_TOKEN_KEY), catalog: undefined, defaults: undefined, projects: [], current: null };` after the phone-link block, then `if (app.token) navigator.storage?.persist?.().catch(() => {});` (l. 69-74, comments kept).

The parts no existing code gives:

```js
const resets = [];
export function onReset(fn) { resets.push(fn); }
export function resetSession({ forget = false } = {}) {
  store.del(TOKEN_KEY); store.del(PROJECTS_KEY); store.del(READ_TOKEN_KEY);
  if (forget) for (const k of sessionKeys(store.keys())) store.del(k);
  app.token = null; app.readToken = null; app.projects = []; app.current = null;
  for (const reset of resets) reset();
}

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
```

`selectTab(name, focus = false)`: same shape with `view.tab = name`, the `for (const t of ['board', 'chat', 'rules'])` loop of today's `selectTab` (l. 1736-1739), then `tell('tab', was, focus)`. `setGeneralOpen(on)`: `view.general = on; tell('general', was)`, no DOM. `sessionExpired` (l. 121-128) verbatim with `app.token`. `onUnsaved`/`hasUnsaved`: a list of predicates, `hasUnsaved = () => holders.some((fn) => Boolean(fn()))`. `provide`/`call`: a `Map`; errors `Action already provided: <name>` and `Unknown action: <name>`. Keep the `resetSession` comment of l. 108-110 above the new one, and the line `for (const reset of resets) reset();` written exactly so (Task 2's test reads it).

- [ ] **Step 4: Run the tests, see them pass**

Run: `node --test test/panel-common.test.mjs`
Expected: 11 tests pass, and the run ends at once (no 8 s wait: a hanging run means a gate left held).

- [ ] **Step 5: Everything green** — the four commands of « Global Constraints ». Expected: unit 1570 pass, e2e 359 pass, a11y 7 pass (the page is unchanged).

- [ ] **Step 6: Commit**

```bash
git add panel/common.mjs test/panel-common.test.mjs
git commit -m "feat(panel): common part of the screens (session, view, resets), with its tests (#560)"
```

---

### Task 2: `app.mjs` runs on the common part

**Parallélisation :** séquentielle (après la tâche 1).

**Files:**
- Create: `test/panel-source.mjs` (helper, not a test), `test/panel-screens.test.mjs`, `panel/github.mjs`
- Modify: `test/panel-session.test.mjs`, `test/panel-live.test.mjs:99-122`, `test/outsider-notes.test.mjs:255-265`
- Modify: `panel/app.mjs` (whole file), `panel/index.html:172`

**Interfaces:**
- Consumes: everything `common.mjs` exports.
- Produces: `panel/github.mjs` exporting `API`, `etags`, `guardRead(path, data)`, `api(path, init = {})`, `cachedGet(path, cache = etags)`, `mapLimit(items, limit, fn)`; `test/panel-source.mjs` exporting `files` (name → text of every `panel/*.mjs`), `all` (their texts joined), `fn(name)` (the text of a top-level function, wherever it lives), `resets` (the text of every top-level `onReset(() => {` … `});` block).

- [ ] **Step 1: Repoint the text-reading tests (they must find the code wherever it lives)**

`test/panel-source.mjs`:

```js
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../panel/', import.meta.url);
export const files = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort().map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]));
export const all = Object.values(files).join('\n');
export const fn = (name) => all.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\)[^]*?\\n\\}\\n`))?.[0] || '';
export const resets = [...all.matchAll(/^onReset\(\(\) => \{\n[^]*?\n\}\);$/gm)].map((m) => m[0]);
```

`test/panel-session.test.mjs`: replace its own `app`/`fn` by `import { all, fn, resets } from './panel-source.mjs';`, read `all` wherever it read `app`. Every existing assertion stays. The first and fourth tests read the whole reset path, and say it is one:

```js
test('la remise à zéro de la session est écrite une seule fois et vide les caches et le suivi en direct', () => {
  const reset = fn('resetSession');
  assert.ok(reset, 'resetSession doit exister');
  assert.equal(all.split('function resetSession(').length - 1, 1, 'une seule remise à zéro');
  assert.match(reset, /for \(const reset of resets\) reset\(\);/, 'elle lance ce que chaque écran a déclaré');
  const path = reset + resets.join('\n');
  for (const part of ['etags.clear()', 'boards.clear()', 'clearTimeout(live.timer)', 'clearInterval(live.tick)', 'store.del(TOKEN_KEY)', 'store.del(READ_TOKEN_KEY)']) assert.ok(path.includes(part), part);
  assert.equal(all.split('boards.clear()').length - 1, 1, 'plus aucune copie de la remise à zéro');
});
```

In the fourth test, `always` becomes `reset.replace(/if \(forget\)[^\n]*\n/, '') + resets.join('\n')` (same `doesNotMatch`). Add one test: `for (const name of ['api', 'cachedGet', 'chatGet', 'loadProjects']) assert.match(fn(name), /res\.status === 401\) sessionExpired\(\)/, name);` titled « chaque lecture de GitHub renvoie à la connexion quand le jeton est refusé ».

`test/panel-live.test.mjs` (two tests) and `test/outsider-notes.test.mjs` (one test): `src` becomes `all` from `./panel-source.mjs`; assertions unchanged (the « no other `fetch(` of issues or pulls » scan now covers every panel module).

Run: `node --test test/panel-session.test.mjs test/panel-live.test.mjs test/outsider-notes.test.mjs`
Expected: FAIL on `resetSession` (found twice: `app.mjs` and `common.mjs`); everything else passes.

- [ ] **Step 2: Write the guard tests** `test/panel-screens.test.mjs` (they pass from now on and must stay green through Task 9):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, all } from './panel-source.mjs';

const screens = Object.keys(files).filter((f) => f.startsWith('screen-'));
const imports = (text) => [...text.matchAll(/\bfrom '\.\/([^'?]+)/g)].map((m) => m[1]);

test('a screen never imports another screen nor the entry point; the shared parts import no screen', () => {
  for (const f of [...screens, 'common.mjs', 'github.mjs']) {
    assert.deepEqual(imports(files[f]).filter((i) => i.startsWith('screen-') || i === 'app.mjs'), [], f);
  }
  assert.deepEqual(imports(files['common.mjs']).sort(), ['chat.mjs', 'lib.mjs'], 'common.mjs stays loadable by Node');
});

test('every action a part calls is provided exactly once', () => {
  const provided = [...all.matchAll(/\bprovide\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(provided.filter((n, i) => provided.indexOf(n) !== i), [], 'provided twice');
  const called = new Set([...all.matchAll(/\bcall\('([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...called].filter((n) => !provided.includes(n)), [], 'called but never provided');
});

test('no part imports a name it does not use', () => {
  const unused = [];
  for (const f of ['app.mjs', 'common.mjs', 'github.mjs', ...screens]) {
    for (const m of files[f].matchAll(/^import \{([^}]+)\} from/gm)) {
      for (const name of m[1].split(',').map((x) => x.trim().split(' as ').pop())) {
        const uses = files[f].split(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`)).length - 1;
        if (uses < 2) unused.push(`${f}: ${name}`);
      }
    }
  }
  assert.deepEqual(unused, []);
});
```

- [ ] **Step 3: Create `panel/github.mjs`**

**Move** from `app.mjs` (body and comments unchanged, `export` added): `API` (l. 25), `guardRead` (129-131), `api` (133-142), `mapLimit` (258-264), `etags` with its comment (333-334), `cachedGet` with its comment (508-530). Inside: `token` → `app.token`, `projects` → `app.projects`. Imports: `app`, `onReset`, `sessionExpired` from `./common.mjs?v=1`; `trustRead` from `./trust.mjs?v=1`; `rateLimitDelay`, `MAX_PAUSE_MS` from `./ratelimit.mjs`; `httpError`, `emptyOn404` from `./errors.mjs`. At top level, after `etags`:

```js
onReset(() => {
  etags.clear();
});
```

- [ ] **Step 4: `app.mjs` uses `common.mjs` and `github.mjs`**

1. Delete from `app.mjs` everything Task 1 copied and Step 3 moved, plus `resetSession` (108-119), `sessionExpired` (121-128), `show` (147-160), `selectTab` (1733-1746), `hasUnsaved` (254-256). Import what is used from `./common.mjs?v=1` and `./github.mjs?v=1` (first two import lines after the existing ones); drop the names `app.mjs` no longer uses from the old import lines (`tokenFromHash`, `readTokenFromHash`, `sessionKeys`, `trustRead`, `rateLimitDelay`, `MAX_PAUSE_MS`, `emptyOn404`, …: the « unused import » test lists them).
2. The six shared names become properties, everywhere they are **the variable**: `token` → `app.token` (81 uses), `readToken` → `app.readToken` (13), `catalog` → `app.catalog` (8), `defaults` → `app.defaults` (4), `projects` → `app.projects` (59), `current` → `app.current` (164). Not the variable, leave alone: element ids (`$('token')`, `$('projects')`, `$('projects-dialog')`…), the key in `forgottenProjects({ …, projects: list })` (l. 1350), the error mark `{ readToken: true }` / `e.readToken` (l. 3308-3366), words in comments and strings. Written forms to watch: `function rememberProjects(list = projects)` → `list = app.projects`; `[catalog, defaults, server] = await Promise.all(…)` (l. 1819) → `[app.catalog, app.defaults, server] = …`; `const session = token` → `const session = app.token` (the local `session` keeps its name). Identity checks stay identity checks (`app.current !== project`, `app.token !== session`).
3. `await boardGate` (6 places: `refreshDots`, `loadMachine`, `refreshRunnerAlert`, `refreshRuns`, `readGap`, `refreshStable`) → `await boardFirst()`; `boardGate.then(…)` in `openProject` → `boardFirst().then(…)`.
4. The screens' share of the old `resetSession`, declared once in `app.mjs` for now (top level, after the state it names is declared; statements verbatim from l. 112-118, minus what `common.mjs` and `github.mjs` now do):

```js
onReset(() => {
  triggers.done.clear(); triggers.fresh.clear(); openReleases.clear(); doneHeight.clear();
  dots = new Map(); known = new Map(); accountTag = null; boards.clear(); for (const m of [gap.at, gap.busy, gap.again, gap.views]) m.clear(); clearTimeout(dotsTimer); dotsLast = 0; dotsPausedUntil = 0; forgotten = new Set(); clearTimeout(runnerTimer); $('runner-alert').hidden = true;
  clearTimeout(chat.timer); clearTimeout(live.timer); clearInterval(live.tick); live.tick = null;
  Object.assign(live, { repo: null, issues: null, drawn: false, busy: null });
  Object.assign(general, { machine: 'dev-server', models: {}, saved: '', unreadable: false, from: null, read: null, shown: null }); closeGeneral();
});
```

5. The screens' share of the old `show` and `selectTab`, declared once in `app.mjs` for now (same statements, same order):

```js
onView((e) => {
  if (e.what === 'screen') {
    if (e.screen !== 'project-view') closeGeneral();
    $('general-open').hidden = e.screen !== 'project-view'; // the page lives inside the project screen
    // The project list shows with a project only (none to choose from on the empty screen).
    $('projects').hidden = e.screen !== 'project-view';
    document.body.classList.toggle('has-projects', e.screen === 'project-view');
    if (e.screen !== 'project-view' && document.body.classList.contains('chat-fullscreen')) setChatFull(false);
    if (e.screen !== 'project-view' && $('projects-dialog').open) $('projects-dialog').close();
    placeMenu();
  }
  if (e.what === 'tab') {
    // Away from « Agent », the chat keeps being checked in the background so its badge can light up (issue #283).
    if (e.tab === 'chat') openChat(); else if (e.was.tab === 'chat') scheduleChat();
    // Issue #460: the « Agent » tab uses exactly the height left under the header.
    document.body.classList.toggle('chat-wide', e.tab === 'chat');
    if (e.tab !== 'chat') setChatFull(false);
    fitChat();
    if (e.tab === 'chat' && e.focus) focusChat();
  }
});
```

6. The three « unsaved » sayings, one per future owner (order as in the old `hasUnsaved`):

```js
onUnsaved(() => app.current && JSON.stringify(app.current.config) !== app.current.saved);
onUnsaved(() => generalDirty());
onUnsaved(() => Boolean($('chat-input')?.value.trim()) || Boolean(chat.live) || chat.files.length > 0);
```

7. `panel/index.html` line 172: `app.mjs?v=92` → `app.mjs?v=93`. Nothing else in that file. (If `main` has moved past 92 by the final merge: one above main's number.)

- [ ] **Step 5: Check the rename left nothing behind**

Run: `grep -nE "(^|[^.\w$'\"\`-])(token|readToken|catalog|defaults|projects|current)\b" panel/app.mjs | grep -vE "^\s*[0-9]+:\s*//"`
Expected: only the exceptions listed in 4.2 (keys, element ids inside strings, comments at the end of a line).

- [ ] **Step 6: Everything green** — the four commands. Expected: unit 1574 pass (1570 + 1 new session test + 3 guard tests), e2e 359, a11y 7. A `ReferenceError` in the e2e output names the identifier that was missed.

- [ ] **Step 7: Commit**

```bash
git add panel/ test/
git commit -m "refactor(panel): app.mjs runs on the common part; GitHub readers in github.mjs (#560)"
```

---

### How Tasks 3 to 8 work (the same recipe each time)

1. Create `panel/screen-<name>.mjs`. **Move** the listed symbols with body and comments unchanged, in the order they have in `app.mjs`. Top-level statements that register listeners move too, in the same relative order.
2. Imports: from the existing import lines of `app.mjs`, copy **verbatim** the specifiers the moved code needs; from `./common.mjs?v=1` and `./github.mjs?v=1` what it uses; remove from `app.mjs` the names it no longer uses.
3. `export` only what the task's « Exports » line lists (what `openProject`/`start` in `app.mjs` call). Right after the imports, `provide` the task's « Provides » list (all function declarations: hoisted).
4. In the moved code, a function that belongs to another part becomes `call('name', …)` (table « Actions between parts »). In the code **left in `app.mjs`**, uses of the moved functions become `call('name', …)` too when the name is in the table, a direct import otherwise: when that code moves later, it is already right.
5. Cut the screen's share out of `app.mjs`'s `onReset`, `onView` and `onUnsaved` blocks and declare it in the new module, top level, written `onReset(() => {` on its own line and closed by `});` on its own line (the session test reads these blocks).
6. Add the import to `app.mjs` so that the screen imports keep this order, top to bottom: `screen-general`, `screen-projects`, `screen-board`, `screen-chat`, `screen-header`, `screen-rules`, `screen-login` (it is the order of the watchers, and of the listeners several screens put on `document` and `window`).
7. Temporary provides: add to `app.mjs` (right after its imports) those the task lists, remove those whose provider just moved.
8. Run the four commands, then commit `refactor(panel): <screen> in its own module (#560)`.

A symbol the moved code needs that this plan does not place: stop, do not guess; say so in the report.

---

### Task 3: « Réglages généraux » → `panel/screen-general.mjs`

**Parallélisation :** séquentielle (après la tâche 2).

**Files:** Create `panel/screen-general.mjs`; Modify `panel/app.mjs`.

**Moves** (l. at the starting point): `RUNNERS_BRANCH` (1283), `writeGeneral` (1385-1404), `general`, `generalValue`, `generalDirty`, `generalFrom` (1406-1412), `openGeneral` (1414-1450), `closeGeneral` (1451-1465), `renderGeneral` (1467-1483), `savingGeneral`, `saveGeneral` (1485-1500), the three listeners on `general-open`, `general-back`, `general` (3533-3535).

**Interfaces:**
- Consumes: `common.mjs` (`$`, `el`, `toast`, `app`, `FACTORY_REPO`, `MACHINE_CHOICES`, `machineRadios`, `onReset`, `onView`, `onUnsaved`, `shown`, `setGeneralOpen`, `provide`, `call`), `api` from `github.mjs`, `readRunnersFile` from `./machine.mjs?v=4`, `toBase64` from `./lib.mjs?v=28`, `MODEL_ROLES`, `MODEL_FAMILIES`, `familyLabel`, `roleModel` from `./models.mjs`, `errorText` from `./errors.mjs`.
- Exports: none (`app.mjs` imports it for its effects: `import './screen-general.mjs?v=1';`).
- Provides: `openGeneral`, `closeGeneral`.
- Calls: `renderRules` (in `saveGeneral`), `machineSettings`, `generalWritten` (in `writeGeneral`).

**Changes inside the moved code:**
- `runnersFile('settings.json')` (in `writeGeneral` and `openGeneral`) → `readRunnersFile(api, 'settings.json')` (`runnersFile` is that one line and stays with « Paramètres »).
- `writeGeneral`: `fresh.json || machine.settings || {}` → `fresh.json || call('machineSettings') || {}`; its last three lines (`machine.settings = …; machine.sha = …; machine.general = choice;`) → `call('generalWritten', { settings: JSON.parse(body), sha: res?.content?.sha || null, general: choice });`.
- `openGeneral`: the line `if (document.body.classList.contains('chat-fullscreen')) setChatFull(false);` → `setGeneralOpen(true);` **at the same place** (its comment stays; the chat reacts, below). The two `$('project-view').hidden` → `shown().screen !== 'project-view'`.
- `closeGeneral`: the line `if (wasOpen && !$('chat').hidden && … ) refreshChat();` → `setGeneralOpen(false);` **at the same place**, before the focus is given back (its comment moves to the chat's reaction).
- `saveGeneral`: `if (current) renderRules();` → `if (app.current) call('renderRules');`.

**Declared by the screen** (cut from `app.mjs`'s blocks):

```js
onReset(() => {
  Object.assign(general, { machine: 'dev-server', models: {}, saved: '', unreadable: false, from: null, read: null, shown: null }); closeGeneral();
});
onView((e) => {
  if (e.what !== 'screen') return;
  if (e.screen !== 'project-view') closeGeneral();
  $('general-open').hidden = e.screen !== 'project-view'; // the page lives inside the project screen
});
onUnsaved(() => generalDirty());
```

**In `app.mjs`:**
- its `onView` gains the chat's reaction to the general page (it moves to the chat in Task 7):

```js
  if (e.what === 'general') {
    // The full screen removes the page's side margins: the general page never opens in it (review #556).
    if (e.general && document.body.classList.contains('chat-fullscreen')) setChatFull(false);
    // Back on « Agent »: the answer is on screen now, its badge and « Nouvelle réponse » go at once (review #556).
    if (e.was.general && !e.general && e.tab === 'chat' && e.screen === 'project-view' && app.current && chat.repo) refreshChat();
  }
```

- `chatAway`: `$('project-view').classList.contains('on-general')` → `shown().general`.
- `pickProject`: `closeGeneral()` → `call('closeGeneral')`; the link in `renderRules`: `openGeneral(e.currentTarget)` → `call('openGeneral', e.currentTarget)`.
- Temporary provides: `provide('renderRules', renderRules); provide('machineSettings', () => machine.settings); provide('generalWritten', ({ settings, sha, general }) => Object.assign(machine, { settings, sha, general }));`

- [ ] **Step 1:** create the module and apply the recipe with the changes above.
- [ ] **Step 2:** the four commands green (unit 1574, e2e 359, a11y 7). The journeys that watch this task most: `e2e/general-settings.e2e.mjs`, `e2e/agent-fullscreen.e2e.mjs`, `e2e/machine.e2e.mjs`.
- [ ] **Step 3:** commit.

---

### Task 4: « Paramètres » → `panel/screen-rules.mjs`

**Parallélisation :** séquentielle (après la tâche 3).

**Files:** Create `panel/screen-rules.mjs`; Modify `panel/app.mjs`.

**Moves:** `STAGES`, `CHECKS` (45-58); `forgotten`, `runnerTimer`, `runnerRound` (75-76); `triggers` (97-98); `checkbox` (1277-1279); `machine` (1285-1286), `runnersFile` (1288-1289), `runnersReading`, `runnersFiles` (1290-1298), `loadMachine` (1300-1310), `currentMachineLine` (1316-1317), `showMachineStatus` (1319-1325), `runnerAlertBox` (1327-1332), `refreshRunnerAlert` (1334-1366), `machineFieldset` (1368-1377), `rulesSection` (1379-1384), `renderRules` (1502-1609), `savingRules`, `extraChecksFieldset` (1611-1637), `saveRules`, `writeRules`, `writeProjectRules` (1639-1689), `wakeFactory` (1691-1698), `updateTrigger` (1700-1731); the listeners on `tab-rules` (3532) and on `rules` (`focusout`, `submit`, 3536-3541).

**Interfaces:**
- Exports: `renderRules`, `loadMachine`, `updateTrigger`, `refreshRunnerAlert`.
- Provides: `renderRules`, `machineSettings` (`() => machine.settings`), `generalWritten` (`({ settings, sha, general }) => Object.assign(machine, { settings, sha, general })`), `wakeFactory`, `refreshRunnerAlert`, `forgotten` (`() => forgotten`).
- Calls: `openGeneral`; `productionModeChanged`, `drawSite`, `drawSub`, `drawGap`, `refreshGap` (in `writeRules`); `renderProjectList` (end of `refreshRunnerAlert`); `settingsSaved` (in `writeProjectRules`).

**Changes inside the moved code:**
- `writeRules`: `await productionModeChanged(…)` → `await call('productionModeChanged', …)`; `drawSite(); drawSub();` → `call('drawSite'); call('drawSub');`; `{ drawGap(); refreshGap(true).catch(() => {}); }` → `{ call('drawGap'); call('refreshGap', true).catch(() => {}); }`.
- `writeProjectRules`: the three lines `saves++; known.set(current.repo.full_name, { pushed: null, etag: null, file: current.file }); rememberProjects();` → `call('settingsSaved', app.current);` (their comment stays).
- `refreshRunnerAlert`: last line `renderProjectList();` → `call('renderProjectList');`.

**Declared by the screen:**

```js
onReset(() => {
  triggers.done.clear(); triggers.fresh.clear();
  forgotten = new Set(); clearTimeout(runnerTimer); $('runner-alert').hidden = true;
});
onUnsaved(() => app.current && JSON.stringify(app.current.config) !== app.current.saved);
```

**In `app.mjs`:**
- remove the temporary provides of Task 3;
- `projectItems` and `renderProjectList`: `forgotten.has(…)` → `call('forgotten').has(…)`, `[...forgotten]` → `[...call('forgotten')]`;
- `checkProjects`: `refreshRunnerAlert().catch(() => {})` → `call('refreshRunnerAlert').catch(() => {})`; `sortIdea`: `wakeFactory(target, { say: true })` → `call('wakeFactory', target, { say: true })`; `loadDelivery`: `renderRules()` → `call('renderRules')`;
- `openProject` and `start` call the exports directly (`renderRules()`, `loadMachine(app.current)`, `updateTrigger(app.current.repo)`, `refreshRunnerAlert()`);
- temporary provides: `provide('productionModeChanged', productionModeChanged); provide('drawSite', drawSite); provide('drawSub', drawSub); provide('drawGap', drawGap); provide('refreshGap', refreshGap); provide('renderProjectList', renderProjectList); provide('settingsSaved', (project) => { saves++; known.set(project.repo.full_name, { pushed: null, etag: null, file: project.file }); rememberProjects(); });`

- [ ] **Step 1:** create the module and apply the recipe.
- [ ] **Step 2:** the four commands green. Most watched: `e2e/settings-tab.e2e.mjs`, `advanced-settings`, `extra-checks`, `checks-minutes`, `machine`, `runner-alert`, `project-trigger`, `production-gap`.
- [ ] **Step 3:** commit.

---

### Task 5: top of the project → `panel/screen-header.mjs`

**Parallélisation :** séquentielle (après la tâche 4).

**Files:** Create `panel/screen-header.mjs`; Modify `panel/app.mjs`.

**Moves:** `REVIEW_BODY`, `UI_POLISH_BODY` (30-36); `PHONE` (144-145); `drawSite` (1217-1231); `runsTimer`, `refreshRuns` (1861-1884); `drawSub`, `loadDelivery` (1886-1905); `GAP_MS`, `gap`, `refreshGap`, `gapMode`, `readGap`, `drawGap`, `gapDate` and the listeners on `prod-gap`, `gap-close` (1907-2022); `AWAITING`, `SENT_MS`, `release`, `wasSent`, `awaitingOf`, `refreshRelease`, `versionedChangelog`, `drawRelease`, `sendRelease`, the listeners on `release`, `release-cancel`, `release-confirm`, `productionModeChanged` (2024-2154); `stableChanges`, `refreshStable`, the listener on `stable` (2156-2189, `FACTORY_REPO` already in `common.mjs`); `loadScript`, `openPhone` (2202-2215); the listeners on `site`, `phone-open`, `phone-close` (2217-2224) and on `general-review`, `ui-polish`, `stack-open`, `stack`, `stack-close` (2232-2237); `stackCache`, `STACK_CARD`, `stackInline`, `stackNodes`, `stackState`, `followLink`, `showStack`, `openStack`, `showNoStack`, `askStack`, `startRun`, `startGeneralReview`, `startUiPolish` (2239-2357); the « Plus » menu: `menuItems`, `phoneMq`, `placeMenu`, `placeNewFeature`, the top-level `placeMenu();`, the `phoneMq` listener, `closeMore` and its two `document` listeners (3570-3600).

**Interfaces:**
- Exports: `drawSub`, `drawGap`, `refreshGap`, `drawRelease`, `refreshRelease`, `loadDelivery`, `refreshStable`, `refreshRuns`.
- Provides: `refreshRuns`, `refreshRelease`, `refreshGap`, `drawSite`, `drawSub`, `drawGap`, `productionModeChanged`.
- Calls: `renderRules` (in `loadDelivery`), `renderBoard` (in `askStack`: `call('renderBoard').catch(() => {})`; in `startRun`: `await call('renderBoard')`), `board` (in `drawRelease`: `(live.issues || [])` → `(call('board').issues || [])`).

**Changes inside the moved code:** the three view reads of `placeMenu`/`placeNewFeature` (table « View reads »). The comment « Read the media query here: drawRelease may run before phoneMq is declared » stays with its line.

**Declared by the screen:**

```js
onReset(() => {
  for (const m of [gap.at, gap.busy, gap.again, gap.views]) m.clear();
});
onView((e) => { if (e.what === 'screen') placeMenu(); });
```

**In `app.mjs`:**
- remove the temporary provides of the five header actions (keep `renderProjectList`, `settingsSaved`);
- `refresh` (board): `refreshRelease().catch(soft(null))` → `call('refreshRelease').catch(soft(null))`, `refreshGap()` → `call('refreshGap')`; `renderBoard`: `drawSite()` → `call('drawSite')`; `checkProjects`: `refreshRuns()` → `call('refreshRuns')`;
- `openProject` and `start` call the exports directly;
- temporary provides: `provide('renderBoard', renderBoard); provide('board', () => ({ repo: live.repo, issues: live.issues, activity: live.activity, ticking: Boolean(live.tick) }));`

- [ ] **Step 1:** create the module and apply the recipe.
- [ ] **Step 2:** the four commands green. Most watched: `e2e/release*.e2e.mjs`, `production-gap`, `phone-release`, `stack`, `stable-button`, `site-link`, `ui-polish`, `version-tag`, `width-report`, and every a11y journey with a phone viewport (the « Plus » menu).
- [ ] **Step 3:** commit.

---

### Task 6: project list → `panel/screen-projects.mjs`

**Parallélisation :** séquentielle (après la tâche 5).

**Files:** Create `panel/screen-projects.mjs`; Modify `panel/app.mjs`.

**Moves:** `dots` (77-78), `known`, `accountTag` (79-80), `saves` (81-82); `loadProjects` (162-216), `rememberProjects` (218-220), `checkProjects` (222-252), `reloadProjects` (266-273); `dotNode`, `projectItems`, `OTHER_FORGOTTEN`, `OTHERS`, `renderProjectList`, `pickProject`, `setDot` (275-327); `dotsTimer`, `dotsBusy`, `dotsLast`, `dotsPausedUntil`, `dotsIdle`, `projectDotOf` (329-361); `refreshDots` (379-409); `wakeDots` (1261-1267); the listeners on `project-switch`, `projects-close` (2225-2231).

**Interfaces:**
- Exports: `recallProjects`, `loadProjects`, `checkProjects`, `refreshDots`, `renderProjectList`.
- Provides: `renderProjectList`, `settingsSaved` (the function of Task 4's temporary provide, now named `settingsSaved(project)`), `setDot`, `wakeDots`.
- Calls: `openProject`, `refreshRuns`, `refreshRunnerAlert`, `forgotten`, `closeGeneral`, `board`, `stopLive`.

**Changes inside the moved code:**
- every `openProject(…)` (`checkProjects` ×2, `reloadProjects`, `pickProject`) → `call('openProject', …)` (it returns the promise: the `await`s and `.catch` stay);
- `checkProjects`, no project left: `clearTimeout(live.timer); clearInterval(live.tick); live.tick = null;` → `call('stopLive');`
- `dotsIdle`: `live.activity` → `call('board').activity`.
- New, cut out of `start()` (its three lines 1825-1827, comment included), so that `accountTag` and `known` stay private:

```js
// What the browser kept of the last visit: the list shows at once (issue #399).
export async function recallProjects() {
  // No digest on a plain-http address (no crypto.subtle): the panel then works without the memory.
  accountTag = await tokenTag(app.token).catch(() => null);
  const remembered = readProjectsCache(store.get(PROJECTS_KEY), accountTag);
  known = remembered?.known || new Map();
  return remembered?.projects || [];
}
```

**Declared by the screen:**

```js
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
```

**In `app.mjs`:**
- `start()`: `const remembered = await recallProjects(); if (remembered.length && !app.projects.length) { app.projects = remembered; …` (the rest of the block unchanged);
- `provide('openProject', openProject);` (stays for good);
- remove the temporary provides `renderProjectList`, `settingsSaved`; `refresh` (board): `setDot(…)` → `call('setDot', …)`; the board's activity and visibility listeners: `wakeDots()` → `call('wakeDots')`;
- temporary provide: `provide('stopLive', () => { clearTimeout(live.timer); clearInterval(live.tick); live.tick = null; });`

- [ ] **Step 1:** create the module and apply the recipe.
- [ ] **Step 2:** the four commands green. Most watched: `e2e/project-list.e2e.mjs`, `project-switch`, `project-memory`, `fast-switch`, `switch-state`, `tab-on-switch`, `dots-refresh`, `board-first`, `runner-alert`.
- [ ] **Step 3:** commit.

---

### Task 7: « Agent » → `panel/screen-chat.mjs`

**Parallélisation :** séquentielle (après la tâche 6).

**Files:** Create `panel/screen-chat.mjs`; Modify `panel/app.mjs`.

**Moves:** `focusChat`, `setChatFull`, the listeners on `chat-full`, on the `(max-width: 700px)` media query and the `Escape` `keydown`, `fitChat`, its `resize` listener and its `ResizeObserver` (1748-1786); the whole section « Agent (chat) » from `SEEN_KEY` to the listener on `chat-close` (2358-3525: state `chat`, `resetChat`, the read-token card and `checkReadToken`, `openChat`, `refreshChat`, `scheduleChat`, the `visibilitychange` and `copy` listeners, the bubbles, the proposals, `sendChat`, `sendToServer`, the `factory-chat` branch writers, `closeConversation`, the composer listeners); the listener on `tab-chat` (3530-3531).

**Interfaces:**
- Exports: `resetChat`, `setChatServer` (new: `export function setChatServer(url) { chat.server = url; }`).
- Provides: none.
- Calls: `renderBoard` (in `decide`: `call('renderBoard').catch(() => {})`), `board` (in `boardRequests`).

**Changes inside the moved code:**
- `boardRequests`: `(repo) => { const b = call('board'); return openRequests(b.repo === repo ? b.issues : null); }`;
- the five `$('chat').hidden` reads (table « View reads »); `chatAway` ends as `shown().tab !== 'chat' || shown().general`;
- `chatGet`, `branchJson`, `chatImage`, `chatFile`, `checkReadToken` keep their own `fetch` (they import `API` from `github.mjs`, `guardRead` too).

**Declared by the screen** (the `tab` and `general` branches of `app.mjs`'s `onView`, comments included, and the chat's line of its `screen` branch):

```js
onReset(() => {
  clearTimeout(chat.timer);
});
onView((e) => {
  if (e.what === 'screen' && e.screen !== 'project-view' && document.body.classList.contains('chat-fullscreen')) setChatFull(false);
  if (e.what === 'general') { /* the two lines Task 3 put in app.mjs */ }
  if (e.what === 'tab') { /* the five lines Task 2 put in app.mjs */ }
});
onUnsaved(() => Boolean($('chat-input')?.value.trim()) || Boolean(chat.live) || chat.files.length > 0);
```

**In `app.mjs`:** `start()`: `chat.server = chatServerUrl(server?.url)` → `setChatServer(chatServerUrl(server?.url))`; `openProject` calls `resetChat()` directly; its `onView` and `onUnsaved` blocks are now empty: delete them.

- [ ] **Step 1:** create the module and apply the recipe.
- [ ] **Step 2:** the four commands green. Most watched: every `e2e/agent-*.e2e.mjs`, `chat-*`, `read-token`, `confirm-request`, `finish-conversation`, `framing-button`, `request-size`.
- [ ] **Step 3:** commit.

---

### Task 8: « Suivi » → `panel/screen-board.mjs`

**Parallélisation :** séquentielle (après la tâche 7).

**Files:** Create `panel/screen-board.mjs`; Modify `panel/app.mjs`.

**Moves:** `live`, `boards`, `BOARD_KEYS`, `blankBoard`, `knownIssues`, `knownWaits`, `enterBoard`, `LANES` (456-506); from `mergeEvents` to `startLive` (532-1215: `refresh`, `schedule`, `liveText`, `drawStatus`, the cards, `flip`, the « go »/« Ok » answers, the pending zone and its `click`/`auxclick`/`focus`/`visibilitychange` listeners, the ideas, `drawBoard`); `renderBoard` (1233-1247); the owner-activity listeners (1249-1259); the `visibilitychange` listener (1268-1275); the listener on `tab-board` (3529).

**Interfaces:**
- Exports: `enterBoard`, `renderBoard`, `startLive`, `boardInfo` (new: `export function boardInfo() { return { repo: live.repo, issues: live.issues, activity: live.activity, ticking: Boolean(live.tick) }; }`).
- Provides: `renderBoard`, `board` (= `boardInfo`), `stopLive` (new function, the three statements of Task 6's temporary provide).
- Calls: `setDot`, `wakeDots`, `refreshRelease`, `refreshGap`, `drawSite`, `wakeFactory` (all already written as `call` since Tasks 4 to 6).

**Changes inside the moved code:** `startLive`: `!$('board').hidden` → `shown().tab === 'board'`. Nothing else.

**Declared by the screen** (statements verbatim; the session test reads `boards.clear()`, `clearTimeout(live.timer)` and `clearInterval(live.tick)` in this block: keep them written out, do not call `stopLive()` here):

```js
onReset(() => {
  openReleases.clear(); doneHeight.clear(); boards.clear();
  clearTimeout(live.timer); clearInterval(live.tick); live.tick = null;
  Object.assign(live, { repo: null, issues: null, drawn: false, busy: null });
});
```

**In `app.mjs`:** remove the temporary provides `renderBoard`, `board`, `stopLive` and the now empty `onReset` block; `openProject`: `if (live.repo !== next.repo.full_name) enterBoard(…)` → `if (boardInfo().repo !== next.repo.full_name) enterBoard(…)`, `if (!live.tick) startLive()` → `if (!boardInfo().ticking) startLive()`.

- [ ] **Step 1:** create the module and apply the recipe.
- [ ] **Step 2:** the four commands green. Most watched: `e2e/panel.e2e.mjs`, `yours-cards`, `done-cards`, `ideas`, `ok-button`, `card-right-away`, `board-first`, `waits`, `relaunch`, `release-card`, `release-fold`, `agent-badge`, and the five a11y journeys.
- [ ] **Step 3:** commit.

---

### Task 9: sign-in screen, entry point, final checks

**Parallélisation :** séquentielle (après la tâche 8).

**Files:** Create `panel/screen-login.mjs`; Modify `panel/app.mjs`, `test/panel-screens.test.mjs`, `test/panel-session.test.mjs`.

**Interfaces:**
- `screen-login.mjs` — Moves: the listeners on `login-form` and `logout` (2191-2201). Calls: `start` (`start();` → `call('start');`, which returns the promise exactly as before: not awaited). Uses `app`, `store`, `TOKEN_KEY`, `$`, `resetSession`, `show`, `call` from `common.mjs`. The logout listener keeps the exact text `$('logout').addEventListener('click', () => {` + `resetSession({ forget: true });` (the session test reads it).
- `app.mjs` — `provide('start', start);` next to `provide('openProject', openProject);`.

- [ ] **Step 1: Write the failing tests** (final shape of the split), added to `test/panel-screens.test.mjs`:

```js
const ORDER = ['common', 'github', 'screen-general', 'screen-projects', 'screen-board', 'screen-chat', 'screen-header', 'screen-rules', 'screen-login'];

test('app.mjs imports the parts in the documented order (the order of their reactions)', () => {
  const mine = imports(files['app.mjs']).map((i) => i.replace(/\.mjs$/, '')).filter((i) => ORDER.includes(i));
  assert.deepEqual(mine, ORDER);
});

test('the entry point keeps no screen state: it declares no reset, no view reaction, nothing unsaved', () => {
  assert.doesNotMatch(files['app.mjs'], /\bon(Reset|View|Unsaved)\(/);
  assert.deepEqual([...files['app.mjs'].matchAll(/\bprovide\('([^']+)'/g)].map((m) => m[1]).sort(), ['openProject', 'start']);
  assert.ok(files['app.mjs'].split('\n').length < 250, 'app.mjs only wires the parts');
});

test('every screen has its module, and every action provided is used', () => {
  assert.deepEqual(screens, ['screen-board.mjs', 'screen-chat.mjs', 'screen-general.mjs', 'screen-header.mjs', 'screen-login.mjs', 'screen-projects.mjs', 'screen-rules.mjs']);
  const provided = [...all.matchAll(/\bprovide\('([^']+)'/g)].map((m) => m[1]);
  const called = new Set([...all.matchAll(/\bcall\('([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual(provided.filter((n) => !called.has(n)), []);
});
```

and to `test/panel-session.test.mjs` (where the one reset lives, with `files` imported from `./panel-source.mjs`):

```js
test('la remise à zéro vit dans la partie commune ; chaque écran y déclare la sienne', () => {
  assert.match(files['common.mjs'], /export function resetSession\(/);
  const declaring = Object.keys(files).filter((f) => /^onReset\(\(\) => \{$/m.test(files[f])).sort();
  assert.deepEqual(declaring, ['github.mjs', 'screen-board.mjs', 'screen-chat.mjs', 'screen-general.mjs', 'screen-header.mjs', 'screen-projects.mjs', 'screen-rules.mjs']);
});
```

Run: `node --test test/panel-screens.test.mjs test/panel-session.test.mjs`
Expected: the order test, the « entry point » test and the « every screen » test FAIL (no `screen-login.mjs`, no `provide('start'`, leftovers in `app.mjs`); the session one passes already if Tasks 2 to 8 were done right (a failure names the module that forgot its reset).

- [ ] **Step 2: Create `panel/screen-login.mjs`** (recipe of Tasks 3 to 8) and import it last in `app.mjs`.

- [ ] **Step 3: Tidy `app.mjs`.** What is left, in this order: the import lines (old ones reduced to what `openProject`, `start` and the version watcher use; then `common`, `github` and the seven screens in the `ORDER` above); `provide('openProject', openProject); provide('start', start);`; `openProject`; `BUILD`, `toldBuild`, `checkVersion`, `watching`, `retryTimer`, `watchVersion`; `fetchJson`; `start`; `setupTabs(document.querySelector('.tabs'));`, `watchNumbers($('app'));`, `start().catch((err) => toast(errorText(err)));`; the width report (`widthReport`, `showWidthReport`, the `?largeur` line). `openProject` keeps its statements in today's order (it writes the project's name and links itself and calls each screen's exports). Section-header comments of moved code that stayed behind are deleted; no other comment is lost (each moved with its code).

- [ ] **Step 4: Nothing was dropped on the way.** The code is the same lines in other files:

```bash
git show 4ebe6e1:panel/app.mjs | wc -l
cat panel/app.mjs panel/common.mjs panel/github.mjs panel/screen-*.mjs | wc -l
for f in $(git show 4ebe6e1:panel/app.mjs | grep -oE "^(async )?function [A-Za-z]+" | awk '{print $NF}'); do n=$(grep -lE "^(export )?(async )?function $f\(" panel/*.mjs | wc -l); [ "$n" = 1 ] || echo "$f: $n"; done
```

Expected: the two totals within a few hundred lines (imports, `provide`, the blocks); the loop prints only `hasUnsaved: 0`?? no — `hasUnsaved` was a `const`: the loop prints **nothing** (every function of the old file exists exactly once: `resetSession`, `sessionExpired`, `show`, `selectTab` in `common.mjs`).

- [ ] **Step 5: Everything green** — the four commands. Expected: unit 1578 pass (1574 + 4), e2e 359, a11y 7.

- [ ] **Step 6: Commit** `refactor(panel): sign-in screen in its module; app.mjs only wires the parts (#560)`.

- [ ] **Step 7: Report for the PR.** A table « part → file → lines » (`wc -l panel/app.mjs panel/common.mjs panel/github.mjs panel/screen-*.mjs`), against « before: `app.mjs`, 3 600 lines »; the list of real defects noticed and not fixed (each becomes an « idée à trier »), or « none ».

---

## Before the PR: merge `origin/main` and carry over every change to the panel

The split started from `4ebe6e1`; other requests keep shipping changes to `panel/app.mjs` meanwhile (#558 works on `checkReadToken`, now in `panel/screen-chat.mjs`; #561 changes how the modules are versioned).

- [ ] `git fetch origin main && git diff 4ebe6e1..origin/main --stat -- panel/ test/ e2e/ a11y/` : list what moved on main.
- [ ] `git merge origin/main`. `panel/app.mjs` will conflict: **never** resolve by taking either side. For every hunk of `git diff 4ebe6e1..origin/main -- panel/app.mjs`, find the function it touches (`grep -n "function <name>" panel/*.mjs`) and apply the same change in the module that now holds it, with this plan's substitutions (`app.current`, `call(…)`, …). Tick the hunks off one by one and list them in the PR (« Aucune correction perdue »).
- [ ] A new top-level function or state added on main goes to the screen it belongs to (and, if another screen uses it, to the actions table and a `provide`), never back into `app.mjs`.
- [ ] `panel/index.html`: main's version number + 1 for `app.mjs` (still the only line changed there). **If #561 is merged**: follow its mechanism for every new module instead of `?v=1` (one identical specifier everywhere stays the rule; `test/panel-imports.test.mjs` as main has it must pass).
- [ ] New tests from main that read `panel/app.mjs` as text: repoint them to `test/panel-source.mjs` (`all`, `fn`), assertions unchanged.
- [ ] The four commands green again (e2e and a11y counts are then main's, all passing), then open the PR.
