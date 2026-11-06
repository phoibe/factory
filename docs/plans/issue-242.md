# Stack sheet (« Stack technique ») Implementation Plan

> **For agentic workers:** executed inline by the factory agent (superpowers:executing-plans).

**Goal:** a « Stack technique » button in the panel shows each project's stack sheet (`STACK.md`), kept up to date by the agent and enforced by the checks; projects without one get an « Établir la fiche » run.

**Architecture:** the sheet is a Markdown file `STACK.md` at the project root, with fixed `##` headings. The panel parses it (pure module `panel/stack.mjs`) and shows it in a `<dialog>`; its date is the last commit touching it. A new label `factory:stack` starts a new agent stage `stack` (like `factory:audit`: no spec, straight to building or queue). The relay's guard opens that card by itself in a framed project without a sheet (once). The checks compare the dependency manifests of the PR head and the default branch: libraries added/removed (or a new major) with an unchanged sheet → red.

**Tech Stack:** Node 22, no dependency, `node --test`; Playwright for e2e.

**Spec:** issue #242, comment `<!-- factory-spec -->` (version 1).

## Global Constraints
- French UI, vouvoiement, copy: « Stack technique », « Fermer », « Mise à jour le … », « Pas encore de fiche », « Établir la fiche ».
- Sheet order: Interface, Moteur / serveur, Autres services, Données, Bibliothèques (runtime then « fabrication et tests »), Services nécessaires.
- Versions: major only (« Node.js 22 », « FastAPI 0.115 »).
- No new dependency; DESIGN.md tokens only.

## Review Focus
- Sheet missing (404) → empty state, not an error toast.
- Card already open for the sheet → « Établir la fiche » does not open a second one (shows that it is under way).
- Project not framed yet / framing in progress → guard does not open a sheet card.
- Checks on a project with no sheet on either side → stack check skipped, never red.
- Version spec with no digits (`latest`, git URL) → no crash, compared by name.

### Task 1: sheet parser `panel/stack.mjs`
- Produces: `parseStack(md: string) → { sections: [{ title, blocks: [{ type: 'p'|'ul'|'h', text|items }] }] }`, `STACK_SECTIONS` (ordered titles), `stackDate(iso) → 'Mise à jour le 6 novembre 2026'`.
- Test `test/panel-stack.test.mjs`: sections in order, `###` → `h` blocks, `-` items, title `#` ignored; date in French.

### Task 2: dependency comparison `scripts/lib/stack.mjs`
- Produces: `libraries(files: Record<path,string>) → Set<string>` (`npm:name@major`, `py:name@major`) from `package.json`, `requirements*.txt`, `pyproject.toml`; `stackVerdict({ base, head }) → { status: 'pass'|'fail'|'skip', added, removed }` where base/head = `{ files, sheet: string|null }`.
- Tests `test/stack-check.test.mjs`: added lib + same sheet → fail; changed sheet → pass; no sheet on both → skip; major bump → fail; patch bump → pass; `latest` spec → compared by name.
- Wire in `scripts/checks.mjs` (`--base <ref>`, git show), relay.yml fetches the default branch to `refs/factory/base`.

### Task 3: label + stage `stack`
- `L.stack = 'factory:stack'` + LABEL_DEFS; decide.mjs start like audit (stage `stack`); relay dequeue/relaunch use `buildStage(labels)`; autoPick SKIP; factory.yml label filter; run-title/fabrication names; panel live/eta treat as no-spec card, kind « Fiche stack ».
- Guard `ensureStackSheet()` in heal(): framed (PRODUCT.md), no open `factory:project`, no `STACK.md`, no `factory:stack` issue ever → create card « Établir la fiche stack technique » (labels stack + kept) and start or queue it.
- Tests in `test/decide.test.mjs`, `test/relay.test.mjs`.
- Agent: `agent/stages/stack.md`; build/bugfix/foundation/audit + AGENT.md tell the agent to keep `STACK.md` up to date.

### Task 4: panel button + dialog, factory `STACK.md`, e2e
- `#stack-open` button (data-menu, next to « Review générale »), `<dialog id="stack">`; fetch contents + commits?path; empty state with « Établir la fiche ».
- `STACK.md` for the factory. Test that it has the sections and criterion 3's facts.
- e2e: one test per browser-checkable criterion (1, 2, 3, 6, 7).
