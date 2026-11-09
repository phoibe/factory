# Model and effort grid for sub-agents — Implementation Plan

> **For agentic workers:** executed inline (superpowers:executing-plans) by the factory build run.

**Goal:** every sub-agent the factory's agent dispatches uses the model and effort its task deserves, and each PR's « Fabrication » section shows which models the sub-agents ran on.

**Architecture:** one grid in `agent/AGENT.md` (synced to every project), referenced by the stage files that dispatch sub-agents. The journal hook also records `Agent`/`Task` tool calls (model, effort, description); the fabrication summary turns them into one line « Sous-agents : … ».

**Tech Stack:** Node.js ES modules, `node --test`.

**Spec:** issue #309, comment `<!-- factory-spec -->` (version 1).

## Global Constraints

- Haiku → low effort: code searches, mechanical tasks, screenshots.
- Sonnet → medium: routine build tasks, fixes after review, per-task reviews, design critique, each part of a general review.
- Opus → high: final code review before the PR, security review, architecture, stubborn debugging, general review synthesis.
- Default effort medium; never `xhigh` nor `max`.
- Escalation: light model fails (tests red after 2 tries, or work rejected twice by the reviewer) → rerun one tier up (Haiku → Sonnet → Opus).
- One grid for all projects; it replaces the subagent-driven-development skill's own model advice.

## Review Focus

- Agent call without `model` → counted as « modèle de la session », not dropped.
- Legacy tool name `Task` (older Claude Code) → recorded the same as `Agent`.
- Full model ids (`claude-sonnet-5-5`, `opus[1m]`) → grouped by family.
- Transcript fallback (multi-project routine, no hooks) → agents recovered from the transcript too.
- PR with no sub-agent → line « Sous-agents : aucun », no alert.

---

### Task 1: Journal records sub-agents

**Files:** `agent/scripts/journal.mjs`, `agent/scripts/transcript.mjs`, `scripts/sync.mjs` (matcher `Skill|Bash|Agent|Task`), tests `test/journal.test.mjs`, `test/transcript.test.mjs`, `test/sync.test.mjs`.

**Produces:** `agentEntry(input) -> { kind: 'agent', model: string|null, effort: string|null, label: string } | null` exported from `journal.mjs`; `entryFor` returns `{ t, ...agentEntry }` on `PostToolUse` of `Agent`/`Task`; `fromTranscript` emits the same entries for `tool_use` blocks named `Agent`/`Task`.

- [ ] Failing tests: `entryFor({hook_event_name:'PostToolUse', tool_name:'Agent', tool_input:{description:'Relecture finale', model:'opus', effort:'high', prompt:'…'}})` → `{kind:'agent', model:'opus', effort:'high', label:'Relecture finale'}`; `Task` with no model → `model:null`; transcript block likewise; sync matcher `'Skill|Bash|Agent|Task'`.
- [ ] Implement, run `npm test`, commit.

### Task 2: « Sous-agents » line in the fabrication summary

**Files:** `agent/scripts/fabrication.mjs`, `test/fabrication.test.mjs`.

**Produces:** `parseJournal` adds `agents: []` to each run; `modelFamily(model) -> 'Haiku'|'Sonnet'|'Opus'|null`; `agentsLine(runs) -> string` e.g. `**Sous-agents** : 3 sur Sonnet (Tâche 1, Tâche 2, Revue tâche 1), 1 sur Opus (Relecture finale)`; families in order Haiku, Sonnet, Opus, other names as-is, then `N sur le modèle de la session`; at most 3 labels per group then `…`; `aucun` when empty. `summarize` puts it right after « Preuve TDD ».

- [ ] Failing tests for `modelFamily`, `agentsLine` (grouping, ordering, no-model group, truncation, empty), and `summarize` body containing the line.
- [ ] Implement, run `npm test`, commit.

### Task 3: The grid in the agent instructions

**Files:** `agent/AGENT.md` (new section « Modèle et effort des sous-agents »), `agent/stages/build.md` (steps 3, 5, 5 bis), `bugfix.md`, `audit.md`, `design-pass.md`, `visual-fix.md`, `acceptance-fix.md`, `skills-fix.md`; test `test/model-grid.test.mjs` asserting the AGENT.md section holds the three tiers with their efforts, the escalation rule, « jamais `xhigh` ni `max` », and that each listed stage file names the model of its sub-agent.

- [ ] Failing test, then write the section and stage lines, run `npm test`, commit.
