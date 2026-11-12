# Settings: fold technical settings under « Avancé » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** The « Paramètres » tab shows only the everyday choices; everything technical lives in one « Avancé » block, folded by default.

**Architecture:** A small pure module `panel/settings.mjs` computes the folded summary line and the alert rule; `renderRules()` in `panel/app.mjs` reorders the fieldsets and wraps the technical ones in a `<details class="advanced">`, whose open state is kept in `localStorage`.

**Tech Stack:** vanilla JS modules, `node --test`, Playwright e2e.

**Spec:** issue #342, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- No setting added, removed or renamed; no value changes. « En attente de vos réponses, au plus » keeps its name and place.
- Visible order: Mise en production, Site en ligne, Étapes (all 9), Fonctionnalités construites en même temps, Prendre une demande… (+ its sub-setting).
- « Avancé » at the bottom: machine (project + default for all projects), moteur des agents, contrôles automatiques + durée, contrôles supplémentaires, every savoir-faire.
- Folded by default; open state remembered per device.
- One « Enregistrer » button, saves changes made inside « Avancé » even when folded.
- A machine alert (tone `warn`) shows above « Avancé », even folded; nothing when all is fine.
- Colours/fonts only from `DESIGN.md`; French, vouvoiement.

## Review Focus

- Re-render after any change (renderRules rebuilds the form): « Avancé » must not fold back by itself → e2e "je change un réglage dans Avancé…".
- Public project / GitHub machine: summary says « Machines GitHub » → unit test.
- No savoir-faire on / one on: « aucun savoir-faire activé » / « 1 savoir-faire activé » → unit test.
- localStorage unavailable: folded, no crash (store wrapper already try/catch).
- Warning not duplicated inside the fold when shown above it → e2e alert test.

---

### Task 1: `panel/settings.mjs`

**Files:** Create `panel/settings.mjs`; Test `test/panel-settings.test.mjs`.

**Interfaces — Produces:**
- `advancedSummary({ machine: string, checksOn: number, checksTotal: number, packsOn: number }) -> string`
  e.g. `'Serveur de dev · 7 contrôles sur 7 · 3 savoir-faire activés'`; `packsOn` 0 → `aucun savoir-faire activé`, 1 → `1 savoir-faire activé`; `checksOn` ≤ 1 → `1 contrôle sur 7` / `0 contrôle sur 7`.
- `effectiveMachine({ isPrivate, project, general }) -> 'dev-server' | 'github'` (public → github; `default` → general).
- `ADVANCED_KEY = 'factory.advanced'`.

- [ ] Write failing tests with those values, run `npm test`, see FAIL.
- [ ] Implement, run `npm test`, see PASS. Commit.

### Task 2: reorganise `renderRules()`

**Files:** Modify `panel/app.mjs` (`renderRules`, `machineFieldset`), `panel/style.css`; Test `e2e/advanced-settings.e2e.mjs`; adapt `e2e/machine.e2e.mjs`, `e2e/checks-minutes.e2e.mjs`, `e2e/extra-checks.e2e.mjs` to open « Avancé » first.

- Split the « Moteur des agents » fieldset: runner radios stay in it (inside Avancé); maxParallel + autoPick/maxQuestions go to a visible fieldset « Demandes en parallèle ».
- `machineFieldset(update, { alertOutside })` omits its status line when the alert is shown above.
- `<details class="advanced" id="advanced">` with `<summary>` « Avancé » + `<span class="advanced-summary muted">`; `ontoggle` stores `'open'`/deletes `ADVANCED_KEY`; initial `open` from storage.
- Inside: project technical fieldsets, then an `h3` region « Tous les projets » with the default machine.
- e2e tests (French names from the spec checklist): folded by default with its summary; name/place of « En attente de vos réponses, au plus »; open shows machine, engine, checks, savoir-faire; change inside, fold, save → saved; left open, reload → still open; alert above when the dev server is offline.
- [ ] Write e2e, run `npm run test:e2e`, see FAIL. Implement, PASS. Commit.
