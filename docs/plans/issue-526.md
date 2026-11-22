# Issue 526 - glossary and decisions for projects that lack them

**Goal:** every project gets a glossary and a decision record, created once from what already exists, then kept up to date.

**Architecture:** agent instructions only (stages rendered by `scripts/sync.mjs`). The existing docs PR
(`claude/docs-<n>`, merged alone by the relay when it only touches `GLOSSARY.md` / `docs/adr/`) carries the catch-up.

**Spec:** issue #526, `<!-- factory-spec -->` version 1.

## Global constraints
- Documents in French, no technical detail.
- Not for the factory itself (payload `repo` == `factory`), nor a project with neither `PRODUCT.md` nor a delivered spec.
- Only clear refusals (owner said no, or dropped an idea with a reason).

## Tasks

### Task 1: load the two skills directly (test first)
- `test/sync.test.mjs`: rendered `docs.md` says to load `grilling` and `domain-modeling` with the Skill tool, and no longer says to load `grill-with-docs` (it has `disable-model-invocation: true`, refused to the agent).
- `agent/stages/docs.md` « Pendant les questions »: load `grilling` then `domain-modeling`; note the owner's refusals in `docs/adr/` as soon as he says them.

### Task 2: one-off catch-up section
- Test: `docs.md` has a « Rattrapage » section (no `GLOSSARY.md`, branch `claude/docs-<n>`, clear refusals only, not the factory itself); `build.md`, `grilling.md` and `bugfix.md` point to it.
- `agent/stages/docs.md`: section « Rattrapage (projet sans glossaire) »: conditions, sources (PRODUCT.md, DESIGN.md, docs/specs, issues open/closed/not_planned and their threads), output, docs PR, skip when an open docs PR already brings `GLOSSARY.md`; retried next pass if it failed.
- `agent/stages/build.md`, `grilling.md`, `bugfix.md`: an early step pointing to the catch-up when `grill-with-docs` is installed.
- Run `node scripts/sync.mjs` equivalent so `.factory/` matches (it is regenerated: check how the repo syncs itself).

## Review focus
- A docs PR already open but not merged: no second catch-up (skip rule).
- Factory repo itself: never catches up.
- Project without `grill-with-docs`: nothing changes.
