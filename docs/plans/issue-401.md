# Split the relay engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** split `scripts/relay.mjs` (≈2 500 lines, one `createRelay` closure) into parts with one job each, with no behaviour change.

**Architecture:** `createRelay` builds a shared context `ctx` (`gh, repo, config, env, fetchImpl, now, log, sleep`) and
composes five parts, each `export function <name>Part(ctx)` returning its functions, merged into `ctx` in order.
Functions of one part call another part's through lazy wrappers (`const dequeue = (...a) => ctx.dequeue(...a)`), so the
moved code stays verbatim. The move is done by a one-off generator (not committed) so no line is retyped by hand.

**Tech Stack:** Node ≥ 22 ES modules, `node --test`, no dependency.

**Spec:** issue #401, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- No behaviour change: same messages, labels, delays, relaunches.
- Existing tests stay and keep checking the same things; all must pass.
- Entry point unchanged: `node scripts/relay.mjs <command>` and every export of `scripts/relay.mjs` kept.
- A real defect found on the way becomes a separate issue, not a fix here.

## Review Focus

1. A closure name used by a part but defined in another part not wired → `ReferenceError` only at runtime on a rare path. Test: every identifier referenced by a part resolves (static check in `test/relay-parts.test.mjs`).
2. The mutable queue counter (`dequeues`) shared by `dequeue` and `refilling` → must stay one shared counter (`ctx.dequeues`).
3. `ROOT` moves one folder deeper → `syncFingerprint(ROOT)` and `packs/catalog.json` must still resolve to the repo root.
4. Source-reading tests (vouvoiement) must scan the new files too, else they silently check less.
5. Workflows check out the factory into `.factory-src` and run `scripts/relay.mjs`: the new folder must be inside the checkout (it is: full checkout, no sparse paths).

---

### Task 1: Move the code into parts

**Files:** Create `scripts/relay/shared.mjs` (module-level constants/helpers), `state.mjs` (outputs, caches, in-flight count, locks),
`launches.mjs` (launch, relaunch, queue, auto-pick), `delivery.mjs` (merge, production, live checks, rollback, redo, version tag, stack sheet),
`watch.mjs` (conflicts, closing/reopening, heal, rate-limit/outage retries, label repair, idle relaunch, stale locks, waiting notices),
`events.mjs` (`eventFromPayload`, `handle`, `handleEvent`, `report`, previews, captures, `release`, retry helpers).
Modify `scripts/relay.mjs` (imports, `createRelay` composition, CLI `main`, re-exports). Modify `test/vouvoiement.test.mjs` to scan the new files.
Test: `test/relay-parts.test.mjs`.

- [ ] Failing test: each part file exists and exports its `…Part` function; `relay.mjs` < 500 lines and every part < 1 000; every free identifier of each part is defined (static scan); `createRelay` returns the same keys as before.
- [ ] Run `npm test` → red. Generate the parts. Run `npm test` → all green. Commit.

### Tasks 2–5: Tests per part (one task per part: launches, delivery, watch, events)

**Files:** `test/relay-launches.test.mjs`, `test/relay-delivery.test.mjs`, `test/relay-watch.test.mjs`, `test/relay-events.test.mjs`.
Each drives its part through `createRelay` with a small fake `gh` (pattern of `test/relay.test.mjs`) and covers 3–5 behaviours
of that part, named in plain words. They pin today's behaviour (they pass on the moved code); no production code changes.
- [ ] Write the tests, run `npm test` → green, commit.
