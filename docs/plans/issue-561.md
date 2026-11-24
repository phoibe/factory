# Panel: one build stamp on every published file (issue #561) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (one agent, TDD, in one go). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At each publication every file of the panel is addressed with `?v=<commit sha>`, so a reloaded page never mixes two versions, and no number is kept by hand any more.

**Architecture:** `scripts/stamp-panel.mjs` (pure functions + a small CLI, Node builtins only) builds `_site` exactly as `pages.yml` does today, then rewrites every relative import specifier of every published `.mjs` and the local script/stylesheet references of `index.html` with `?v=<sha>`, substitutes `__BUILD__` and writes `version.json`. `pages.yml` calls it instead of its shell copy + `sed`. The sources carry no `?v=` at all; the three run-time loads get the stamp from `meta[name=build]` through one helper of `panel/lib.mjs`.

**Tech Stack:** Node 22 ESM, `node --test`, no-build vanilla panel, Playwright e2e (`CHROMIUM_PATH=/opt/pw-browsers/chromium`).

**Spec:** issue #561, the `<!-- factory-spec -->` comment (and its hidden `factory-notes`).

## Facts checked on main (7ceee54)

- Hand-kept numbers live in 5 files only: `panel/index.html` (l.11 `style.css?v=60`, l.172 `app.mjs?v=86`), `panel/app.mjs` (10 of its 23 imports, l.1-23), `panel/live.mjs` (l.2, l.4), `panel/eta.mjs` (l.3), `panel/projects.mjs` (l.2-3). The six shared modules have no import and no `?v=`.
- 24 `.mjs` are published (18 of `panel/`, 6 of `scripts/lib/`), 30 relative specifiers in all, every one a single-quoted `from './x.mjs'`. `eta.mjs` is loaded under two addresses today.
- Run-time loads: `panel/app.mjs` l.1777 (`catalog.json`, `factory.config.json`), l.2166 (`vendor/qrcode.js`). `BUILD` is read l.1748, `checkVersion` tests `/^[0-9a-f]{7,}$/` l.1751.
- `e2e/fixture.mjs` and the five `a11y/panel*.a11y.mjs` servers answer by pathname from the sources: they need no stamp and keep working.
- A prototype of this plan was run: the stamped copy starts in Chromium, 24 modules requested, each once, no page error.

## Global Constraints

- Nothing changes on screen: no text, markup or style edit other than removing the `?v=N`.
- The stamp is the full commit sha, the same value as `meta[name=build]` and `version.json`.
- Never stamped: fonts (`fonts/*.woff2`), icons (`favicon.svg`, `apple-touch-icon.png`), `version.json` and `chat-server.json` (both keep `cache: 'no-store'`).
- Unstamped copies (e2e fixture, a11y servers, unit tests) keep working with no number.
- `cacheBustOnly` in `agent/scripts/fabrication.mjs` and `test/fabrication.test.mjs` stay untouched.
- No new dependency. `test/*.test.mjs` must not import Playwright (some runners run them without `npm ci`).
- Never edit `.factory/` nor `.claude/skills/`. Code, comments and commits in English; e2e test name in French.
- When merging `origin/main` (issue #556 edits the same import lines): keep the lines without numbers.

## Review Focus

- Empty or malformed sha given to the CLI → exit 1 with a message, nothing written (Task 1 test).
- A specifier that already has a query (`?v=28`) → replaced, never doubled (Task 1 test).
- Import forms other than today's: multi-line `import {…} from`, `export … from`, `import './x.mjs'`, `import('./x.mjs')` → stamped; bare and `https://` specifiers, external `href` with a query → untouched (Task 1 tests).
- A module the panel imports but that is not published (new shared module forgotten in `SHARED`) → the guard fails (Task 2 test: every specifier resolves to a file of the site).
- A new kind of local reference (`<link href="x.json">`, CSS `@import`) → the guard fails until someone decides (Task 2 test: explicit allow-list of unstamped extensions).

---

### Task 1: the stamper

**Files:** Create `scripts/stamp-panel.mjs`, `test/stamp-panel.test.mjs`.

**Interfaces — Produces** (all exported from `scripts/stamp-panel.mjs`):
- `SHARED = ['packs/catalog.json', 'defaults/factory.config.json', 'scripts/lib/config-core.mjs', 'scripts/lib/ratelimit.mjs', 'scripts/lib/answer.mjs', 'scripts/lib/waits.mjs', 'scripts/lib/trust.mjs', 'scripts/lib/models.mjs']` — copied flat next to the panel.
- `isBuild(build)` → `/^[0-9a-f]{7,40}$/.test(build)`.
- `stampModule(text, build)` → text with every relative specifier ending in `?v=<build>`.
- `stampHtml(html, build)` → html with every `__BUILD__` replaced and every local `src`/`href` to a `.mjs`, `.js` or `.css` ending in `?v=<build>`.
- `buildSite({ root = <repo root>, out, build })` → throws `Error` when `!isBuild(build)`; otherwise copies `panel/` recursively into `out`, copies `SHARED` flat, applies `stampModule` to every `.mjs` under `out` (found by walking, no list), `stampHtml` to `out/index.html`, writes `out/version.json` as `{ "build": "<build>" }\n`.
- CLI (guarded by `process.argv[1] === fileURLToPath(import.meta.url)`): `node scripts/stamp-panel.mjs <outDir> <sha>`; missing/invalid argument → message on stderr, exit 1.

- [ ] **Step 1: failing tests** in `test/stamp-panel.test.mjs` (`B = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'`):
  - `stampModule("import { a } from './lib.mjs?v=28';", B)` → `"import { a } from './lib.mjs?v=${B}';"`; same for no query, `export { a } from "../x.mjs"`, `import './x.mjs'`, `import('./x.mjs')`, and a `from` on the last line of a multi-line import.
  - `stampModule` leaves `from 'node:fs'`, `from 'playwright'`, `from 'https://x/y.mjs'` unchanged; stamping twice gives the same text as once.
  - `stampHtml` on `<meta name="build" content="__BUILD__"><link rel="icon" href="favicon.svg"><link rel="stylesheet" href="style.css?v=60"><a href="https://github.com/x?name=a">x</a><a href="#">y</a><script type="module" src="app.mjs"></script>` → build substituted, `style.css?v=${B}`, `app.mjs?v=${B}`, the three other `href` byte-identical.
  - `isBuild`: true for `B` and `'abc1234'`; false for `''`, `'__BUILD__'`, `'main'`, `'ABC1234'`.
  - `buildSite` into `mkdtempSync(join(tmpdir(), 'site-'))` (removed in `finally`): the file list equals `walk(panel)` relative paths ∪ basenames of `SHARED` ∪ `version.json`; `version.json` is exactly `{ "build": "${B}" }\n`; `index.html` has no `__BUILD__`; `fonts/Geist-Variable.woff2` and `catalog.json` are byte-identical to their source.
  - `buildSite({ out, build: '' })` throws and leaves `out` empty; the CLI run with `spawnSync(process.execPath, ['scripts/stamp-panel.mjs', out, ''])` exits 1.
- [ ] **Step 2:** `node --test test/stamp-panel.test.mjs` → FAIL (module not found).
- [ ] **Step 3: implement.** Regexes validated by the prototype:
  - module: `/(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?\2/g` → `` `${lead}${q}${path}?v=${build}${q}` ``
  - html: `/\b(src|href)="([^"#?:]+\.(?:mjs|js|css))(?:\?[^"]*)?"/g` → `` `${attr}="${path}?v=${build}"` ``
  - copy with `cpSync(..., { recursive: true })`; check `isBuild` before touching `out`.
- [ ] **Step 4:** `node --test test/stamp-panel.test.mjs` → PASS. Commit `feat(panel): stamp script for the published panel (#561)`.

### Task 2: no hand-kept number, run-time loads, guard

**Files:** Modify `panel/index.html`, `panel/app.mjs`, `panel/live.mjs`, `panel/eta.mjs`, `panel/projects.mjs`, `panel/lib.mjs`, `test/panel-lib.test.mjs`, `test/stamp-panel.test.mjs`.

**Interfaces — Consumes:** `buildSite`, `SHARED` (Task 1). **Produces** in `panel/lib.mjs`:
- `isDeployed(build)` → `/^[0-9a-f]{7,}$/.test(build)` (the test `checkVersion` does today).
- `versioned(url, build)` → `` `${url}?v=${build}` `` when `isDeployed(build)`, else `url`.

- [ ] **Step 1: failing tests.**
  - `test/panel-lib.test.mjs`: `versioned('catalog.json', 'a1b2c3d')` → `'catalog.json?v=a1b2c3d'`; with `'__BUILD__'` and `''` → `'catalog.json'`.
  - `test/stamp-panel.test.mjs`, guard 1 — « no hand-kept number in the sources »: every `.mjs`, `.html`, `.css` under `panel/` (walk; skip `vendor/`, `fonts/`) plus the `.mjs` of `SHARED`: no match of `/\.\w+\?v=/`. The failure message lists `file:line`.
  - guard 2 — « no published file escapes the stamp » on `buildSite` of the real files (temp dir), with checks independent of the stamper's regexes:
    - in every `.mjs` of the site, every match of ``/(['"`])(\.{1,2}\/[^'"`\s]*?\.m?js)(\?[^'"`]*)?\1/g`` has `m[3] === '?v=' + B` and `m[2]` resolves (from the file's folder) to an existing file of the site;
    - in `index.html`, every `src`/`href` value without a scheme and not starting with `#` either ends with `?v=${B}` or has an extension in `['.svg', '.png']`; at least one `.mjs` and one `.css` are stamped;
    - in every `.css` of the site: no `@import`, and every `url(...)` target has an extension in `['.woff2', '.svg', '.png']`;
    - `panel/app.mjs` source contains `versioned('catalog.json', BUILD)`, `versioned('factory.config.json', BUILD)` and `versioned('vendor/qrcode.js', BUILD)`, and still `fetch('chat-server.json', { cache: 'no-store' })`.
- [ ] **Step 2:** `node --test test/stamp-panel.test.mjs test/panel-lib.test.mjs` → FAIL (guard 1 lists the 5 files; `versioned` missing).
- [ ] **Step 3: implement.** Remove every `?v=N` from the 5 files (nothing else on those lines). Add the two helpers to `panel/lib.mjs`, import them in `app.mjs` l.1; `checkVersion` uses `isDeployed(BUILD)`; l.1777 and l.2166 wrap their URL in `versioned(…, BUILD)`. Update the comment l.1746 (`version.json` is written by `scripts/stamp-panel.mjs`).
- [ ] **Step 4:** same command → PASS; `npm test` → PASS. Commit `feat(panel): no hand-kept version number, run-time loads follow the build (#561)`.

### Task 3: publication

**Files:** Modify `.github/workflows/pages.yml`, `test/workflows.test.mjs`, `STACK.md`.

- [ ] **Step 1: failing test** in `test/workflows.test.mjs` — « the panel is published stamped »: `pages.yml` matches `/node scripts\/stamp-panel\.mjs _site "\$GITHUB_SHA"/`, does not match `/cp -r panel|sed -i/`, and its `paths:` line contains `'scripts/stamp-panel.mjs'` and every entry of `SHARED` that is not under `defaults/`.
- [ ] **Step 2:** `node --test test/workflows.test.mjs` → FAIL.
- [ ] **Step 3: implement.** In `pages.yml`: add `'scripts/stamp-panel.mjs'` to `paths`; after checkout add `actions/setup-node@v4` with `node-version: 22`; replace the whole shell block (mkdir, two `cp`, `sed`, `printf`) by `run: node scripts/stamp-panel.mjs _site "$GITHUB_SHA"`, keeping the comment about the open panels. The chat-server step still writes `_site/chat-server.json` afterwards: untouched. `STACK.md` l.46 becomes:

  ```markdown
  - **Automatique** — chaque merge sur la branche principale publie le panneau sur GitHub Pages (`.github/workflows/pages.yml`), tous ses fichiers marqués du numéro de cette publication ; vos projets reçoivent la nouvelle version quand la version stable avance
  ```
- [ ] **Step 4:** `npm test` → PASS (workflow, stack-check and stack-neutral tests included). Commit `ci(pages): build the site with the stamp script (#561)`.

### Task 4: the published panel tried in a real browser

**Files:** Modify `e2e/fixture.mjs`; create `e2e/build-stamp.e2e.mjs`.

**Interfaces:** `withPanel({ root })` — new option, documented in the header comment: a folder served as the whole site (the panel as published). When set, the static handler reads `join(root, path === '/' ? 'index.html' : path)` and ignores `PANEL`/`EXTRA`; default `null` = today's behaviour.

- [ ] **Step 1: failing test** `e2e/build-stamp.e2e.mjs`, named `'le tableau de bord tel qu\'il sera publié démarre, et tous ses fichiers sont demandés avec le même numéro'`:
  - `buildSite({ out: root, build: B })` into a `mkdtempSync` folder (removed in `finally`), then `withPanel({ root, issues: [issue(1, 'Une carte', ['factory:feature', 'factory:queued'])] }, …)`.
  - before `goto`: collect `pageerror` texts and, on `request`, every same-origin `new URL(r.url())`.
  - `page.goto(url)`; wait for `.ticket` with text `Une carte`; click `getByRole('button', { name: 'Sur mon téléphone' })`; wait for `#phone-qr svg`.
  - assert: no page error; `meta[name="build"]` content is `B`; every request whose pathname ends in `.mjs`, `.js` or `.css`, or is `/catalog.json` or `/factory.config.json`, has `search === '?v=' + B`; the sorted set of requested `.mjs` pathnames equals the sorted `.mjs` files of `root`, and the number of distinct `.mjs` URLs equals that count (no module under two addresses); `/style.css`, `/catalog.json`, `/factory.config.json`, `/vendor/qrcode.js` were requested; every request ending in `.woff2`, `.svg`, `.png` and `/chat-server.json` has an empty `search`.
- [ ] **Step 2:** `CHROMIUM_PATH=/opt/pw-browsers/chromium node --test e2e/build-stamp.e2e.mjs` → FAIL (`root` ignored: `__BUILD__` in the meta). If `node_modules` is missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci`.
- [ ] **Step 3:** implement the `root` option in `e2e/fixture.mjs`.
- [ ] **Step 4:** same command → PASS. Commit `test(e2e): the published panel starts, all in one version (#561)`.

### Final verification

- [ ] `npm run typecheck && npm run lint && npm test && npm run build` → all PASS.
- [ ] `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` and `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:a11y` → PASS (the unstamped sources still start everywhere).
- [ ] `grep -rnE '\.\w+\?v=' panel scripts/lib --exclude-dir=vendor` → no line. `git diff origin/main -- agent/scripts/fabrication.mjs` → empty.
- [ ] No README change (the factory itself); no before/after screenshots (nothing visible changes).
