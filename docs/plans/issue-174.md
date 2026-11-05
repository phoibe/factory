# No explainer text on screens — Implementation Plan

> **For agentic workers:** executed inline with executing-plans (autonomous factory run, no human review of the plan).

**Goal:** every time the factory calls the `impeccable` skill, it reminds it that screens carry short labels only, and any text explaining how a screen works is a defect to fix.

**Architecture:** one canonical rule section, « Textes à l'écran », in `agent/stages/design-pass.md`. Every stage that calls `impeccable` (framing, foundation, audit, skills-fix, build) points to it. The rule is also written into each project's `DESIGN.md` (« Do's and Don'ts ») at framing/foundation and whenever an existing `DESIGN.md` is updated. The vendored skill in `packs/impeccable/` is not touched.

**Tech Stack:** Markdown agent instructions, `node --test`.

**Spec:** issue #174, comment `<!-- factory-spec -->` version 1.

## Global Constraints

- Allowed: titles, button and field labels, short error messages saying what to do, one short sentence on an empty screen.
- Forbidden: intro paragraphs, « Comment ça marche » texts, subtitles describing the screen, per-field help when the label suffices, onboarding tutorials, guided tours, « astuce » tips.
- Exception: an explicit request from the owner in an issue wins.
- PR « Design » section: one line per removed text.
- Do not modify `packs/impeccable/`.

## Review Focus

- A stage file calling `impeccable` that forgets the rule → test enumerates every stage mentioning `impeccable`.
- `clarify` adding text during the fix step → design-pass step 3 says fixes shorten/remove, never add explanations.
- Existing projects' `DESIGN.md` never getting the rule → foundation revision/adoption and design-pass DESIGN.md updates add it.
- Owner explicitly asks for help page → exception stated in the rule.
- Removed texts invisible to owner → PR Design section line per removed text.

---

### Task 1: Rule + references, guarded by a test

**Files:**
- Create: `test/design-rule.test.mjs`
- Modify: `agent/stages/design-pass.md`, `framing.md`, `foundation.md`, `audit.md`, `skills-fix.md`, `build.md`

- [ ] Step 1: test `design-pass.md` has section `## Textes à l'écran` listing the allowed/forbidden items, the owner exception, and the PR line per removed text; every `agent/stages/*.md` mentioning `impeccable` (other than design-pass) references `Textes à l'écran`; `framing.md`/`foundation.md` require the rule in `DESIGN.md`.
- [ ] Step 2: `npm test` → FAIL.
- [ ] Step 3: write the section and references.
- [ ] Step 4: `npm test` → PASS.
- [ ] Step 5: commit.
