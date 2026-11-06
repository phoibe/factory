# Live-site guard (issue #227) Implementation Plan

> **For agentic workers:** executed inline with superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** never undo a delivery on a false alarm, and never leave a « Remettre en ligne … » card stuck in `factory:no-pick`.

**Architecture:** the live check (relay.yml `production-open` → `production`) gains a 5-minute re-check in
`scripts/smoke.mjs`, a single re-run of a failed host deployment (`relay.deployFailed`), a verified undo PR in
`relay.prodReport` (fallback: the redo card starts at once as a normal urgent fix), and a tick guard
`relay.unstickRedos` that re-checks the live site of a card stuck > 1 h, then closes it as obsolete or starts it.

**Tech Stack:** Node 22 ESM, `node --test`, GitHub Actions.

**Spec:** issue #227, comment `<!-- factory-spec -->` version 1.

## Global Constraints

- No new dependency. Owner-facing text in French, « vous », one short sentence for warnings.
- Re-check window: about 5 minutes. Safety net: no-pick for more than 1 hour without an open undo PR.
- Setting to name: « Settings → Actions → General → Allow GitHub Actions to create and approve pull requests ».
- Previews (preview-check) are out of scope; an undo that still leaves the site broken stays as today.

## Review Focus

- A re-run deployment adds a new deployment for the same sha: `liveUrl` must read the newest one, not an older failure.
- A superseded deployment's latest status is `inactive`: the re-check of an old sha must still find its success URL.
- A relaunched `prodReport` must reuse the existing redo card (no second « Remettre en ligne » card).
- A redo card whose undo PR is open must never be unblocked by the safety net, however old.
- A re-check that never reports back must not leave the card stuck: one more hour, then it starts anyway.

---

### Task 1: smoke re-check for ~5 minutes

**Files:** `scripts/smoke.mjs`, `test/smoke.test.mjs`, `.github/workflows/relay.yml` (production-open: `--retry-minutes 5`, longer timeouts)

**Produces:** `smokeUntil({ check, retryMs, intervalMs, sleep, now }) -> result` — calls `check(attempt)` until a non-`failed` result or the deadline; `smoke({ ..., install })` skips the install when `install === false` (later attempts).

- [ ] Test: failed, failed, passed → returns passed after 3 calls; always failed → stops once the deadline is passed, returns the last failure with « (toujours après 5 min) ».
- [ ] Implement, run `npm test`, commit.

### Task 2: newest deployment, one re-run of a failed publication

**Files:** `scripts/relay.mjs` (`liveUrl`, new `deployFailed`, `main` live-url/prod-report), `relay.yml` (`deployFailure` output), `test/relay.test.mjs`

**Produces:** `liveUrl(sha)` → url string | `{ failed: true, detail, runId }` | null, from the newest live deployment and its first decisive status (success/failure/error, skipping inactive/pending).
`deployFailed({ pr, sha, detail, runId, retried })`: not retried and a run id → `gh.rerunFailed(runId)` and dispatch `prodCheck { pr, sha, deployRetried: true }`, no message; otherwise one comment on the PR (« l'hébergeur refuse de publier… son message : … ; l'ancienne version reste en ligne, rien n'est retiré »). Never undoes.

- [ ] Tests: newest deployment wins over an older failure; inactive after success = success; deploy failure re-runs once then reports without undo.
- [ ] Implement, run, commit.

### Task 3: verified undo, redo card started on refusal

**Files:** `scripts/relay.mjs` (`prodReport`, new `startRedo`, `redoBody`), tests.

- [ ] Tests: createPr throws → noPick removed from the redo card, its body no longer says the delivery was removed, one comment naming the setting, the bugfix agent starts; relaunch with an existing open redo card for the same PR → no new card, the undo PR is opened for it.
- [ ] Redo body carries `<!-- factory-redo-of #<pr> <sha> -->`; older cards are matched by « la PR #<pr> » and « cherry-pick <sha> ».
- [ ] Implement, run, commit.

### Task 4: safety net and re-check of stuck cards

**Files:** `scripts/relay.mjs` (`unstickRedos` in `heal`, `prodReport` with `redo`), tests.

- [ ] Tests: card no-pick > 1 h with no undo PR → dispatch `prodCheck { pr, sha, redo }` and body stamped `<!-- factory-redo-recheck <ms> -->`; stamped > 1 h ago → started; open undo PR → untouched; project without a live deployment → started at once.
  `prodReport` with `redo`: passed → comment « Obsolète : la version en ligne marche », `factory:obsolete` + `factory:close`, closed (dropCard); failed/skipped → started.
- [ ] Implement, run, commit.
