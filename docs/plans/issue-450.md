# Remove the countdowns (issue #450) Implementation Plan

> Executed inline (medium request: it touched more than 3 code files once the countdown tests were rewritten).

**Goal:** « go », « Ok » and « Jeter » act at the touch, without the 5 s cancellable countdown.

**Architecture:** delete `panel/countdown.mjs` and every caller; `answerGo` posts at once (button « Envoi… », disabled, guarded by `sentGo`), « Jeter » calls `sortIdea(i, false, pick)` like « Garder ». CSS `.undo` styles go.

**Tech Stack:** plain JS panel, node --test, Playwright e2e/a11y.

**Spec:** docs/specs/450-supprimer-les-comptes-a-rebours-un-go-part-immediatement.md

## Global Constraints
- No « Annuler (Ns) », no « … part dans 5s » toast; the usual sent toast (« « go » envoyé. La construction démarre. ») stays.
- DESIGN.md no longer mentions the cancel delay; ADR records the decision.

## Review Focus
- Double touch / redraw right after the touch: the answer is posted once (`sentGo` guard) — e2e « part une seule fois ».
- GitHub refuses the post: toast « Envoi impossible » and the button is « Ok » / « go » again — existing ok-button test.
- Project switch right after the touch: the answer goes to the project it was given on — a11y panel-robust.
- « Jeter » after a GitHub refusal clears the red line at the touch — ideas.e2e refusal test.
- Keyboard Enter on « go » sends it — a11y panel-pending.

### Task 1: Immediate answers
**Files:** Modify `panel/app.mjs`, `panel/style.css`, `DESIGN.md`; delete `panel/countdown.mjs`, `test/panel-countdown.test.mjs`, `e2e/idea-undo.e2e.mjs`; create `e2e/no-countdown.e2e.mjs`, `docs/adr/0008-…`; update countdown assertions in `e2e/{ok-button,panel,yours-cards,ideas}.e2e.mjs`, `a11y/panel-{pending,robust}.a11y.mjs`.
- [x] Write `e2e/no-countdown.e2e.mjs` (one test per acceptance criterion), run, see it fail on main.
- [x] Remove the countdown in `answerGo` / `dropButton`, delete the module and `.undo` CSS.
- [x] Rewrite the old countdown tests; run `npm test`, `test:e2e`, `test:a11y`: all green.
- [x] Commit.
