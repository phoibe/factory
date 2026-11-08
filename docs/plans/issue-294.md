# Production on approval (issue #294) Implementation Plan

> **For agentic workers:** executed inline with superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** each project can hold its live site until the owner presses « Mise en production » on the board.

**Architecture:** the host publishes a `production` branch instead of `main` (one-time host setting, explained in the
panel). Merges still land on `main`; in « sur mon accord » mode the merged PR gets `factory:awaiting-production` and
no live check. The panel's button opens an issue labelled `factory:production` (same pattern as « Déclarer stable »);
the relay moves `production` to main's head, drops the pending labels, starts the usual live check, comments
« En production : … » and closes the issue. In automatic mode the relay keeps `production` (if it exists) on main
after each merge.

**Tech Stack:** plain JS modules, `node --test`, Playwright e2e.

**Spec:** issue #294, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Setting `production`: `"auto"` (default, also for unknown values, with a warning) or `"approval"`.
- Button text « Mise en production (N) »; with nothing pending it is greyed and says « Rien en attente ».
- Button only on « sur mon accord » projects, next to « Nouvelle fonctionnalité », never in « Plus ».
- Confirmation lists every pending title, « Confirmer » / « Annuler ».
- Pending projects never appear in « À vous de jouer ».
- Copy in French, vouvoiement.

## Review Focus

- An undo PR (`REVERT_MARKER`) merged in approval mode must still go live at once (the site is broken).
- `production` branch missing when the first change is held: created at the merge's parent (what is live).
- Switching back to « automatique » with pending changes releases them (panel opens the release issue).
- A release issue opened by someone other than the owner is ignored.
- A release with nothing pending says so and closes, without moving anything.

---

### Task 1: setting + labels
**Files:** `scripts/lib/config-core.mjs`, `schema/factory.config.schema.json`, `scripts/lib/labels.mjs`, `test/config.test.mjs`
- [ ] Test: `resolveConfig({production:'approval'})` → `config.production === 'approval'`; `{}` → `'auto'`; `'x'` → `'auto'` + warning.
- [ ] Implement; `L.awaitingProd = 'factory:awaiting-production'`, `L.production = 'factory:production'` with LABEL_DEFS.

### Task 2: relay hold / release
**Files:** `scripts/relay.mjs`, `scripts/lib/github.mjs` (`updateRef`, `createRef`, `getCommit`, `listAwaiting`), `test/relay.test.mjs`
- [ ] Tests: approval merge → PR labelled awaiting, no prodCheck, comment mentions « Mise en production »; revert PR in approval → prodCheck; release issue from owner → `production` moved to main head, labels removed, prodCheck `{pr: newest, sha: head}`, comment « En production » with titles, issue closed; nothing pending → closed with « Rien n'attendait »; auto mode with existing `production` branch → ref updated after merge.
- [ ] Implement `holdForApproval(pr)`, `release(issueNumber)`, `followMain(sha)` in `createRelay`.

### Task 3: panel
**Files:** `panel/index.html`, `panel/app.mjs`, `panel/lib.mjs` (`releaseButton(pending)`), `panel/style.css`, `test/panel-lib.test.mjs`, `e2e/release.e2e.mjs`, `e2e/fixture.mjs`
- [ ] Unit test `releaseButton([])` → `{ text: 'Mise en production', disabled: true, hint: 'Rien en attente' }`; 3 → `Mise en production (3)`.
- [ ] Rules fieldset « Mise en production » (two radios + host hint); save creates `production` branch when switching to approval, opens the release issue when switching back with pending changes.
- [ ] Header button + `<dialog id="release-dialog">`; e2e tests for spec checks 1, 3, 4, 5, 6 (panel side).

### Task 4: docs
- [ ] GLOSSARY terms, STACK unchanged (no new library), PRODUCT capability line.
