# Fewer GitHub calls, and a pause instead of a failure on « too many requests » — Implementation Plan

> **For agentic workers:** executed inline with executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the relay and the panel ask GitHub less often for the same thing, and a rate-limit answer makes them wait and retry instead of dropping the event.

**Architecture:** one pure helper (`scripts/lib/ratelimit.mjs`) reads GitHub's rate-limit answer (429, or 403 with `retry-after` / `x-ratelimit-remaining: 0`) into a wait. The Node client pauses on short waits and throws `RateLimited` on long ones; the relay then marks its run with a dedicated failing step, and the next tick (every 5 min) re-runs those runs, replaying the same event. The panel uses the same helper, fetches card comments in parallel and skips cards that did not change.

**Tech Stack:** Node 22 ESM, `node --test`, browser ES modules, GitHub Actions.

**Spec:** issue #211, comment `<!-- factory-spec -->` version 1.

## Global Constraints

- No new dependency, no new service, no new secret.
- Nothing changes on screen: same cards, same states, same messages.
- Only the rate limit triggers the pause; 401/403 without rate-limit headers/404/422 behave as today.
- A wait longer than `MAX_PAUSE_MS` (60 s) is not waited in place: the event is retried at the next tick.

## Review Focus

- A 403 that is a permission error (no rate-limit header) must still throw at once — test in Task 1/2.
- A POST hit by the rate limit was not applied by GitHub: it is retried (unlike a 502) — test in Task 2.
- A run re-run three times and still rate-limited is not re-run forever (`run_attempt` cap) — test in Task 3.
- A card whose session comment is edited (no new comment, `updated_at` may not move) still refreshes while running — test in Task 5.
- The panel's rate-limit pause does not show « Connexion perdue » — covered by `failures` not increasing (Task 5).

---

### Task 1: rate-limit helper

**Files:** Create `scripts/lib/ratelimit.mjs`; Test `test/ratelimit.test.mjs`; copy it next to the panel (`.github/workflows/pages.yml`, a11y `EXTRA` maps).

**Produces:**
- `rateLimitDelay(status: number, headers: {get(name): string|null}, nowMs: number): number|null` — 429 or (403 with `retry-after` or `x-ratelimit-remaining` `0`): `retry-after`×1000, else `x-ratelimit-reset`×1000 − now (min 1 s), else 60 000. Otherwise `null`.
- `MAX_PAUSE_MS = 60_000`
- `class RateLimited extends Error { waitMs; rateLimited = true }`, `isRateLimited(e)`.

- [ ] Tests: 429 + `retry-after: 7` → 7000; 403 + remaining 0 + reset now+120 s → 120000; 429 bare → 60000; 403 bare → null; 404 → null.
- [ ] Run, see FAIL (module missing); implement; run, PASS.

### Task 2: Node client pauses

**Files:** Modify `scripts/lib/github.mjs` (`send`); Test `test/github.test.mjs`.

- [ ] Tests: `a 429 pauses for the time GitHub asks, then the same call is retried` (sleep receives 3000 for `retry-after: 3`); `a rate-limited POST is retried (GitHub did not apply it)`; `a wait too long throws RateLimited`; `a 403 without rate-limit headers is thrown at once`.
- [ ] In `send`, before the 5xx logic: `rateLimitDelay` non-null → if ≤ `MAX_PAUSE_MS` and fewer than 3 pauses: sleep and retry; else throw `new RateLimited(wait)`.

### Task 3: relay keeps the event

**Files:** Modify `scripts/relay.mjs` (`main`, `heal`), `scripts/lib/github.mjs` (`failedRuns`, `runJobs`, `rerunFailed`), `.github/workflows/relay.yml`; Test `test/relay.test.mjs`.

**Produces:** `export const RATE_LIMIT_STEP = 'Rate limited: retried at the next tick'`; output `ratelimited`.

- [ ] Tests: `the tick re-runs a run stopped by GitHub's rate limit` (failed run with a job step named `RATE_LIMIT_STEP`, conclusion failure, `run_attempt` 1 → `rerunFailed(id)` called); not for a run whose failure is another step; not when `run_attempt` ≥ 3; not for runs older than 24 h.
- [ ] `main`: wrap commands; on `isRateLimited(e)` write outputs with `ratelimited: 'true'` and exit 0. relay.yml: a step after `relay` with `name: Rate limited: retried at the next tick`, `if: steps.relay.outputs.ratelimited == 'true'`, `run: exit 1` (in decide and the report jobs that call the relay).
- [ ] `heal` calls `retryRateLimited()` first.

### Task 4: relay reads less

**Files:** Modify `scripts/relay.mjs` (`closeMerged`, `notifyWaiting`), `scripts/lib/github.mjs` (`listOpenIssues`, `listRepoEvents`, `listCommentsSince`); Tests `test/relay.test.mjs`, `test/notify.test.mjs`.

- [ ] Test: `closeMerged reads no issue whose card is already closed` (closed PRs linked to closed issues → no `getIssue`/`listEvents` call).
- [ ] Test: `an alert already sent costs no full comment read` (repo events give the label event; `listCommentsSince` returns the marker with the key → `listComments` and `listEvents` not called).
- [ ] `closeMerged`: one `listOpenIssues()`; only PRs whose linked issue is in it (labels from the list).
- [ ] `notifyWaiting`: label event from `listRepoEvents()` (fallback `listEvents(n)`), comments from `listCommentsSince(n, at)`; full `listComments` only when the key is absent.

### Task 5: panel

**Files:** Modify `panel/app.mjs` (`cachedGet`, `refresh`), `panel/live.mjs`; Test `test/panel-live.test.mjs`.

**Produces:** `commentsStale(card, seen: string|undefined, known: {preview}) : boolean` and `cardSig(card): string` (`updated_at|comments`).

- [ ] Tests: unchanged signature → false; new comment → true; running card → true even unchanged; PR card with no preview yet → true.
- [ ] `cachedGet`: on `rateLimitDelay` ≤ 60 s wait and retry once, else throw `{ rateLimited, waitMs }`; `refresh` catch: rate-limited does not count as a failure, next refresh after the wait.
- [ ] Card comments: only stale cards, through `mapLimit(…, 4)`.

### Task 6: verify

- [ ] `npm run typecheck && npm run lint && npm test && npm run build`, a11y tests with `CHROMIUM_PATH`.
