# Design layouts (« Mises en page ») Implementation Plan

> Executed inline (medium request, `executing-plans`).

**Goal:** every project's `DESIGN.md` describes, beside its theme, the layout of each screen type; builds and the
design pass keep it current; a project framed from another project's design copies theme and layouts; existing
projects get one automatic card that writes the section.

**Architecture:** the rule lives in agent instructions (`agent/stages/*.md`, synced into projects); one shared
definition in `design-pass.md` (`## Mises en page`). A new `factory:layouts` card type (like `factory:stack`) is
opened once per project by the relay (`ensureDesignLayouts`, next to `ensureStackSheet`) and starts at once with the
new `layouts` stage. The factory's own `DESIGN.md` gets its section in this PR.

**Tech Stack:** Node.js ESM, `node --test`.

**Spec:** issue #509, last `<!-- factory-spec -->` comment (saved to `docs/specs/` by `specs.mjs save 509`).

## Global Constraints
- Section title in DESIGN.md: `## Mises en page`; one `###` per screen type; fixed grid: disposition générale,
  sommaire ou navigation, largeur, libellés et explications, volets repliables, sur téléphone, écrans concernés.
- No drawings or screenshots in the document. Empty section (« Aucun écran pour l'instant. ») when no screen exists.
- Card title « Décrire les mises en page des écrans », opened once per project (marker in body, any state), never
  during framing, only when DESIGN.md exists without the section and the synced `.factory/stages/layouts.md` exists.
- PR line when the design pass completes the doc: « Mise en page ajoutée au design : … ».

## Review Focus
- Project without DESIGN.md (not framed / no UI): no card.
- DESIGN.md already has `## Mises en page` (any case/numbering like `## 9. Mises en page`): no card.
- Card already opened then closed/abandoned: never reopened.
- Project still in framing (open `factory:project` issue): no card.
- Factory full: the card queues like a stack card and starts with stage `layouts` when a place frees.

### Task 1: label + stage routing
**Files:** `scripts/lib/labels.mjs`, `scripts/lib/decide.mjs`, `scripts/relay/launches.mjs`, `scripts/lib/run-title.mjs`,
`panel/live.mjs`, `panel/eta.mjs`, `panel/app.mjs`, `panel/trigger.mjs`; tests `test/labels-setup.test.mjs`, `test/decide.test.mjs`.
- `L.layouts = 'factory:layouts'`, LABEL_DEFS entry, `buildStage([L.layouts]) === 'layouts'`.
- decide: opened `factory:layouts` issue → fire `layouts` with `factory:building` (queue when full).
- autoPick skips it; run title « Mises en page du design »; panel treats it like `factory:stack` (no questions).

### Task 2: relay opens the card
**Files:** `scripts/relay/delivery.mjs` (`ensureDesignLayouts`), `scripts/relay/watch.mjs`; test in `test/relay.test.mjs`.
- `hasLayoutsSection(text) -> boolean` exported (regex `^##\s+(\d+\.\s*)?Mises en page\b`, multiline, case-insensitive).
- Opens `createIssue('Décrire les mises en page des écrans', body with AGENT_MARKER + LAYOUTS_MARKER, [L.layouts, L.kept])`
  then `handle(opened)`; guards from Global Constraints.

### Task 3: agent instructions
**Files:** `agent/stages/layouts.md` (new), `design-pass.md`, `build.md`, `foundation.md`, `framing.md`, `audit.md`,
`ui-polish.md`, `agent/AGENT.md`; test `test/design-layouts.test.mjs`.
- design-pass.md `## Mises en page` section (grid, rules, contradiction → fix the screen, late doc → complete + PR line).
- build.md step 6: new layout → add it; known layout → add the screen's name. foundation: section created (home page
  layout, adoption from existing screens, « design repris » copied). framing: option « Reprendre le design d'un de vos
  projets ». layouts.md: describe current screens, change only DESIGN.md.

### Task 4: the factory's own DESIGN.md
Add `## Mises en page` describing the panel's screen types (board, project list, chat/Agent tab, settings, dialogs).
