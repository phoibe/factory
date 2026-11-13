# Route by request size — Implementation Plan (#381)

> Medium request: executed inline (executing-plans), one final review.

**Goal:** the factory adapts its route to the size of each request (small / medium / large), with the same quality gates.

**Architecture:** behaviour lives in the agent instructions (`agent/AGENT.md`, `agent/stages/*.md`, synced into each project's `.factory/`). Code changes: the PR's « Fabrication » section states the route followed (derived from the journal, not declared), and the board card shows the size from the agent's estimate marker.

**Spec:** issue #381, comment « Spec (version 1 ) » (saved to `docs/specs/381-*.md`).

## Global constraints
- Size words shown to the owner: « petite », « moyenne », « grande » (marker values `small`, `medium`, `large`).
- Small = at most 3 source files (`SMALL_FILES`, unchanged). Final review always `opus` / `high`.
- Tests, checks, design pass, screenshots and acceptance unchanged for every size; sensitive specs still validated.

## Review focus
- A small change on which the agent still wrote a plan: route stays « petite demande » (files decide).
- A non-build PR (fix-checks only, no build run): no route line.
- A card without estimate: kind line unchanged.
- Unknown size value in a marker: ignored (parseEstimate already filters).
- A PR card (no estimate of its own): unchanged.

### Task 1: route line in the Fabrication section
- Files: `agent/scripts/fabrication.mjs`, `test/fabrication.test.mjs`
- Produces: `routeLine(runs, { small }) -> string | null`; `summarize()` adds it after the run lines.
  - no `build` run → `null`
  - `small` → `**Parcours** : petite demande, sans plan, construite d'une traite avec une seule relecture finale`
  - a run used `subagent-driven-development` → `**Parcours** : grande demande, plan exécuté tâche par tâche, chaque tâche relue`
  - else → `**Parcours** : demande moyenne, plan exécuté d'une traite avec une seule relecture finale`
- Test first (red), then implement (green).

### Task 2: size on the board card
- Files: `panel/eta.mjs` (`kindText(kind, isPr, number, size) -> string`), `panel/app.mjs` (card kind line), `test/panel-eta.test.mjs`, `e2e/request-size.e2e.mjs`
- `kindText('Fonctionnalité', false, 12, 'small')` → `Fonctionnalité · petite demande #12`; `medium` → `demande moyenne #12`; `large` → `grande demande #12`; no size or PR → `Fonctionnalité · demande #12` / `… · modification #12`.
- e2e: a card in « Questions » whose thread holds an agent estimate `size=large` shows « grande demande ».

### Task 3: agent instructions
- `agent/stages/grilling.md`: step 0 — classify size at first read and post the estimate marker; small + clear → no questions, short spec.
- `agent/stages/spec.md`: short spec form for small requests.
- `agent/stages/build.md`: step 3 per size (small: no plan; medium: plan + `executing-plans` inline, one final review; large: `subagent-driven-development`); small that grows → medium, new estimate.
- `agent/AGENT.md`: « Taille d'une demande » rule (owner can correct it in words; agent follows and reposts the marker).
- `GLOSSARY.md`: « Taille d'une demande ».

### Task 4: verify, review, spec saved, PR
