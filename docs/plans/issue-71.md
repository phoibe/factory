# Auto-pick of existing issues (#71)

**Goal:** when `autoPick` is on, slots are free and the queue is empty, the factory starts existing open issues by itself.

**Spec:** issue #71, comment `factory-spec` (version 1).

## Tasks
1. `scripts/lib/pick.mjs`: `isPickable(labels)` and `pickOrder(issues)` (urgent first, then bugs, then rest, oldest first; skips question/project/release, state labels, `factory:no-pick`, PRs).
2. Config: `autoPick` boolean (default false) in defaults, schema and `config-core.mjs`.
3. Labels: `factory:no-pick`, `factory:urgent`, `factory:auto-picked`.
4. Relay: at the end of `dequeue`, `autoPick()` fills free slots (only when the queue is empty; picks still waiting for the owner count as taken slots) and comments on the card.
5. Panel: switch next to « Features en parallèle », badge on cards, tick dispatch when switched on.
6. Verify: typecheck, lint, test, build, a11y.
