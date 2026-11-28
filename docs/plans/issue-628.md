# Consommation page (issue #628) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure every factory run's token use per task type, model, effort and kind, and show it on a new « Consommation » page of the panel, in public-price dollars and in estimated share of the two plan gauges.

**Architecture:** At the end of each run, `agent/scripts/usage.mjs` reads the Claude Code transcript (session + `subagents/`) and merges one compact record into `usage/YYYY-MM.json` on the project's own branch `claude/factory-usage` (a cloud run can push `claude/…` branches, grilling/chat runs have no PR, and one file per month keeps the panel to 1–2 reads per project). The panel reads those files for every project, prices them with a shared table (`scripts/lib/prices.mjs`), and keeps readings/resets/calibration under the `quota` key of `settings.json` (branch `factory-runners`). All arithmetic lives in two pure modules (`panel/consumption.mjs`, `panel/quota.mjs`).

**Tech Stack:** dependency-free JS (Node + browser ES modules), `node --test`, Playwright e2e (`e2e/`), axe a11y (`a11y/`).

**Spec:** last `<!-- factory-spec -->` message of issue #628 (« Spec (version 1) »), incl. its hidden « Notes pour le plan ».

## Global Constraints

- All owner-facing copy in French, exactly as the spec writes it (quoted below where it matters); code, names, commits in English.
- No dependency, no chart. Same look as « Réglages généraux » (framed blocks, aligned numbers) — DESIGN.md is the rule.
- Record content: numbers, dates, task types, kinds, model ids, issue number, stage. Never request text.
- Retention 3 months (month files and readings older than 3 months are dropped); the page never shows more than 30 days.
- `usage.mjs` never fails a run: any error prints one line and exits 0.
- Prices ($/MTok, checked 3 Nov 2026 — re-verify on the pricing page at build): fable-5-2 8/40/0.20, opus-5-5 4/20/0.20, sonnet-5-5 2/10/0.10, haiku-5-5 0.10/0.50/0.01 (input/output/cache read; haiku cache read = 0.1 × input unless the page says otherwise). Cache write = 1.25 × input (5 min), 2 × input (1 h).
- Nothing else changes: models, efforts, design pass, screenshots, 3 review rounds.

## Review Focus

- A message written on several transcript lines with the same `message.id` (and a sub-agent message echoed in the main file) is counted once — test in Task 2.
- A model version with no price (`claude-opus-5-6`, dated id `claude-opus-5-5-20261201`, `<synthetic>`): dated id is priced as its base, unknown shows tokens + « tarif inconnu », synthetic is skipped — tests in Tasks 1 and 3.
- Two readings across a reset (time crossed, or a gauge went down) never calibrate — test in Task 4.
- A project whose usage file fails to read (500, invalid JSON) does not hide the others; a 404 (no branch yet) is just « no data » — e2e in Task 5.
- Concurrent runs on one project pushing the same month file: the second push re-fetches and re-merges instead of losing the first record — test in Task 2.

---

### Task 1: Price table and monthly price check — parallélisable

**Files:**
- Create: `scripts/lib/prices.mjs`, `test/prices.test.mjs`
- Modify: `scripts/models.mjs` (also update prices), `.github/workflows/models.yml` (diff/add `scripts/lib/prices.mjs`, list changed prices in the PR body), `scripts/stamp-panel.mjs` (`SHARED` += `scripts/lib/prices.mjs`), `.github/workflows/pages.yml` (paths), `e2e/fixture.mjs` and `a11y/panel.a11y.mjs` (`EXTRA['/prices.mjs']`)

**Interfaces — Produces:**
- `PRICES: Array<{ model: 'claude-opus-5-5', input, output, cacheRead, since: 'YYYY-MM-DD' }>` between `// prices:start` / `// prices:end` markers, one entry per line; `PRICES_DATE = '2026-11-03'`.
- `priceFor(modelId: string): Price | null` — strips a trailing `-YYYYMMDD`; `null` when unknown.
- `costOf(t: { input, cw5, cw1, cacheRead, output }, modelId): number | null` — dollars; `null` when unpriced.
- `parsePrices(text): Array<{ model, input, output, cacheRead }>` and `updatePrices(source, found, today): string` (pure, like `updateCatalog`: changed or new versions get `since: today`; none removed).

- [ ] **Step 1: failing tests** in `test/prices.test.mjs`: `costOf({input:1e6,cw5:1e6,cw1:1e6,cacheRead:1e6,output:1e6}, 'claude-opus-5-5') === 4 + 5 + 8 + 0.2 + 20`; `priceFor('claude-fable-5-2-20261101').input === 8`; `priceFor('claude-opus-5-6') === null`; `costOf(…, 'claude-opus-5-6') === null`; `parsePrices` on a fixture snippet of the pricing page (rows like `Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.40 / MTok | $20 / MTok`, plus a markdown-table and an HTML `<td>` variant) gives `{ model: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.4 }`; `updatePrices` bumps one line with the new `since`, appends a new version, leaves the text identical when nothing changed. Extend `test/stamp-panel.test.mjs`/`test/workflows.test.mjs` only if they enumerate `SHARED` or workflow paths.
- [ ] **Step 2:** `npm test` → the new tests FAIL (module missing).
- [ ] **Step 3:** implement `prices.mjs`; in `scripts/models.mjs` add `updatePrices` from `PRICE_SOURCES = ['https://platform.claude.com/docs/en/about-claude/pricing', 'https://docs.anthropic.com/en/docs/about-claude/pricing']` (same timeout/fallback rules, never throws, logs `Prices: opus-5-5 4/20/0.2 -> …`); workflow commits both files.
- [ ] **Step 4:** `npm test` → PASS. **Step 5:** commit `feat(prices): public price table per model version`.

**Acceptance:** prices are importable from both Node and the panel (`/prices.mjs`), unknown versions give `null`, the monthly job proposes price changes in its PR.

### Task 2: Usage capture at the end of each run — parallélisable

**Files:**
- Create: `agent/scripts/usage.mjs`, `test/usage.test.mjs` (+ small transcript fixtures in `test/fixtures/usage/`)
- Modify: `agent/AGENT.md` (kind table + end-of-run command), `agent/stages/question.md` (step 5: run it before removing `factory:running`, the only branch the chat touches), `agent/stages/build.md`, `bugfix.md`, `code-review.md`, `design-pass.md`, `audit.md`, `screenshots.md`, `acceptance-fix.md` (add the `[kind:…]` tag where they spell a description), `test/question-stage.test.mjs` if it pins question.md's steps

**Kind convention:** a sub-agent description is `[role:<rôle>] [kind:<id>] <libellé>` (after `[role:plan:amont]` too). Ids per role — plan: `questions`, `plan`, `bug`, `framing`; code: `build`, `task-review`, `design-critique`, `review-fix`, `owner-fix`, `checks-fix`; review: `final-review`, `review-round`, `scope-check`, `security`, `audit`; audit: `parts`, `history`; simple: `research`, `screenshots`; any role: `other`. Without a tag, derive: plan+amont → stage `grilling|spec` `questions`, `bugfix` `bug`, `framing` `framing`; plan in `build|bugfix` → `plan`; code in `fix-checks` → `checks-fix`, in `feedback|visual-fix|acceptance-fix` → `owner-fix`, in `build|bugfix|foundation` → `build`; review in `audit` → `audit`; audit with label starting `Historique` → `history`, else `parts`; simple in `screenshots` → `screenshots`; else `other`. No role tag → role `code`. Pilot kind by stage: `grilling|spec` → `questions`; `build|bugfix|foundation` → `build`; `feedback|fix-checks|visual-fix|acceptance-fix|update-branch|resume|skills-fix` → `fixes`; `audit|ui-polish` → `audit`; else `other`.

**Interfaces — Produces (the record format Task 3 reads):**
```
usage/YYYY-MM.json (month of the run's end, branch claude/factory-usage of the project):
{ "v": 1, "runs": { "<session id>": Run } }
Run = { at: ISO, issue: number|null, stage: string, size: 'small'|'medium'|'large'|null,
        tasks: [{ type: 'pilot'|'plan'|'code'|'review'|'audit'|'simple', kind: string, model: string, effort: 'low'|'medium'|'high'|null }],
        use: [[hour 'YYYY-MM-DDTHH' (UTC), taskIndex, modelId, input, cw5, cw1, cacheRead, output]] }
```
`tasks[0]` is the pilot (main session). A task's `model` is the id with the most tokens in its file; tasks with no tokens are dropped.
- `KINDS: { plan: string[], code, review, audit, simple, pilot }` (ids above), `kindOf({ role, up, label, stage }): string`, `pilotKind(stage): string`
- `usageFromTranscript({ main: string[], subagents: Array<{ lines: string[], meta: object }>, stage }): { tasks, use }` — pure.
- `sizeOf(issue, comments): 'small'|'medium'|'large'|null` — only for a `factory:feature` issue, last `<!-- factory-estimate size=… -->` of body + comments.
- `mergeRun(month: object|null, session, run): object` and `expiredMonths(fileNames, now): string[]` (months older than 3 before `now`'s month).
- CLI `node .factory/scripts/usage.mjs [--dry-run]`: repo from `remote.origin.url` (`repoFromRemote`), transcript from `findTranscript(repo)` (`transcript.mjs`), run from its first `runFromPrompt`, issue via `defaultGh` (`specs.mjs`); pushes like `shots.mjs publish` (temp worktree, orphan branch on first use), but on a rejected push it fetches, resets to the remote, re-applies `mergeRun` and retries (5 tries); deletes expired months in the same commit. Prints `Consommation notée : <n> tâches.`; `--dry-run` prints the Run JSON and pushes nothing.

- [ ] **Step 1: failing tests** in `test/usage.test.mjs`: two lines with the same `message.id` counted once; a main-file line also present in a sub-agent file counted only for the sub-agent; `isSidechain` main lines and model `<synthetic>` skipped; `cache_creation.ephemeral_5m/1h` split into `cw5`/`cw1` (fallback: all of `cache_creation_input_tokens` → `cw5`); effort from `meta.effort`, else the lines' `effort`, pilot effort = most frequent line `effort`; role/kind from `meta.description` (`[role:review] [kind:review-round] Tour 2` → review/review-round; `[role:plan:amont]` in stage `bugfix` → plan/bug); usage at 10:59Z and 11:01Z land in hours `…T10` and `…T11`; `sizeOf` reads the last marker and returns null for a `factory:bug`; `mergeRun` keeps another session's run and replaces the same session's; `expiredMonths(['2026-07.json','2026-08.json','2026-11.json'], new Date('2026-11-28'))` → `['2026-07.json']`; a test that AGENT.md lists every kind id above and that build.md contains `[kind:final-review]`, `[kind:review-round]`, `[kind:scope-check]`, `[kind:security]`, `[kind:plan]`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement; add to AGENT.md under « Modèles par rôle » the kind table (one line per role) and, in « La toute dernière action de chaque run », « juste avant : `node .factory/scripts/usage.mjs` depuis le dossier du projet (s'il échoue, continue) ». Tag the descriptions in the stage files listed.
- [ ] **Step 4:** `npm test` → PASS; `node agent/scripts/usage.mjs --dry-run` in this session prints a Run with tasks for `plan` and `code`. **Step 5:** commit `feat(usage): record each run's consumption on claude/factory-usage`.

**Acceptance:** each run leaves one record per session in the month file of its project, idempotent when run twice.

### Task 3: Aggregation, periods and formatting (pure) — parallélisable

**Files:** Create `panel/consumption.mjs`, `test/panel-consumption.test.mjs`.

**Interfaces — Consumes:** the Run format of Task 2; a `price(modelId) → Price|null` and `cost(tokens, modelId)` passed in (Task 1's `priceFor`/`costOf`; tests pass fakes).
**Produces:**
- `TASK_TYPES`: `[{ id: 'plan', name: 'Plans et organisation' }, code 'Écriture du code', review 'Revue', audit 'Relectures d’une review générale', simple 'Tâches simples', pilot 'Agent qui pilote']` (names from `MODEL_ROLES`), each with `kinds: [{ id, name }]` in the spec §4 order and wording (« questions et fiche », « plan », « analyse d’un bug », « cadrage d’un projet », « autres »; « construction », « relectures de tâche », « critique du design », « corrections après relecture », « corrections après vos retours (captures, recette) », « corrections après les contrôles automatiques », « autres »; « relecture finale », « relectures 2 et 3 », « vérification de portée », « revue de sécurité », « review générale », « autres »; « code partie par partie », « historique du projet »; « recherches », « captures », « autres »; pilot « questions et fiche », « construction », « corrections », « review générale et amélioration UI », « autres »).
- `aggregate(runs, { from: Date, to: Date, size: 'all'|'small'|'medium'|'large', cost }): { rows: Row[], total: { tasks, tokens, dollars: number|null, fableDollars } }`; `Row = { type, family, version, showVersion, effort, tasks, tokens, dollars|null, fableDollars, kinds: Array<{ kind, name, tasks, tokens, dollars|null }> }`. A task counts when it has tokens in `[from, to)`; hour buckets are prorated by overlap. Row key = type + task model family + version + effort; `showVersion` only when one family has two versions in the result. Rows sorted by `TASK_TYPES` order, then dollars desc. `dollars` null when any of its tokens is unpriced.
- `costBetween(runs, from, to, { cost, fableOnly = false }): number` (same proration; unpriced tokens ignored).
- `fmtDollars(x)` (« 58 $ » at ≥ 10, « 4,10 $ » below, « tarif inconnu » for null), `fmtTokens(n)` (« 41 M de tokens », « 1,2 M de tokens », « 850 000 tokens »), `fmtShare(p)` (« 0 % » for 0, « < 0,1 % », « ≈ 0,6 % » below 10, « ≈ 9 % »), `fmtAverage(dollars, tasks)` (« trop peu de mesures » under 5 tasks).

- [ ] **Step 1: failing tests**: rows in type order; two runs with Revue on Fable and Opus give two rows; size `small` excludes `size: null` runs, `all` includes them; a 30-min overlap of an hour bucket counts half; an unpriced model gives `dollars: null` but tokens; `fableDollars` only from `claude-fable-*`; every kind id listed in Task 2 has a name; formatter values above.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(panel): consumption aggregation`.

### Task 4: Quota readings and calibration (pure) — parallélisable

**Files:** Create `panel/quota.mjs`, `test/panel-quota.test.mjs`.

**Interfaces — Consumes:** a `cost(from: Date, to: Date, { fableOnly }) → dollars` passed in (built by Task 5 from Task 3's `costBetween`).
**Produces:**
- `weekStart(now: Date, reset: { day: 1..7 (1 = lundi), hour: 0..23 }): Date` (local time); `periodOptions(now, reset|null)`: with reset `[{ id: 'current', label: 'Semaine de forfait en cours' }, { id: 'previous', label: 'Semaine de forfait précédente' }, { id: '30d', label: '30 derniers jours' }]`, without `[{ id: '7d', label: '7 derniers jours' }, { id: '30d', … }]`, each with `from`/`to`; `weeks(periodId)` = 30/7 for `30d`, else 1.
- `quota = { reset: { all: {day,hour}|null, fable: {day,hour}|null }, readings: [{ at: ISO, all: int, fable: int|null, outside: boolean|null }], calibration: { from, to, all: $perPoint|null, fable: $perPoint|null, previous?: calibration } | null }`
- `parseReading(text, { optional })` → `{ value: int|null }` or `{ error: 'Entrez un nombre entre 0 et 100.' }`.
- `needsQuestion(quota, now): boolean` — a reading exists in the current « tous moteurs » week.
- `addReading(quota, { all, fable, outside }, { now, cost }): { quota, message: string|null }` — start = oldest reading of the same week after which every reading answered `outside: false`; no calibration when: `outside` true (« Ce relevé devient le point de départ du prochain étalonnage. »), a reset between start and new reading or a gauge went down (« Une remise à zéro a eu lieu depuis le relevé précédent : ce relevé devient le point de départ. »), all-gauge rise < 5 (« La jauge tous moteurs a monté de 3 points depuis le relevé précédent : il en faut au moins 5 pour étalonner. Laissez la factory travailler, puis notez un nouveau relevé. »), factory cost 0 (« La factory n’a rien consommé depuis le relevé précédent : pas d’étalonnage. »). Otherwise `calibration = { from, to, all: cost/Δall, fable: Δfable ≥ 5 ? fableCost/Δfable : null, previous }`. Drops readings older than 3 months.
- `deleteLast(quota)` — removes the newest reading; restores `calibration.previous` if it ended on it.
- `livePerPoint(quota, cost)` — recomputes from `from`/`to` (stored values when cost is 0 for a window outside the data read).
- `calibrationLine(quota, now, cost)` → « Pas encore d’étalonnage » or « Étalonnage du 28 nov. · 1 % de la semaine tous moteurs ≈ 19 $ · 1 % de la semaine Fable ≈ 6 $ », with « (provisoire) » appended when `now - to < 3 h`.
- `splitLines(quota, now, cost)` → for the newest reading of the current week, per calibrated gauge: « Jauge tous moteurs à 43 % : factory ≈ 31 %, hors factory ≈ 12 % » (same for « Fable »), plus « L’étalonnage est peut-être à refaire. » when factory > reading.

- [ ] **Step 1: failing tests**: `weekStart(new Date(2026,10,28,10), { day: 4, hour: 9 })` equals `new Date(2026,10,26,9)` and `new Date(2026,10,26,8)` gives `new Date(2026,10,19,9)`; `periodOptions` labels with and without reset; one test per message above with exact strings; « Non » with Δ = 6 calibrates `all` and leaves `fable` null when Δfable = 2 or empty; a « Oui » in the middle moves the start; a reset day/hour between the two readings blocks; `deleteLast` restores the previous calibration; provisional under 3 h; `parseReading('150')`, `('4,5')`, `('')` (optional only).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(panel): plan gauge readings and calibration`.

### Task 5: « Consommation » screen — séquentielle (après les tâches 1, 2, 3 et 4)

**Files:**
- Create: `panel/screen-usage.mjs`, `e2e/usage.e2e.mjs`
- Modify: `panel/index.html` (`<section id="usage-view" hidden>` next to `#general-view`, with `#usage-back` « ← Retour aux réglages généraux » and `<h1 id="usage-title" tabindex="-1">Consommation</h1>`), `panel/app.mjs` (import the screen), `panel/screen-general.mjs` (link button « Voir la consommation » under the « Modèles » fieldset; opening hides `#general-view` without touching the `general` draft; closing shows it again; keep `quota` in `writeGeneral`'s merge), `panel/style.css` (table: `.usage-table-wrap { overflow-x: auto }`, tabular numbers, right-aligned figures), `e2e/fixture.mjs` (option `usage: { 'o/r': { '2026-11': object | 'invalid' | 500 } }` served at `contents/usage/<m>.json?ref=claude/factory-usage` for any repo incl. `phoibe/factory`), `a11y/panel.a11y.mjs` (screen « Consommation » with a table, expanded row and the question, light and dark, plus phone width), `DESIGN.md` (« Mises en page » : new section « Consommation (page à part) » with the 7 grid lines, « Écrans concernés : Consommation », and the number table described), `test/panel-imports.test.mjs`/`test/panel-screens.test.mjs` if they list screens; add to `test/panel-consumption.test.mjs` a check that every id of `KINDS` (Task 2) has a name in `TASK_TYPES`.

**Interfaces — Consumes:** Tasks 1, 3, 4 exports; `app.projects` (+ `FACTORY_REPO` if absent), `api`, `mapLimit` (`github.mjs`), `readRunnersFile` (`machine.mjs`). Reads month files from the earliest of 30 days ago, previous week start and `calibration.from` (≤ 3 months) to now, 4 projects at a time; 404 = no data, other failure = « Les chiffres de <nom> n'ont pas pu être lus. ». Saves `quota` with a fresh read of `settings.json` + `PUT` that only changes `quota` (same create-branch path as `writeGeneral`), then `call('generalWritten', …)`.

Page content (spec §1–8): « Chargement… » while reading; « Période » and « Taille » selects (« Toutes les demandes », « Petites », « Moyennes », « Grandes »); table columns « Type de tâche », « Moteur · effort » (« Fable · élevé », efforts faible/moyen/élevé, version shown when `showVersion`), « Tâches », « Total » (dollars + `<small>` tokens), « En moyenne », then « Semaine Fable » / « Semaine tous moteurs » only for calibrated gauges (divided by `weeks(period)`); each row a `<button aria-expanded>` in its first cell toggling its kind sub-rows (same columns); last row « Total »; empty state « Aucune mesure pour l'instant. Les chiffres arrivent à la fin du prochain lancement de la factory. »; grey line « Équivalent au tarif public de Claude du 3 nov. 2026. Ce n'est pas une facture. » (date from `PRICES_DATE`). Block « Mon forfait »: « Remise à zéro de la semaine » (day + hour selects for « Tous moteurs » and « Fable », « Enregistrer »), « Nouveau relevé » (« Tous moteurs (%) », « Fable (%) », « Noter le relevé » disabled until the reset is saved), the Oui/Non question with its grey line (« En dehors de la factory : vos discussions sur claude.ai, vos propres sessions, vos tâches planifiées et l'onglet « Agent ». »), the message of `addReading`, last reading with date/time and « Supprimer ce relevé », `calibrationLine`, `splitLines`.

- [ ] **Step 1: failing e2e tests** in `e2e/usage.e2e.mjs`, one per verifiable criterion, named with its words: `le lien Voir la consommation ouvre la page et Retour aux réglages généraux y ramène` (and an unsaved model choice is still there); `la page montre type de tâche, moteur et effort, tâches, total en dollars avec les tokens et la ligne Total`; `une ligne de moins de 5 tâches affiche trop peu de mesures`; `un toucher sur une ligne Revue la déplie : relecture finale, relectures 2 et 3, vérification de portée`; `les listes Période et Taille changent les chiffres et sans remise à zéro la période propose 7 derniers jours et 30 derniers jours`; `la remise à zéro enregistrée propose Semaine de forfait en cours et Semaine de forfait précédente` (asserts the `PUT settings.json` keeps `machine`/`models`); `un second relevé demande l'usage hors factory et avec Non et moins de 5 points dit qu'il en faut au moins 5`; `un relevé de 150 est refusé et Supprimer ce relevé le fait disparaître`; `sans étalonnage seuls les dollars s'affichent et après étalonnage 1 % de chaque jauge et les colonnes de forfait apparaissent`; `sur téléphone la page tient sur une colonne et le tableau défile sans faire déborder la page` (390 px: `scrollWidth <= innerWidth`, wrapper scrollable); `un projet illisible n'empêche pas les autres et la page dit lequel manque`; `une page sans mesure dit Aucune mesure pour l'instant`; `un moteur sans tarif affiche tarif inconnu`. Fixture data: build Runs with `Date.now()`-relative hours.
- [ ] **Step 2:** `CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 node --test e2e/usage.e2e.mjs` → FAIL.
- [ ] **Step 3:** implement the screen, link, styles, fixture option; update a11y and DESIGN.md.
- [ ] **Step 4:** the e2e file, `e2e/general-settings.e2e.mjs`, `npm test` and `CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 npm run test:a11y` → PASS.
- [ ] **Step 5:** commit `feat(panel): Consommation page`.

**Acceptance:** criteria 1–10 of « Comment vérifier » pass on the local panel; a11y clean light/dark/phone.

### Task 6: Record this build's own measure — séquentielle (après la tâche 2)

Done by the pilot, not a sub-agent: once Task 2 is merged into the branch, run `node agent/scripts/usage.mjs` from the repo root (the project's `.factory/scripts/` copy only appears after the factory's own sync) right before opening the PR, and again as the last command before removing `factory:running`. Check: `gh api "repos/phoibe/factory/contents/usage/2026-11.json?ref=claude/factory-usage" --jq .sha` answers, so the preview page shows this build's rows (criterion 2).
