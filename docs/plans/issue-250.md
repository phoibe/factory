# Rename the « Règles » tab to « Paramètres » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The panel's third tab reads « Paramètres » instead of « Règles », and its save confirmation reads « Paramètres enregistrés. Ils s'appliquent dans une minute environ. »

**Architecture:** Copy-only change in the static panel. Internal ids (`tab-rules`, `rules-panel`, `#rules`, `renderRules`, `writeRules`) stay as they are, so behaviour and content do not change.

**Tech Stack:** Plain browser JS modules, Playwright journeys (`npm run test:e2e`), axe checks (`npm run test:a11y`).

**Spec:** issue #250, comment `<!-- factory-spec -->` version 1.

## Global Constraints

- Tab label: « Paramètres », third, after « Suivi » and « Discussion ».
- Toast: « Paramètres enregistrés. Ils s'appliquent dans une minute environ. » (exact).
- The word « Règles » no longer appears anywhere in the panel.
- Docs and agent instructions outside `panel/` are not touched.

## Review Focus

- Phone width (390 px): the longer label must stay on one line in the tab bar (checked in screenshots).
- The save confirmation must actually be readable: it must not sit under the sticky save bar (e2e journey in Task 2).
- The accessibility check must still reach the tab's extra checks under its new name (Task 1, `npm run test:a11y`).
- The other panel messages about the same settings say « paramètres », not « réglages » (Task 2).

---

### Task 1: Rename tab and toast

**Files:**
- Modify: `panel/index.html:63`, `panel/app.mjs:799`, `a11y/panel.a11y.mjs` (screen name `Règles` → `Paramètres`)
- Test: `e2e/settings-tab.e2e.mjs`

- [x] **Step 1:** Write journeys « le troisième onglet, après « Suivi » et « Discussion », s'appelle « Paramètres » », « après un enregistrement, je vois « Paramètres enregistrés. … » », « le mot « Règles » n'apparaît plus nulle part dans le panneau ».
- [x] **Step 2:** `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` → the 3 new journeys FAIL.
- [x] **Step 3:** Change the label, the toast text and the a11y screen name.
- [x] **Step 4:** `npm run test:e2e` and `npm run test:a11y` → PASS.
- [x] **Step 5:** Commit.

### Task 2: Design-pass fixes

**Files:**
- Modify: `panel/style.css` (`#toast` gets `z-index: 3`, above `.savebar`'s 1), `panel/app.mjs` (« réglages » → « paramètres » in the unreadable/vanished settings messages)
- Test: `e2e/settings-tab.e2e.mjs`

- [x] **Step 1:** Journey « sur téléphone, le message « Paramètres enregistrés » se lit en entier, au-dessus de la barre d'enregistrement »: at 390×844, three points of the toast resolve to the toast via `elementFromPoint`.
- [x] **Step 2:** Run it → FAIL (« part of the toast is covered »).
- [x] **Step 3:** Add the z-index; reword the two messages.
- [x] **Step 4:** Full suite (`test`, `test:e2e`, `test:a11y`, `typecheck`, `lint`, `build`) → PASS.
- [x] **Step 5:** Commit.
