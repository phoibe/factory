# Auto-pick existing issues — Implementation Plan

**Goal:** when slots are free and the queue is empty, the relay starts existing issues by itself, behind a setting (off by default).

**Spec:** issue #71, comment `<!-- factory-spec -->`.

## Global Constraints
- Setting `autoPick` (boolean, default false) in factory.config.json; panel switch next to "Features en parallèle".
- Labels created by the factory: `factory:no-pick` (never picked), `factory:urgent` (first), `factory:auto-picked` (board mention).
- Never pick question/project/release/audit issues, nor issues already grilling, spec-review, queued, building, blocked, running, pending.
- Order: urgent, then bugs, then rest; oldest first. No reserved slot. Comment on the picked issue.

## Review Focus
- Setting off: nothing is picked. Full factory: nothing is picked.
- A picked feature waiting for the owner's answers must not trigger more picks (no flood of questions).
- Queue first: queued issues start before any pick.

### Task 1: config + labels
- Modify `scripts/lib/config-core.mjs`, `defaults/factory.config.json`, `schema/...`, `scripts/lib/labels.mjs`; test in `test/config.test.mjs`.
### Task 2: relay `autoPick()` called at the end of `dequeue()`
- Modify `scripts/relay.mjs`, test in `test/relay.test.mjs`.
### Task 3: panel switch and board mention
- Modify `panel/app.mjs`, `docs/design.md`.
