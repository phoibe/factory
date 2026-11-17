# Production gap (issue #369) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Under the project name, show whether the live site is up to date (« En ligne : à jour », « N modifications d'écart », « publication en cours… », failure in orange, « version inconnue ») and list the gap on tap.

**Architecture:** A pure module `panel/production.mjs` turns GitHub data (live deployments and their statuses, the compare between the live commit and the validated branch, recently merged PRs) into a gap state. `panel/app.mjs` fetches that data with `cachedGet` (ETags, at most once a minute) and draws a button on the `#project-sub` line that opens a dialog with the list.

**Tech Stack:** browser ES modules, `node --test`, Playwright e2e against the fake GitHub of `e2e/fixture.mjs`.

**Spec:** issue #369, comment `<!-- factory-spec -->` (saved to `docs/specs/` in this PR).

## Global Constraints
- Live = the newest live deployment (environment `isLiveEnv`: Production…, github-pages) with a `success` status. Never « the site answers ».
- External production mode, or a site address without any live deployment (silent host) → « En ligne : version inconnue » (grey) with an explanation.
- No site and no live deployment → nothing shown.
- Validated branch: `preprod` in « sur accord » mode (when it exists), else the default branch.
- Gap items: merged PRs of that branch whose merge commit is not in the live commit, oldest first: title, merge date, link to the request (`Closes #n`, else the PR).
- A PR undone by a factory revert (`claude/revert-pr-<n>`, live) reappears in the gap until the PR closing its redo issue (`<!-- factory-revert-redo #r -->`) is merged.
- Copy: « En ligne : à jour », « En ligne : 1 modification d'écart », « En ligne : N modifications d'écart », « En ligne : publication en cours… », « … · la dernière publication a échoué » (orange), « En ligne : version inconnue ». Vouvoiement, DESIGN.md colours only.
- Nothing changes in the project list.

## Review Focus
- GitHub errors / rate limit while reading deployments → « version inconnue », never a crash or a stale « à jour ». (test in Task 1)
- A newer deployment still running after a successful one → « publication en cours… » with the gap of the successful one. (Task 1)
- A failed newest deployment with an empty gap → « à jour », no orange. (Task 1)
- Commits pushed without PR (sync chores) are not counted. (Task 1)
- Phone: the line stays visible although `#project-sub`'s text is hidden. (Task 2 e2e)

---

### Task 1: gap logic (`panel/production.mjs`)

**Files:** Create `panel/production.mjs`; Test `test/panel-production.test.mjs`.

**Produces:**
- `isLiveEnv(env) -> boolean` (same rule as scripts/relay.mjs).
- `deploymentState(deployments, statusesById) -> { liveSha: string|null, latest: 'success'|'pending'|'failure'|null }`.
- `gapItems(pulls, aheadShas: Set<string>) -> Array<{ number, issue, title, mergedAt }>` (revert rule included).
- `gapView({ mode, hasSite, deployments, statusesById, aheadShas, pulls, error }) -> { kind: 'none'|'unknown'|'deploying'|'failed'|'gap'|'ok', text, items, why? }`.

- [ ] Write failing tests for each Review Focus line and each copy string; run `npm test`, see them fail.
- [ ] Implement; run `npm test`, green. Commit.

### Task 2: panel wiring (`panel/app.mjs`, `index.html`, `style.css`) + e2e

**Files:** Modify `panel/index.html` (`#project-sub` gets `#project-sub-text` + `#prod-gap` button, new `#gap-dialog`), `panel/app.mjs` (`refreshGap()` called from `refresh()` and on project load, `drawGap()`), `panel/style.css`; extend `e2e/fixture.mjs` with `deploy: { deployments, statuses, compare, pulls }`; Create `e2e/production-gap.e2e.mjs`, one test per acceptance criterion.

- [ ] Write the e2e journeys; run `npm run test:e2e`, see them fail.
- [ ] Wire; run e2e, green. Commit.
