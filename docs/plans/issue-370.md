# Release card on the board — Implementation Plan

> **For agentic workers:** executed inline with executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** every « Mise en production » becomes a card in « Suivi » that shows its step live, then its outcome.

**Architecture:** the release issue (label `factory:production`) is the card. The relay keeps it open until the
live site is checked, marks the second step with the label `factory:release-checking`, and writes each step and
outcome in a hidden marker `<!-- factory-release {json} -->` inside its usual comments. The panel shows open release
issues in « Les agents travaillent », closed ones in « Terminé », and reads the marker for the details.

**Tech Stack:** plain JS modules, `node --test`, Playwright e2e, GitHub Actions.

**Spec:** issue #370 (saved in `docs/specs/370-…md`).

## Global Constraints

- Texts on screen, French, vouvoiement: « Mise en production lancée : suivez-la dans l'onglet Suivi », « Mise en ligne en cours », « Vérification du site en ligne », « Mise en production en cours », « En ligne ✅ », « Voir le site en ligne », « Pas mise en production », « Annulée : le site en ligne ne marchait plus, la version d'avant est revenue », « Le site en ligne ne marchait plus : une correction urgente est en cours », « Rien à mettre en ligne : le site est déjà à jour ».
- « En production ✅ » is only written after the live check.
- No new colour or font outside `DESIGN.md`.

## Review Focus

- A release issue that never gets a marker (old releases, written before this change): the card still shows a sensible outcome from the old comment text.
- No live check possible (host reports nothing, no site address): the card must still finish (live, unchecked) instead of staying « en cours » forever.
- Failure paths that used to leave the release issue open (conflict, GitHub error) must close it, or the button stays greyed forever.
- The production-open job runs project code (smoke): it must stay read-only; the step label is written by a separate job.
- A marker planted by someone else on a public project must be ignored (owner or factory bot only).

---

### Task 1: relay — keep the release open until checked, markers and outcomes

**Files:** Modify `scripts/relay.mjs`, `scripts/lib/labels.mjs`, `.github/workflows/relay.yml`. Test `test/relay.test.mjs`, `test/workflows.test.mjs` (if it pins job names).

**Produces:** `releaseMarker(data) -> string` (exported, `<!-- factory-release ${JSON} -->`); label `L.releaseChecking = 'factory:release-checking'`; `relay.releaseChecking(check)`; command `release-step`.

- [ ] Failing tests: success path posts a `deploying` marker and keeps the issue open; `prodReport` ok with `release` posts « En production ✅ » + `live` marker and closes; nothing/version-refused/conflict post `nothing`/`failed` markers and close; rollback posts `undone` (or `broken`) with `fix` and closes; no live check possible → `live` with `unchecked: true`, closed; `releaseChecking` labels the issue.
- [ ] Implement; `checkLive` returns whether a check was started; `release.version` travels in the prodCheck payload only when set.
- [ ] Workflow: split the smoke step of `production-open` into `production-smoke`; new job `production-step` (issues: write, runs only the factory's script) labels the release; `production` needs the three.

### Task 2: panel — card, done item, button

**Files:** Modify `panel/lib.mjs`, `panel/live.mjs`, `panel/app.mjs`, `panel/style.css`. Test `test/panel-lib.test.mjs`, `e2e/release-card.e2e.mjs`, `e2e/fixture.mjs` (closed issues list).

**Produces:** `COLUMNS` gains `{ id: 'release', title: 'Mise en production', label: 'factory:production' }`; `releaseOutcome(comments, owner) -> {state, prs, version, site, fix, reason, todo, at} | null`; `releaseList(body) -> [{number,title}]`; `doneItems` adds closed release issues with `release: true`; `releaseButton(pending, running)`.

- [ ] Failing unit tests for the four helpers (marker wins, untrusted marker ignored, old texts parsed).
- [ ] Failing e2e, one per acceptance criterion (toast, card with step, button greyed, success, failure with counter back, rollback with link, history order, phone width).
- [ ] Implement, then run `npm test` and `npm run test:e2e`.
