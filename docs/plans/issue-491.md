# Fewer GitHub reads in the relay — Implementation Plan

> Executed inline (executing-plans), medium request.

**Goal:** the relay counts its GitHub reads per run, and repeated reads within a run stop counting against GitHub's hourly limit, without ever reading stale data.

**Architecture:** everything goes through `scripts/lib/github.mjs` (`send`). Each GET answer keeps its `ETag`; the same URL read again in the same run sends `If-None-Match`, and GitHub's `304` (not counted in the limit) returns the body already read. A write never uses the cache, and every read still asks GitHub, so a decision always sees the current state. A usage tally (counted reads per route, free `304`s, writes, last `x-ratelimit-remaining`/`limit`) is printed at the end of each relay run.

**Tech Stack:** Node 22, `node --test`, no dependency.

**Spec:** issue #491, comment `<!-- factory-spec -->` (stored in `docs/specs/491-*.md`).

## Global Constraints
- Same decisions, messages and timings: only the number of counted reads changes.
- A read a decision depends on is always fresh (a conditional request is answered by GitHub with its current state).
- The panel is not touched; the 5-minute tick rhythm is not touched.

## Review Focus
- A changed resource between two reads in a run → the new body is returned (200), never the cached one.
- A `304` with no cached body (should not happen) → treated as an error-free re-read without `If-None-Match`.
- Paginated reads → each page has its own ETag; a changed page count is followed through `Link`.
- Different `accept` headers on the same URL (`full+json`) → separate cache entries.
- 404 answers → still `null`, not cached as a body.

---

### Task 1: ETag cache and usage tally in the GitHub client
**Files:** Modify `scripts/lib/github.mjs`; Test `test/github.test.mjs`
**Produces:** `gh.usage()` → `{ reads, free, writes, routes: {route: count}, remaining, limit }`; `formatUsage(usage) -> string` exported from `scripts/lib/github-usage.mjs`.
- [ ] Failing tests: second GET of same URL sends `if-none-match` and a `304` returns the first body; a changed body (200) is returned; usage counts 1 read + 1 free; writes counted; `remaining` from headers; route normalised (`/repos/{repo}/issues/:n/comments`).
- [ ] Implement in `send`/`request`/`paginate`.
- [ ] Tests pass; commit.

### Task 2: Print the tally at the end of each relay run
**Files:** Modify `scripts/relay.mjs` (main, in a `finally`); Test `test/github.test.mjs` (`formatUsage`).
- [ ] Failing test on `formatUsage` text (counted reads, free answers, writes, remaining reserve, top routes).
- [ ] Implement; commit.

### Task 3: Reads per typical passage, pinned by the rehearsal
**Files:** Modify `test/sim/world.mjs` (`spy` option wrapping each relay run's client); Create `test/github-reads.test.mjs`.
- [ ] A spy models the run cache (a read whose answer is unchanged since the same read in the same run is free) and counts calls; scenarios: idle tick, owner message, tick with a PR waiting. Assert counted reads are well below raw calls and below a fixed budget per passage (measured numbers, so a later rise fails).
- [ ] Commit.
