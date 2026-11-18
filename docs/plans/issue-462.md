# « Amélioration UI » button Implementation Plan

> **For agentic workers:** executed inline (medium request) with superpowers:executing-plans.

**Goal:** a board button « Amélioration UI » opens a `factory:ui-polish` card that the factory builds at once with a new `ui-polish` stage: up to 3 rounds of full design critique + fixes on every screen, then before/after screenshots.

**Architecture:** mirror the « Review générale » (`factory:audit`) path: a new label routed like audit by the relay (no questions, no spec, queued when full), a new agent stage file, the journal lock expecting `impeccable`, and the panel button in the same « Plus » group.

**Tech Stack:** plain JS modules, `node --test`, Playwright e2e.

**Spec:** issue #462, comment `<!-- factory-spec -->` version 1.

## Global Constraints
- Button text « Amélioration UI », confirm « Lancer une amélioration de l'interface ? », card kind « Amélioration UI ».
- 3 rounds at most, stop early when a critique finds nothing. UI only; functional gaps become ideas. DESIGN.md changes allowed but flagged at the top of the PR. No screens → stop with a clear message.

## Review Focus
- A `factory:ui-polish` card opened while the factory is full must be queued, then started with stage `ui-polish` (not `build`).
- Auto-pick must never pick a `factory:ui-polish` card (it is the owner's explicit request, started on opening).
- Cancel on the confirm creates nothing.
- The phone « Plus » menu keeps the same items, new one right after « Review générale ».
- The journal lock must refuse a `ui-polish` PR without the `impeccable` skill.

---

### Task 1: relay routing
**Files:** `scripts/lib/labels.mjs`, `scripts/lib/decide.mjs`, `scripts/lib/run-title.mjs`, `scripts/relay/launches.mjs`; tests `test/decide.test.mjs`, `test/labels-setup.test.mjs`.
- `L.uiPolish = 'factory:ui-polish'`, a LABEL_DEFS entry, `buildStage` returns `'ui-polish'`.
- decide: treated like `L.audit` in `isFactoryIssue`, `startIssue` (fire `ui-polish` with `building`, or queue), the `starting` list.
- run title `'ui-polish': 'Amélioration UI'`; autoPick SKIP includes `L.uiPolish`.
- Tests: opened `factory:ui-polish` → fire stage `ui-polish` + add building; full → queue; `buildStage([L.uiPolish]) === 'ui-polish'`.

### Task 2: agent stage + journal lock
**Files:** `agent/stages/ui-polish.md` (new), `agent/AGENT.md`, `agent/scripts/journal-check.mjs` (`GATED` + `ui-polish`), `agent/scripts/fabrication.mjs` (expectations: `impeccable`; stage name; note list); tests `test/journal-check.test.mjs` / `test/fabrication.test.mjs`.
- Test: `expectations('ui-polish', {}, false)` deep-equals `[{ skill: 'impeccable', label: 'passe design' }]`; `GATED` includes `ui-polish`.

### Task 3: panel
**Files:** `panel/index.html` (button `#ui-polish` with `data-menu` after `#general-review`), `panel/app.mjs` (`startUiPolish`, card kind), `panel/live.mjs` + `panel/eta.mjs` (no questions/spec steps); tests `test/panel-live.test.mjs`, new `e2e/ui-polish.e2e.mjs`; update menu order in `e2e/agent-tab.e2e.mjs`, `e2e/framing-button.e2e.mjs`, `e2e/stack.e2e.mjs`.
- e2e: button visible next to « Review générale »; dismissing the confirm creates nothing; accepting creates an issue titled « Amélioration UI de l'appli » labeled `['factory:ui-polish']`; a card with that label shows « Amélioration UI ».
