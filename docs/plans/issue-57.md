# Issue 57 — panel aligned on the validated design

**Goal:** Geist fonts shipped with the panel, mono numbers, keyboard tabs, a11y check on 4 screens x 2 themes, « vous » everywhere the owner reads.

**Spec:** comment `<!-- factory-spec -->` on issue #57.

### Task 1: helpers (TDD)
- Test: `test/panel-a11y-helpers.test.mjs` (`splitNumbers`, `nextTabIndex`, font policy).
- Create `panel/numbers.mjs` (`splitNumbers`, `monoNumbers`, `watchNumbers`), `panel/tabs.mjs` (`nextTabIndex`, `setupTabs`).

### Task 2: fonts and styles
- `panel/fonts/*` (OFL, no external service), `@font-face` + `--mono` in `panel/style.css`, `font-src 'self'` in the CSP, build check of CSS `url()`.

### Task 3: a11y coverage
- `a11y/panel.a11y.mjs`: fake GitHub via Playwright routes, Connexion/Suivi/Règles/Discussion x light/dark. Fix: rules form wrapped in a valid tabpanel.

### Task 4: vouvoiement
- Owner-facing texts in `scripts/`, `outils/`, `.github/`, `agent/stages`, `server/chat`; guard test `test/vouvoiement.test.mjs`.
