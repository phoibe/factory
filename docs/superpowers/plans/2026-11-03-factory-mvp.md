# Factory MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working GitHub-based software factory: an issue becomes a grilled spec, a reviewed PR, screenshots, checks, a preview and a merge, with Pierre only answering in French at three gates.

**Architecture:** GitHub Actions is the orchestrator. A thin `factory.yml` in each project calls the reusable `relay.yml` of `phoibe/factory`; `scripts/relay.mjs` turns each GitHub event into one action using the pure `decide()` and `factory:*` labels as the state machine. Agent runs go to a Claude Code routine (`/fire` API) or, as a fallback, `anthropics/claude-code-action` on Actions. Deterministic steps (checks, merge, queue) stay in Actions. Skills are vendored at pinned commits and copied into each project by `sync`.

**Tech Stack:** Node 22 ESM (`.mjs`, zero runtime dependencies), `node:test`, GitHub Actions, static HTML/JS panel on GitHub Pages, Playwright (preinstalled in Claude cloud sessions) for screenshots.

**Spec:** `docs/design.md`

## Global Constraints

- Zero npm dependencies in `factory` scripts (only Node built-ins and `fetch`).
- Config file in projects: `factory.config.json` (JSON, not YAML; edited by the panel).
- Human-facing text (comments, panel, issue forms, README) in French; code, identifiers, commits in English.
- Only the repository owner's comments can trigger runs (public repos must not let strangers spend Pierre's plan).
- Every agent comment contains the hidden marker `<!-- factory-agent -->`; the relay ignores those.
- Default `maxParallel` = 2, default `review.maxLoops` = 3.
- Agent never creates accounts, never adds paid services or keys.

## Review Focus

1. A comment from someone other than the owner on a public repo: must be ignored.
2. Pierre comments twice quickly while an agent run is live: the second must not start a parallel run on the same issue (lock `factory:running`, fresh < 90 min).
3. Approval wording variants ("Go", "ok !", "Oui c'est bon", "👍", "valide"): must be recognised; "ok mais change X" must NOT be treated as approval.
4. A merge done with `GITHUB_TOKEN` emits no `pull_request.closed` event: the queue must be advanced in the same relay run.
5. A config missing keys or with an unknown skill id: sync must fall back to catalog defaults and report unknown ids, never crash.

---

### Task 1: Vendored skill packs and catalog

**Files:** Create `packs/sources.json`, `scripts/lib/frontmatter.mjs`, `scripts/vendor.mjs`, generated `packs/<pack>/<skill>/**`, `packs/catalog.json`, `packs/NOTICE.md`. Test: `test/frontmatter.test.mjs`, `test/catalog.test.mjs`.

**Interfaces — Produces:**
- `parseFrontmatter(text: string) -> {name?: string, description?: string}` (handles quoted values).
- `packs/catalog.json`: `{packs: [{id, name, repo, commit, license, skills: [{id, path, description, defaultEnabled}]}]}`; skill ids unique across packs.

Packs: `superpowers` (obra/superpowers, `skills/*`), `matt-pocock` (mattpocock/skills, `skills/productivity/*` + `skills/engineering/*`), `impeccable` (pbakaus/impeccable, `.claude/skills/impeccable`). Defaults on: superpowers `test-driven-development, systematic-debugging, writing-plans, executing-plans, subagent-driven-development, dispatching-parallel-agents, requesting-code-review, receiving-code-review, verification-before-completion`; matt-pocock `grilling, to-spec`; impeccable `impeccable`.

- [ ] Tests: frontmatter parses plain and quoted descriptions; catalog has the 3 packs, unique ids, every `path` exists with a SKILL.md.
- [ ] Implement, run `node scripts/vendor.mjs`, run `node --test`, commit.

### Task 2: Config schema, defaults and resolution

**Files:** Create `defaults/factory.config.json`, `schema/factory.config.schema.json`, `scripts/lib/config.mjs`. Test: `test/config.test.mjs`.

**Interfaces — Produces:**
- `resolveConfig(raw: object|undefined, catalog) -> {config, warnings: string[]}`: deep-merges defaults; `skills[packId] = {enabled: bool, skills: {[skillId]: bool}}`, missing per-skill keys take `defaultEnabled`; unknown pack/skill ids produce warnings.
- `enabledSkills(config, catalog) -> [{packId, id, path}]`.
- Config keys: `version:1, runner:'claude-cloud'|'github-actions', maxParallel:int>=1, stack:string, stages:{grilling,plan,tdd,review,designPass,screenshots,checks,acceptance}:bool, review:{maxLoops:int}, checks:{typecheck,lint,test,build,a11y,audit}:bool, skills`.

- [ ] Tests: empty config → defaults; per-skill override; disabled pack yields no skills; unknown ids warn; invalid `maxParallel` falls back to 2 with warning.
- [ ] Implement, test, commit.

### Task 3: Agent instructions and sync into a project

**Files:** Create `agent/AGENT.md` (template with `{{stages}}`, `{{skills}}`, `{{maxLoops}}`, `{{stack}}`), `agent/stages/{grilling,spec,build,bugfix,visual-fix,acceptance-fix,fix-checks,pr-feedback,resume}.md`, `agent/scripts/shots.mjs`, `scripts/sync.mjs`. Test: `test/sync.test.mjs`.

**Interfaces — Produces:** `sync({projectDir, factoryDir}) -> {installed: string[], removed: string[], warnings}`: copies enabled skills to `.claude/skills/<id>`, removes skills listed in previous `.factory/installed-skills.json` that are no longer enabled (never touches other skills), writes `.factory/AGENT.md`, `.factory/stages/*`, `.factory/scripts/shots.mjs`, `.factory/installed-skills.json`.

`shots.mjs capture --base-url URL --routes a,b --out DIR` (desktop 1280x800, mobile 390x844) and `shots.mjs publish --pr N --before DIR --after DIR` (commits to orphan branch `factory-assets` under `pr-N/<timestamp>/`, prints a French markdown before/after table).

- [ ] Tests: install, re-sync after disabling one skill removes only it, user's own skill untouched, AGENT.md has no `{{`.
- [ ] Implement, test, commit.

### Task 4: Event decision (pure state machine)

**Files:** Create `scripts/lib/labels.mjs`, `scripts/lib/decide.mjs`. Test: `test/decide.test.mjs`.

**Interfaces — Produces:**
- Labels: `factory:feature, factory:bug, factory:grilling, factory:spec-review, factory:queued, factory:building, factory:blocked, factory:running, factory:visual-review, factory:checks, factory:acceptance, factory:fixing`.
- `isApproval(text) -> bool`: true for a short message (≤ 6 words) starting with go/ok/oui/valide/validé/c'est bon/on y va/lgtm/👍/✅ and containing no "mais"/"sauf"/"par contre"/"?".
- `decide(ev, config, ctx) -> Action` where `ev = {kind:'issue'|'pr', event, action, number, labels, text, fromOwner, fromAgent, merged, linkedIssue}`, `ctx = {inFlight, lockFresh}` and `Action = {type:'ignore'|'fire'|'queue'|'checks'|'merge'|'label', stage?, add?, remove?, reason, dequeue?: bool}`.

Rules: see architecture in `docs/design.md`; one test per rule (new feature → grilling or spec, new bug → bugfix or queue, grilling comment → fire grilling, spec-review approval → build or queue, spec-review other → spec, visual-review approval → checks, visual-review other → visual-fix, acceptance approval → merge + dequeue, acceptance other → acceptance-fix, PR push with `factory:checks` → checks, closed → dequeue, non-owner → ignore, agent marker → ignore, fresh lock → ignore).

- [ ] Tests first, implement, commit.

### Task 5: Relay IO, runners and reusable workflows

**Files:** Create `scripts/lib/github.mjs` (minimal REST client on `fetch`), `scripts/relay.mjs` (`decide` | `report --result success|failure` | `after-agent` subcommands, writes `GITHUB_OUTPUT`), `.github/workflows/relay.yml` (workflow_call: decide → agent-actions → checks → report), `.github/workflows/checks.yml` (workflow_call, input `pr`), `.github/workflows/sync.yml` (workflow_call), `.github/workflows/test.yml` (this repo's own CI). Test: `test/relay.test.mjs` with a fake client.

Firing `claude-cloud`: POST `FACTORY_ROUTINE_URL` with `Authorization: Bearer FACTORY_ROUTINE_TOKEN`, headers `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`, body `{text: JSON.stringify({repo, issue, pr, stage})}`. Checks green → feature with acceptance: label `factory:acceptance` + French comment with preview URL from the Deployments API; bug or acceptance disabled: merge + dequeue. Red → count `factory-checks-failed` markers; below `maxLoops` fire `fix-checks`, else `factory:blocked` + plain explanation.

- [ ] Tests with fake client (fire payload, queue picks oldest, report green/red/blocked), implement, `actionlint`-free YAML sanity via `node scripts/check-workflows.mjs`, commit.

### Task 6: Panel

**Files:** Create `panel/index.html`, `panel/style.css`, `panel/app.mjs`, `panel/lib.mjs`, `.github/workflows/pages.yml`. Test: `test/panel-lib.test.mjs`.

**Interfaces — Produces:** `columnFor(labels) -> 'grilling'|'spec'|'queued'|'building'|'visual'|'checks'|'acceptance'|'blocked'|null`; `toggleSkill(config, packId, skillId, on) -> config`.

Token pasted once (fine-grained PAT, stored in `localStorage`), lists repos owning `factory.config.json`, edits stages/skills/maxParallel/runner, saves via Contents API, shows a board per project.

- [ ] Tests, implement, check in a browser with Playwright screenshot, commit.

### Task 7: Monthly skill update

**Files:** Create `.github/workflows/update-skills.yml` (cron monthly + dispatch: `node scripts/vendor.mjs --latest`, opens a PR with a French summary of changed skills).

### Task 8: Template repo

**Files (factory-template):** `factory.config.json`, `.github/workflows/factory.yml`, `.github/workflows/factory-sync.yml`, `.github/ISSUE_TEMPLATE/{feature,bug}.yml` + `config.yml`, `CLAUDE.md`, `README.md` (French setup guide: routine, secrets, Vercel, Neon, labels bootstrap), `.gitignore`.
