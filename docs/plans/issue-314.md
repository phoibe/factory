# Project list with status dots — Implementation Plan

> **For agentic workers:** executed inline with executing-plans (factory run, no human review of the plan).

**Goal:** Replace the project `<select>` with an always-open, alphabetical project list on the right (full-screen list on phones) where each project shows at most one status dot.

**Architecture:** A pure module `panel/projects.mjs` decides the order and the dot of a project from its open issues (reusing `boardItems` / `laneFor`). `app.mjs` polls every other project's open issues every 30 s (ETag requests, 304 is free), reads the comments of blocked cards only (to tell « Attend #… » from a real block), keeps the last known dot on failure, and renders the list into a desktop `<aside>` and a phone `<dialog>`.

**Tech Stack:** Vanilla JS modules, `node --test`, Playwright e2e.

**Spec:** issue #314, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Desktop (> 900 px): column ~240 px, sticky, on the right, title « Projets » without count, scrolls on its own.
- Phone (≤ 900 px): the project name is a button opening the same list full screen; tapping a project opens it and closes the list; a red or blue dot (never grey) next to the name when **another** project needs the owner.
- Dot: red « Bloqué » > blue « À vous de jouer » > grey « En cours » > none. Ideas and pending releases never count. A block that only waits for another merge counts grey.
- Current project: lighter background, bold name, rounded corners, no blue.
- Long names ellipsised, full name on hover. Refresh at load then every 30 s. GitHub failure keeps the last known dot.
- Colours only from DESIGN.md tokens; French copy, vouvoiement.

## Review Focus

- A project whose issue list fails to load: keeps its previous dot (test in Task 1: `nextDots`).
- A blocked card with `factory:running` (agent working on it): grey, not red (Task 1 test).
- Names with different case/accents sort as a French reader expects (Task 1 `sortProjects` test with « b », « Alpha », « été »).
- The phone indicator ignores the current project's own dot (Task 1 `othersDot`).
- Switching project from the list cancels a « go » countdown (e2e ok-button updated).

---

### Task 1: Pure helpers `panel/projects.mjs`

**Files:** Create `panel/projects.mjs`; Test `test/panel-projects.test.mjs`.

**Produces:**
- `sortProjects(projects) -> projects` (by `repo.name`, `localeCompare(…, 'fr', { sensitivity: 'base' })`).
- `projectDot(issues, waits = new Map()) -> 'blocked' | 'yours' | 'working' | null` (issues with label names as strings; `waits`: number → array of awaited numbers).
- `blockedNumbers(issues) -> number[]` (blocked cards not running: the ones whose comments must be read).
- `DOT_LABELS = { blocked: 'Bloqué', yours: 'À vous de jouer', working: 'En cours' }`.
- `othersDot(dots: Map<fullName, dot>, current: fullName) -> 'blocked' | 'yours' | null`.
- `nextDots(prev: Map, results: Map<fullName, dot | undefined>) -> Map` (undefined = failed → keep previous).

- [ ] Tests first (each rule of the spec, review-focus cases), run `npm test`, see them fail; implement; pass; commit.

### Task 2: Layout and rendering (`index.html`, `style.css`, `app.mjs`)

- Remove `<select id="project">`; add `<aside id="projects" class="projects" aria-labelledby="projects-title">` with `<h2>Projets</h2><ul id="projects-list">`, and `<dialog id="projects-dialog">` with the same list (`#projects-dialog-list`) and a « Fermer » button.
- `#project-name` stays the h1 text; add `<button id="project-switch">` (phone only) holding the name, a `.switch-dot` and a chevron.
- `renderProjectList()` draws both lists: `<li><button class="project-item" aria-current>` + `.pdot.pdot-<kind>` (`role="img"`, `aria-label`, `title`) + `.pname` (title = full name).
- Grid on `body` > 900 px: main + 240 px aside; aside `position: sticky; top: 0; height: 100dvh; overflow-y: auto`.

### Task 3: Polling other projects (`app.mjs`)

- `refreshDots()` every 30 s via `setTimeout`, also at start; for each project except the current one: open issues pages (ETag cache `dotEtags`), then comments of `blockedNumbers` to compute `waitedFor`; current project's dot comes from `live.issues` + `live.waits` after every `refresh()`.
- e2e `e2e/project-list.e2e.mjs`, one test per spec acceptance criterion that a browser can check (1–6); fixture gains `repoIssues` (per-repo open issues).
