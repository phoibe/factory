# Archived specs (spec rangée) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** every validated spec of a feature or bug is saved as `docs/specs/<n>-<slug>.md` in its project, in the feature's own PR, with an auto-maintained summary `docs/specs/README.md`.

**Architecture:** one dependency-free script `agent/scripts/specs.mjs`, copied into each project as `.factory/scripts/specs.mjs` by `scripts/sync.mjs`. Commands: `save <n>` (reads the issue and its latest `<!-- factory-spec -->` comment via `gh api`, writes the file, rebuilds the summary), `index` (rebuilds the summary from the files), `modified <old> <new>` (adds the « Modifiée par » line to an older spec, rebuilds the summary). Stage texts (`build.md`, `bugfix.md`, `acceptance-fix.md`, `feedback.md`) tell the agent when to run it. `journal-check.mjs` lists a missing spec on a `build` branch so it is never forgotten.

**Tech Stack:** Node ≥22 ES modules, `node --test`.

**Spec:** issue #359, comment `<!-- factory-spec -->` version 1.

## Global Constraints
- Folder `docs/specs/`, next to `docs/adr/` and `docs/plans/`; one file per request, named number then title.
- File starts with a link to the request and the date; only the last validated version (no history).
- Older spec is never rewritten: a line « Modifiée par la demande n° … » with a link is added at its top.
- Features and bugs only (each slice its own); not framing (`factory:project`) nor audits.
- No backfill of past requests; no panel change.
- Documents in French; summary columns: numéro, titre, une phrase, date.

## Review Focus
- Spec comment with factory footers and the trailing « Répondez « go » … » line: stripped from the saved document.
- Title with accents, slashes or quotes: slug stays ASCII, file name valid.
- Saving twice (spec changed during acceptance): same file overwritten, not a second file; « Modifiée par » lines kept.
- `modified` run twice: the line is not duplicated.
- Issue without any spec comment: `save` fails with a clear French message, writes nothing.

---

### Task 1: `agent/scripts/specs.mjs` (pure functions + CLI)
**Files:** Create `agent/scripts/specs.mjs`; Test `test/specs.test.mjs`
**Produces:** `slug(title) -> string`, `specFileName(n, title) -> '<n>-<slug>.md'`, `latestSpec(comments) -> {body, created_at} | null`, `cleanSpec(body) -> string`, `renderSpec({repo, n, title, body, date, modifiedBy=[]}) -> string`, `parseSpec(text) -> {n, title, summary, date, modifiedBy:number[]}`, `addModifiedBy(text, repo, newN) -> string`, `renderIndex(entries) -> string`.
- [ ] Tests first (names in French), run `npm test`, see them fail; implement; pass.

### Task 2: install in projects
**Files:** Modify `scripts/sync.mjs` (copy list), `test/sync.test.mjs`.

### Task 3: never forgotten
**Files:** Modify `agent/scripts/journal-check.mjs` (on stage `build`, no `docs/specs/*.md` besides README in branch files → line « spec rangée : lance `node .factory/scripts/specs.mjs save <n>` »), `test/journal-check.test.mjs`.

### Task 4: stage texts + this repo's own spec
**Files:** Modify `agent/stages/build.md`, `bugfix.md`, `acceptance-fix.md`, `feedback.md`, `agent/AGENT.md` (mention), `PRODUCT.md` if it lists project documents; run `node scripts/sync.mjs .` to regenerate `.factory/`; save `docs/specs/359-…md` with the new script.
