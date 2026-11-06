# Max auto-picked features in questions — Implementation Plan

> **For agentic workers:** executed inline (executing-plans). Steps use checkbox syntax.

**Goal:** New setting `maxQuestions` (default 2, 1–10) replacing the hard-coded limit of 1 auto-picked feature waiting for the owner.

**Architecture:** The setting lives in `factory.config.json` (defaults, schema, `resolveConfig`), is edited in the panel "Règles" tab right under "Piocher dans les fiches existantes", and is read by `autoPick()` in the relay.

**Tech Stack:** plain JS modules, `node --test`.

**Spec:** issue #194, comment `<!-- factory-spec -->` (version 1).

## Global Constraints
- Label: « Features en questions en même temps ». Help: « Features que la factory prend d'elle-même et qui attendent vos réponses. Celles sur lesquelles vous écrivez vous-même démarrent toujours tout de suite. »
- Range 1–10, default 2 for every project that has not set it.
- Counted: auto-picked features with `factory:grilling` or `factory:spec-review`. Owner-started features never count.
- A waiting auto-picked feature still holds a « Features en parallèle » slot (unchanged).
- Lowering the value interrupts nothing; picking resumes once below the limit.

## Review Focus
- Invalid value in the file (0, "2", 11): warning, default 2 used. Values >10 rejected too, as the panel caps at 10.
- Config object without `maxQuestions` (old resolved config / tests): relay falls back to 2.
- Bugs keep being picked when the feature limit is reached.
- Two features picked in the same tick must respect the limit (counter decremented per picked feature).
- Value lowered below the current count: no new feature, nothing stopped.

### Task 1: config `maxQuestions`
**Files:** `defaults/factory.config.json`, `schema/factory.config.schema.json`, `scripts/lib/config-core.mjs`, `test/config.test.mjs`
- [ ] Test `maxQuestions defaults to 2 and only an integer from 1 to 10 is kept` (undefined → 2; 3 → 3; 0, 11, "2" → 2 + one warning each).
- [ ] Run `npm test`, see it fail.
- [ ] Add `"maxQuestions": 2` to defaults, schema entry (integer 1–10), resolution in `resolveConfig`.
- [ ] Run `npm test`, pass.

### Task 2: relay uses the limit
**Files:** `scripts/relay.mjs` (`autoPick`), `test/relay.test.mjs`
- [ ] Tests: with `maxQuestions: 2` and one waiting picked feature, one more feature is picked; with two waiting, none (bugs still are); two features picked in one tick when limit 2 and none waiting; limit 1 reproduces today's behavior (existing tests pinned with `maxQuestions: 1`); limit lowered below count picks no feature.
- [ ] Run, see fail.
- [ ] Replace `stopFeatures` boolean with `featureRoom = (config.maxQuestions ?? 2) - waitingList.length`, decremented per picked feature.
- [ ] Run, pass.

### Task 3: panel + docs
**Files:** `panel/app.mjs` (rules tab), `docs/design.md`
- [ ] Number input `id="maxQuestions"` min 1 max 10, label and help above, placed right after the autoPick row; onchange keeps only integers 1–10.
- [ ] Update the autoPick paragraph of `docs/design.md`.
- [ ] `npm run typecheck && npm run lint && npm test && npm run build && npm run test:a11y`.
