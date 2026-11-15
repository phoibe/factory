# Parallel independent tasks of a large plan — Implementation Plan

> **For agentic workers:** executed inline (medium request) with superpowers:executing-plans.

**Goal:** during the build of a large request, plan tasks that depend on no other task and touch no shared file run at the same time (3 at most), each in its own copy, and the PR's « Fabrication » section shows which ones ran together.

**Architecture:** the behaviour is an instruction change (`agent/stages/build.md`, `agent/AGENT.md`) that overrides the vendored `subagent-driven-development` ban on parallel implementers, only for tasks marked « parallélisable » and dispatched with `isolation: "worktree"`. The proof is mechanical: the journal hook records `copy: true` on such dispatches, and `fabrication.mjs` groups those launched together into waves and prints a « Tâches en parallèle » line (alert above 3 in one wave).

**Tech Stack:** Node.js ES modules, `node --test`.

**Spec:** issue #417, spec version 1 (saved to `docs/specs/417-…md` by `specs.mjs save`).

## Global Constraints

- At most 3 sub-agents at once (`MAX_PARALLEL = 3`).
- Small and medium requests: unchanged.
- Owner-facing text in French, vouvoiement-free PR body lines as the existing ones.
- `agentEntry` output keeps its current shape when no isolation is given (existing tests deepEqual it).

## Review Focus

- Agent dispatches without `isolation` → no `copy` key, no parallel line.
- A parallel task launched alone (a place freed) → a wave of 1, still counted.
- Transcript fallback (multi-project routine) → same `copy` flag.
- Wave above 3 → alert in the Fabrication section.
- Journals from before this change (no `copy`) → body unchanged.

---

### Task 1: journal records copies; fabrication shows waves

**Files:**
- Modify: `agent/scripts/journal.mjs` (`agentEntry`), `agent/scripts/fabrication.mjs` (`parallelWaves`, `parallelLine`, `routeLine`, `summarize`)
- Test: `test/subagents.test.mjs`

**Interfaces:**
- `agentEntry(input)` → adds `copy: true` when `tool_input.isolation === 'worktree'`.
- `parallelWaves(runs, { windowMs = 120000 }) -> Array<Array<entry>>`: copy agents of all runs, sorted by `t`, a new wave when the gap to the wave's first launch exceeds `windowMs`.
- `parallelLine(runs) -> string|null`: null without copy agents; else `**Tâches en parallèle** : N tâches construites chacune dans sa copie, en W vague(s) lancée(s) ensemble (a + b), au plus M à la fois` and the first labels.
- `MAX_PARALLEL = 3`; `summarize` adds the line after the route and an alert « Tâches en parallèle : X sous-agents lancés ensemble, plus que 3. » when a wave exceeds 3.
- `routeLine`: large route with copy agents → `**Parcours** : grande demande, plan exécuté tâche par tâche, tâches indépendantes construites en même temps (3 au plus), chaque tâche relue`.

- [ ] Step 1: failing tests (entry flag, transcript flag, waves, line, alert, route, no line without copies)
- [ ] Step 2: `npm test` → red
- [ ] Step 3: implement
- [ ] Step 4: `npm test` → green
- [ ] Step 5: commit

### Task 2: instructions

**Files:** `agent/stages/build.md` (step 3, large route), `agent/AGENT.md` (taille d'une demande sentence), then `node scripts/sync.mjs` equivalent to regenerate `.factory/` if the repo syncs itself.

- Plan marks each task « parallélisable » or « séquentielle (après la tâche N) ».
- Ready parallelisable tasks: skill `dispatching-parallel-agents`, at most 3 sub-agents at once, each with `isolation: "worktree"`, told to commit in its copy; when one returns: per-task review, then `git merge` its branch into the request branch; next ready task takes the freed place; dependent tasks start only after their dependency is merged.
- Conflict: resolve if simple, else redo the task after the other, sequentially; never ask the owner.
- After the last merge: full test suite, red → fix the cause before final review.
- No parallelisable task → sequential as today. Model grid and step-up unchanged.
- This overrides the skill's « never dispatch multiple implementation subagents in parallel », for these tasks only.
