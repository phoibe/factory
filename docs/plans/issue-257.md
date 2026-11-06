# « Ok » button on captures and recette cards — Implementation Plan

> Factory run: executed inline (no human review of the plan), tasks done in order with TDD.

**Goal:** On the « Captures à valider » and « Tester » plates of « À vous de jouer », an « Ok » button posts the comment `ok` after the same 5 s cancellable countdown as the spec « go ».

**Architecture:** `yoursList` (panel/live.mjs) gives each plate a `reply` kind: `go` (spec), `ok` (visual, acceptance) or `open`. panel/app.mjs reuses the « go » countdown machinery (`pendingGo`, `sentGo`, `answerGo`, `sendGo`) for both words; only the button text, the posted word and the toast change.

**Tech Stack:** plain browser ES modules, node --test, Playwright e2e against a fake GitHub (e2e/fixture.mjs).

**Spec:** issue #257, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Captures toast: « « ok » envoyé. Captures validées : la fusion se fera dès que les contrôles automatiques sont verts. »
- Recette toast: « « ok » envoyé. Recette validée : la mise en ligne se fait maintenant. »
- Button order: « Ok » (blue `button.go`), then « Voir les captures » / « Ouvrir l'aperçu à tester » + « Voir la recette » (secondary).
- 5 s countdown « Annuler (n s) », project switch cancels, « Envoi… » once sent, failure restores « Ok ».
- Spec and blocked plates unchanged. No new colour or font (DESIGN.md).

## Review Focus

- Looking at the captures / preview / recette and coming back must not take the plate off « À vous de jouer » (only sending does) → e2e « ouvrir l'aperçu puis revenir… ».
- Failed send restores the live button even after a redraw → e2e « si l'envoi échoue… ».
- Project switch during countdown → e2e « changer de projet… ».
- A plate without preview → e2e « sans aperçu… ».
- Desktop layout: buttons grouped on the right, not spread across the row → screenshots.

---

### Task 1: reply kind `ok`

**Files:** Modify `panel/live.mjs` (`yoursList`, `REPLIES`); Test `test/panel-live.test.mjs`.

- [x] Failing test: acceptance and visual plates get `reply: 'ok'`, blocked stays `open`.
- [x] Run `npm test` → FAIL; implement `REPLIES = { spec: 'go', visual: 'ok', acceptance: 'ok' }`; run → PASS.

### Task 2: « Ok » button, labels, toasts, hold after send

**Files:** Modify `panel/app.mjs` (`REPLY_LABELS`, `goWord`, `goText`, `goButton`, `replyLink`, `answerButtons(c, previewLink)`, `SENT`, `sendGo`, `cancelPendingGos`, click listener); Test `e2e/ok-button.e2e.mjs`, fixture options `repos`, `comments`, `failing` on writes.

- [x] Failing e2e journeys, one per acceptance criterion (French names).
- [x] Run `npm run test:e2e` → FAIL; implement; run → PASS.
- [x] After a successful `ok`, store the plate in the pending state so it shows in « En attente de GitHub ».

### Task 3: layout

**Files:** Modify `panel/style.css` (`.you-what { flex: 1 1 auto }` at ≥700px), bump `style.css?v=`.

- [x] Screenshots before/after, desktop + mobile, light + dark.
