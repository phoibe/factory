# Issue 466: keep each project's README up to date — Implementation Plan

> **For agentic workers:** executed inline (medium request, executing-plans). Steps use checkbox syntax.

**Goal:** the instructions sent to projects make the agent write the README in French, following GitHub's
recommended content, and review it on every delivered feature.

**Architecture:** a new shared guide `agent/stages/readme.md` (synced to every project like `stack.md`) holds the
README model and rules. `foundation.md` points to it instead of "short technical README in English"; `build.md`
gets a step 6 quater that reviews the README on each feature (first one on an existing project = full upgrade).
A decision record notes that no licence is ever added without the owner's agreement.

**Tech Stack:** Markdown instructions, `node --test`.

**Spec:** issue #466, spec version 1 (saved to `docs/specs/` by `specs.mjs save 466`).

## Global Constraints

- README written in French (commands stay as they are), short (read in a minute).
- Order: purpose, live site address, home-page screenshot, what you can do (delivered features), how to run and
  test, licence only if the project already has one.
- Never add a licence on its own initiative.
- Updated only when something visible changed; never blocks a PR (no gate/check).
- The factory's own README is out of scope (payload `repo` == `factory`).

## Review Focus

- Project with no live site yet: the address line must say so instead of inventing a URL.
- Project that is not a web app (no home page): the screenshot is skipped, not faked.
- Existing English README on an older project: upgraded once, on its next feature.
- Bugfix runs: not concerned (spec says "à chaque feature livrée").
- Screenshot image link must work on GitHub (stored in the repo, relative path).

### Task 1: README rules in the agent instructions

**Files:**
- Create: `agent/stages/readme.md`
- Modify: `agent/stages/build.md` (new step 6 quater), `agent/stages/foundation.md` (README line)
- Create: `docs/adr/0010-pas-de-licence-sans-accord.md`
- Test: `test/readme-rule.test.mjs`

- [x] Step 1: write `test/readme-rule.test.mjs`: `readme.md` exists, mentions French, the six parts in order
  (« À quoi sert », « adresse », « capture », « Ce que vous pouvez faire », « lancer », « Licence »), forbids adding
  a licence, excludes the factory itself; `build.md` refers to `.factory/stages/readme.md` and says no PR is
  blocked; `foundation.md` no longer says "README technique court (en anglais)" and refers to `readme.md`.
- [x] Step 2: run `npm test`, see it fail.
- [x] Step 3: write the guide, the build step, the foundation line, the ADR.
- [x] Step 4: run `npm test`, see it pass.
- [x] Step 5: commit.
