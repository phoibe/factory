# Forgotten private projects (dev server key) Implementation Plan

> **For agentic workers:** executed inline (medium request, `executing-plans`). Steps use checkbox syntax.

**Goal:** warn the owner in the panel (banner, project mark, settings line) and in the Mac tools when a private project meant for the dev server is not seen by the « factory runners » key.

**Architecture:** the dev server check (`scripts/runners.mjs`) only lists the projects its key sees, in `status.json` (branch `factory-runners`, keyed by `repoKey(repo.id)`). The panel sees every project: a pure helper compares its list with the status file; the panel draws the result. No change to the check itself.

**Tech Stack:** browser JS modules, `node --test`, Playwright e2e.

**Spec:** issue #504, comment `<!-- factory-spec -->` (version 1).

## Global Constraints
- Link: `https://github.com/settings/personal-access-tokens`; help text « Cliquez sur factory runners, cochez le projet, puis enregistrez. »
- Banner text: « <nom> n'est pas vu par le serveur de dev : ses tâches consomment vos minutes GitHub. »; button « Ajouter à la clé factory runners ».
- Only alert when a check made with a working key (`key: 'ok'`) after the repository's creation missed it; never for public projects or projects set to GitHub; no alert when the check is stale (> 2 h: the status is rewritten at least hourly).
- Colours from DESIGN.md only (warn-soft / warn-line).

## Review Focus
- Projects remembered from an older panel visit (no `created_at` in the cache) → no alert until GitHub's fresh list arrives.
- Key refused / missing → the existing key alerts speak, never « pas vu ».
- Logging out → banner hidden, set cleared.
- Several forgotten projects → one banner naming all of them.

---

### Task 1: pure rule (`panel/machine.mjs`)
- [x] Tests in `test/panel-machine.test.mjs`: `forgottenProjects({ status, general, projects, now }) -> string[]`, `runnerAlertText(names) -> string`, `RUNNER_KEYS_URL`, and `machineLine({..., created, now})` returning `{ tone: 'warn', keys: true }` for a missed project. Run, see them fail.
- [x] Implement; `slimRepo` keeps `created_at` (test in `test/panel-projects.test.mjs`).

### Task 2: panel wiring (`panel/app.mjs`, `index.html`, `style.css`)
- [x] `refreshRunnerAlert()` reads `settings.json` and `status.json`, fills `#runner-alert`, marks `.pwarn` in the project list; called at start, after each project list check, every 15 min; cleared by `resetSession`.
- [x] Settings warn line gets the keys button. Bump cache versions.
- [x] Journeys in `e2e/runner-alert.e2e.mjs` (fixture gains `created`).

### Task 3: Mac tools reminder (`scripts/factory.sh`)
- [x] Test in `test/factory-sh.test.mjs`: private project output mentions the key and the link; public one does not.
- [x] Add the lines to `dev_server_reminder`.
