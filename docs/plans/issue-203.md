# Agent-closed requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the agent close a feature or bug it finds already done, duplicated or obsolete, with no confirmation from the owner; show the reason in the board's « Terminé » column; reopen and resume the card when the owner writes in it.

**Architecture:** The agent adds `factory:close` plus one reason label (`factory:already-done`, `factory:duplicate`, `factory:obsolete`). The relay's existing `dropCard` closes the issue and its PRs, but for a reason label it posts no message of its own (the agent's message is the only one), keeps the reason label, and saves the card's state in a hidden marker at the end of the issue body. An owner comment on a closed issue with a reason label becomes a `reopen` decision: the relay reopens the issue and its PRs, restores the saved state labels plus `factory:blocked`, and re-decides, so the existing « blocked card answered » path fires `resume` (or queues it when the factory is full).

**Tech Stack:** Node.js ESM, no dependency, `node --test`.

**Spec:** issue #203, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Only three reasons: « Déjà réglée », « En double », « Obsolète ». Only `factory:feature` and `factory:bug` issues; a reason label on a project or audit issue is refused (labels removed, nothing closed).
- One message only: the agent's. The factory posts nothing when it closes for a reason.
- Reopen-by-message only for agent-closed requests; other closed requests keep « Cette demande est déjà terminée et en ligne… ».
- Owner-requested drops (`fermer`, `factory:close` without reason) are unchanged.
- Panel copy in French, vouvoiement, no new colour or font outside `DESIGN.md`.

## Review Focus

- A reason label put on the PR instead of the issue: the issue must still get the reason (copied to it) and be closed.
- The owner writes twice quickly in the closed card: the second message must not reopen twice (after reopen the issue is open, so `reopen` is not decided again).
- Reopening when the factory is full and the card was building: it must queue (`factory:queued` + `factory:resume-queued`), not overrun `maxParallel`.
- An agent-closed issue whose body has no marker (closed by hand with the label): reopen still works, with `factory:blocked` only.
- A merged-PR done item and an agent-closed issue both appear in « Terminé », newest first; PR entries in the closed issues list are ignored.

---

### Task 1: Labels and decision

**Files:**
- Modify: `scripts/lib/labels.mjs`, `scripts/lib/decide.mjs`
- Test: `test/decide.test.mjs`

**Interfaces:**
- Produces: `L.alreadyDone = 'factory:already-done'`, `L.duplicate = 'factory:duplicate'`, `L.obsolete = 'factory:obsolete'`; `CLOSE_REASONS` (array of these three) and `closeReason(labels) -> string|null` exported from `labels.mjs`; LABEL_DEFS entries for each; `decide()` returns `{ type: 'reopen' }` for an owner comment on a closed issue (`ev.closed === true`) carrying a reason label, before the lock check.

- [ ] Test `an owner message on an agent-closed issue reopens it` (labels `[feature, obsolete]`, `closed: true` → `reopen`), and `a message on a normally closed issue is not a reopen` (no reason label → not `reopen`), and agent comments are still ignored.
- [ ] Run `npm test` → fails; implement; run → passes; commit.

### Task 2: Relay close and reopen

**Files:**
- Modify: `scripts/relay.mjs` (`dropCard`, new `reopenCard`, `handleEvent`), `scripts/lib/github.mjs` (`updateIssue(n, fields)`, `reopenIssue(n)`, `reopenPr(n)`)
- Test: `test/relay.test.mjs`

**Interfaces:**
- Marker: `<!-- factory-reopen {"labels":[...],"prs":[...]} -->` appended to the issue body; `labels` = the issue's labels among grilling, spec-review, queued, building, resume-queued, auto-go at close time.
- `state_reason`: already-done → `completed`, duplicate → `duplicate`, obsolete → `not_planned`.

- [ ] Tests: agent close with reason closes issue + PR, posts no comment, keeps the reason label, writes the marker; reason on a project issue is refused; owner comment on the closed issue reopens it and its PR, removes the reason label and the marker, restores labels + fires `resume`; full factory + building → queued; marker-less reopen fires `resume`; normal closed issue still gets « déjà terminée ».
- [ ] Run → fail; implement; run → pass; commit.

### Task 3: Panel « Terminé » mention

**Files:**
- Modify: `panel/lib.mjs` (`doneItems(pulls, issues = [])`, items get `reason: string|null`), `panel/app.mjs` (fetch `/issues?state=closed&sort=updated&direction=desc&per_page=100`, render `d.reason` instead of « Terminé »), `panel/style.css` if needed
- Test: `test/panel-lib.test.mjs`

- [ ] Test `doneItems adds agent-closed issues with their reason` (« Déjà réglée », « En double », « Obsolète »; closed_at as date; PRs and issues without reason ignored; sorted with merged PRs).
- [ ] Run → fail; implement; run → pass; commit.

### Task 4: Agent rules

**Files:**
- Modify: `agent/AGENT.md` (close section), `agent/stages/resume.md` (reopened card)

- [ ] Rules: the three cases with a proof link, only feature/bug, doubt → ask; one short message with reason, link and « écrivez ici pour la rouvrir »; for a duplicate, copy what is new into the older issue first; then `factory:close` + reason label. Resume: a reopened card resumes its step from history.
- [ ] `npm test` (vouvoiement, sync tests) passes; commit.
