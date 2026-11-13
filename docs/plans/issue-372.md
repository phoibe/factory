# Version tag (issue #372) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Projects in external production (Pulsar Wheel) or on a host that tells GitHub nothing (yoldmewhen2) show their production gap too, read from a version tag the site publishes itself.

**Architecture:** The site publishes its commit as `<meta name="factory-version" content="<sha>">` on its home page (or a `factory-version.txt` file at its root). The panel cannot read another site (CSP, CORS), so the relay reads it on every tick, server side, and points the hidden ref `refs/factory/live` at that commit (deleted when the tag cannot be read). The panel reads that ref with the GitHub API and computes the gap exactly as #369 does. A project concerned without tag gets, once, a card « Ajouter l'étiquette de version au site » (like the stack sheet card).

**Tech Stack:** Node.js ES modules, `node --test`, Playwright e2e against `e2e/fixture.mjs`.

**Spec:** issue #372 (saved to `docs/specs/` in this PR); builds on `docs/specs/369-*.md`.

## Global Constraints
- Only the tag says what is live: never « the site answers ».
- No tag, or tag unreadable → « En ligne : version inconnue » (grey), with a sentence on tap.
- Copy as in #369: « En ligne : à jour », « En ligne : 1 modification d'écart », « En ligne : N modifications d'écart ». No button.
- A tag older than the validated branch → the missing merged PRs form the gap.
- Concerned project = external mode with a site, or a site address and no live deployment. Nothing for projects without a site.
- No new label, no new service, no new permission.

## Review Focus
- A short sha (7 chars) in the tag → resolved to the full commit through GitHub. (Task 1)
- A tag naming a commit unknown to the repository → treated as unreadable, ref removed. (Task 1)
- The site down / timing out → ref removed, never a stale « à jour »; fetch bounded by a timeout. (Task 1)
- The card is opened only once, even after it was closed (state ref `version-tag`). (Task 1)
- Ref missing (404) in the panel → « version inconnue » with the tag explanation, not the GitHub-error one. (Task 2)

---

### Task 1: relay reads the tag (`scripts/lib/version-tag.mjs`, `scripts/relay.mjs`, `scripts/lib/github.mjs`)

**Produces:**
- `parseVersionTag(text) -> string|null` (meta tag in either attribute order, or a bare 7–40 hex sha).
- `tagConcerned({ mode, site, liveEnvs }) -> boolean`.
- gh: `resolveCommit(ref)`, `getLiveRef()`, `setLiveRef(sha|null)`.
- relay `syncVersionTag()` in `heal()`: reads site (10 s timeout), resolves, moves/deletes `refs/factory/live`; opens the card once when no tag and the project is framed.

- [ ] Failing tests in `test/version-tag.test.mjs` and `test/relay.test.mjs`; `npm test` red.
- [ ] Implement; `npm test` green; commit.

### Task 2: panel reads the ref (`panel/production.mjs`, `panel/app.mjs`) + e2e

- `gapView({ ..., tagSha })`: for a concerned project, `tagSha` stands for the live commit (latest = success); `undefined/null` → unknown with the tag sentence.
- `readGap`: concerned project → `cachedGet('/repos/<r>/git/ref/factory/live')`, 404 → null.
- [ ] Failing unit tests (`test/panel-production.test.mjs`) and e2e (`e2e/version-tag.e2e.mjs`, one test per acceptance criterion); red.
- [ ] Implement; green; commit.
