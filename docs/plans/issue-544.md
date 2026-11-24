# Models per role in the general settings (issue #544) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One factory-wide setting picks the model family of 4 roles (plans, code, review, simple tasks); the relay hands it to every agent run; a new « Réglages généraux » page of the panel edits it, together with the general machine moved out of the project's « Paramètres » tab.

**Architecture:** The choice lives in `settings.json` on the factory's `factory-runners` branch (next to `machine`, written by the panel). `scripts/lib/models.mjs` (pure, shared by relay and panel) holds the catalog of families with their current version, the roles, defaults and efforts, and `resolveModels(raw)`. The relay reads that file (public repo, project token) when it fires an agent and adds `models` to the payload; `AGENT.md` tells the agent to use it. A monthly script refreshes the catalog from Anthropic's public models page.

**Tech Stack:** Node 22 ESM, `node --test`, no-build vanilla panel, Playwright e2e.

**Spec:** issue #544, last `<!-- factory-spec -->` comment (saved to `docs/specs/` by task 5).

## Global Constraints

- Roles and defaults: `plan` → `fable`, `code` → `opus`, `review` → `fable`, `simple` → `sonnet`. Efforts: plan high, code medium, review high, simple low. Never `xhigh` nor `max`.
- Escalation on failure: simple → code → review.
- Family chosen, never a version. Unknown/disappeared family → the role's default.
- One setting for the whole factory, no per-project choice. No new dependency, no API key.
- Owner-facing text in French, vouvoiement; code and commits in English.

## Review Focus

- `settings.json` missing, unreadable, or without `models` (never saved) → defaults everywhere (relay test + panel e2e).
- Relay cannot read the factory branch (network error, 404) → the launch still happens, with default models (relay test).
- Saving the models must keep `machine` and runner `labels` already in `settings.json` (panel e2e checks the written body).
- A family removed from the catalog but still saved → shown and used as the role default (unit test).
- Unsaved changes on the general page then « ← Retour au projet » → not silently lost: the save bar stays the same as Paramètres' (dirty state).

---

### Task 1: models catalog and helpers (parallélisable)

**Files:** Create `scripts/lib/models.mjs`, `scripts/models.mjs`, `test/models.test.mjs`, `.github/workflows/models.yml`.

**Interfaces — Produces:**
- `MODEL_FAMILIES`: array between `// catalog:start` / `// catalog:end` markers, `[{ id: 'fable', name: 'Fable', version: '5.2' }, { id: 'opus', name: 'Opus', version: '5.5' }, { id: 'sonnet', name: 'Sonnet', version: '5.5' }, { id: 'haiku', name: 'Haiku', version: '5.5' }]`.
- `MODEL_ROLES`: `[{ id: 'plan', name: 'Plans et organisation', help, effort: 'high', default: 'fable' }, { id: 'code', name: 'Écriture du code', …, 'medium', 'opus' }, { id: 'review', name: 'Revue', …, 'high', 'fable' }, { id: 'simple', name: 'Tâches simples', …, 'low', 'sonnet' }]` (help texts from the spec, parcours 2).
- `resolveModels(raw, families = MODEL_FAMILIES)` → `{ plan: { model, effort }, code: …, review: …, simple: … }` from `raw` = parsed settings.json (or anything).
- `familyLabel(family)` → `'Fable (5.2 aujourd'hui)'`.
- `parseModelIds(html)` → `[{ id, version }]` latest per family from `claude-<family>-<major>[-<minor>]` ids; `updateCatalog(source, found)` → new source text of models.mjs (adds new families, bumps versions, never removes).

- [ ] Tests first (`node --test test/models.test.mjs` red): defaults on `null`, `{}`, `{models:'x'}`; saved `{models:{code:'sonnet'}}` honoured; unknown family `'gpt'` → default; labels; parseModelIds on a fixture string with `claude-opus-5-5`, `claude-opus-4-8`, `claude-mythos-1`, `claude-3-5-sonnet-20241022` (legacy ignored); updateCatalog adds `mythos`, keeps others.
- [ ] Implement; `scripts/models.mjs --latest` fetches `https://platform.claude.com/docs/en/about-claude/models/overview` (fallback `https://docs.anthropic.com/en/docs/about-claude/models/overview`), rewrites the catalog, exits 0 with "already up to date" when unchanged or unreachable.
- [ ] `models.yml`: monthly cron (`23 6 1 * *`) + dispatch, runs the script then `node --test`, opens PR « Mise à jour mensuelle des modèles » like `update-skills.yml`.
- [ ] Commit.

### Task 2: relay hands the models to each run (parallélisable)

**Files:** Modify `scripts/relay/launches.mjs` (fireAgent payload), Test `test/relay-models.test.mjs`.

**Interfaces — Consumes:** `resolveModels` (task 1; if task 1 is not merged yet, the implementer creates a temporary local import — no: this task is sequential after task 1). **Produces:** payload field `models` = `resolveModels(settings)`.

- [ ] Test red: a fake gh whose `request('GET', '/repos/phoibe/factory/contents/settings.json?ref=factory-runners')` returns base64 `{"machine":"github","models":{"code":"sonnet"}}` → fired payload has `models.code.model === 'sonnet'`, `models.plan.model === 'fable'`; request throwing → defaults, launch still happens.
- [ ] Implement `readFactoryModels(gh)` in launches.mjs, merged into payload; commit.

### Task 3: agent instructions use the roles (parallélisable)

**Files:** Modify `agent/AGENT.md` (grid section), `agent/stages/{build,bugfix,audit,ui-polish,design-pass,visual-fix,acceptance-fix,skills-fix,plan?}.md` wherever a model is named, `test/model-grid.test.mjs`, `test/subagents.test.mjs` if it asserts the old grid.

- [ ] Test red: AGENT.md has `**Modèles par rôle.**` with the 4 roles, defaults, efforts, `models` of the payload, escalation `tâches simples → code → revue`, « jamais `xhigh` ni `max` », and the pilot rule (plan and code always delegated, even for a small request). Each stage names a role (`rôle « code »`, `rôle « revue »`…) instead of `opus`/`sonnet`/`haiku`.
- [ ] Rewrite: grid table role | default | effort | tasks (same task split as today: final review, security review, audit synthesis → review; per-task reviews, design critique, building → code; searches, mechanical, screenshots → simple; plans and architecture → plan). Agent passes `model: <payload.models.<role>.model>` and `effort`. Build stage: small request → one `code` sub-agent writes it; medium → plan sub-agent writes the plan, one `code` sub-agent executes it; large unchanged.
- [ ] Commit.

### Task 4: « Réglages généraux » page in the panel (séquentielle, après la tâche 1)

**Files:** Modify `panel/index.html` (button `#general-open` « Réglages généraux » before « Se déconnecter », section `#general` hidden), `panel/app.mjs` (render/save, remove general machine from Avancé, add link), `panel/style.css` if needed, `.github/workflows/pages.yml` (copy `scripts/lib/models.mjs`), `e2e/fixture.mjs` and `a11y/*.a11y.mjs` EXTRA maps (`'/models.mjs'`), Create `e2e/general-settings.e2e.mjs`, Modify `e2e/machine.e2e.mjs`/`advanced-settings.e2e.mjs` if they test the moved block, `e2e/smoke-routes.txt` unchanged (no new route).

- [ ] e2e tests first (French names, one per spec check): « la barre du haut montre Réglages généraux avant Se déconnecter et le retour ramène au projet », « la page montre Fable, Opus, Fable, Sonnet par défaut avec leur version et la machine des tâches », « un modèle changé est enregistré dans les réglages et garde la machine », « l'onglet Paramètres n'a plus Tous les projets et son lien ouvre la page », « sur téléphone la page tient sur une colonne ».
- [ ] Implement: page replaces the project view (same fieldset/save-bar look as Paramètres), blocks « Modèles » (one `<select>` per role, options `familyLabel`, help line per role, then the routine explanation paragraph) and « Machine des tâches par défaut » (existing `generalMachineFieldset`). Save writes `{...fresh, machine, models}` to `settings.json` on `factory-runners` (same code path as today's machine save, runners workflow dispatched only if machine changed). Paramètres → Avancé: remove « Tous les projets », add link « Changer le réglage de tous les projets ».
- [ ] `DESIGN.md` « Mises en page »: add the general page (layout of the settings page, opened from the top bar) and the top bar button. Commit.

### Task 5: docs

- [ ] `node .factory/scripts/specs.mjs save 544`; mark ADR 0003 already superseded (done); README of factory untouched (factory itself).
