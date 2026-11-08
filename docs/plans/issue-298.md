# Wake a blocked card when the request it waits for is merged — Implementation Plan

**Goal:** a card blocked because it waits for the merge of other requests resumes on its own once they are all merged.

**Architecture:** the agent writes an invisible marker `<!-- factory-waits-for #12 #15 -->` in its blocking comment.
A pure shared module reads the active link from a card's comments and the state of each waited request. The relay
checks every blocked issue each time it looks at the queue (`dequeue()`: after every merge, close, tick, blocked
label, and now at the end of an agent run that leaves the card blocked) and resumes, queues or warns. The panel reads
the same marker from the comments it already loads and shows « Attend #12 » instead of « Bloqué ».

**Spec:** issue #298, comment `<!-- factory-spec -->` (version 1).

## Global constraints

- No runtime dependency; `node --test`; owner-facing text in French, vouvoiement.
- Messages: « #12 est fusionnée : je reprends. » · « #12 a été abandonnée : que voulez-vous faire ? »
- Only requests of the same project (numbers are local to the repo, so this is automatic).

## Review focus

- An owner message written after the marker forgets the link (no second resume at the merge).
- A marker naming an already-merged request: the card resumes at the end of the agent's run, not never.
- Factory full: the card is queued with `factory:resume-queued`, like an owner answer.
- A card with `factory:running` is never touched (the agent is still writing).
- A wake or abandon message consumes the marker: a later re-block without a marker is a normal block.

## Task 1: shared parser `scripts/lib/waits.mjs`

- `waitsMarker(numbers) -> string`, `WAITS_DONE_MARKER`.
- `waitedFor(comments) -> number[]`: numbers of the last comment holding the marker; `[]` when a later comment has no
  `<!-- factory-agent -->` marker (owner answer) or holds `WAITS_DONE_MARKER`.
- `requestState(item) -> 'merged' | 'abandoned' | 'open'` from a GitHub issue object (PR: `pull_request.merged_at`;
  issue: closed `completed` = merged, closed otherwise or missing = abandoned).
- Tests: `test/waits.test.mjs`.

## Task 2: relay

- `wakeWaiters()` in `scripts/relay.mjs`, called at the start of `dequeue()`.
- All merged → resume (`fireAgent` stage `resume`, extra `{ merged: [...] }`) and remove `factory:blocked`, or queue
  (`factory:queued` + `factory:resume-queued`, minus `factory:blocked`/`factory:building`) when full. Comment with
  `WAITS_DONE_MARKER`.
- Any abandoned → comment with `WAITS_DONE_MARKER`, the card stays blocked.
- `decide`: end of a run (`factory:running` removed) on a blocked issue → `dequeue`.
- Tests in `test/relay.test.mjs` and `test/decide.test.mjs`.

## Task 3: panel

- Load `waits.mjs` next to the panel (pages.yml copy, a11y/e2e fixtures); keep `live.waits`; « Attend #12 » tag and
  « Rien à faire de votre côté » on blocked cards with an active link, minus requests already in « Terminé ».
- e2e journey `e2e/waits.e2e.mjs` for the first acceptance criterion.

## Task 4: agent instructions

- `agent/AGENT.md`: how to note the link. `agent/stages/resume.md`: the `merged` payload means: update the branch
  from `main` and resume.
