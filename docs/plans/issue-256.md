# Ideas to sort: a card leaves at the click — Implementation Plan

> **For agentic workers:** executed inline (superpowers:executing-plans) in the factory build run. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In « Idées à trier », « Garder » / « Jeter » removes the card at once, the others slide up, GitHub is told in the background, and a refusal brings the card back in place with a red line.

**Architecture:** The panel keeps, per project, a map of ideas being sorted (`'sending'` then `'sent'`) and a set of refused ones. A pure helper decides which ideas are shown and which sorted ones GitHub has caught up with. The card fades (0.2 s) before the board is redrawn; idea cards then slide with a small FLIP of their own (they have no `data-number`, so the board FLIP ignores them).

**Tech Stack:** dependency-free browser JS (panel/), `node --test`, Playwright e2e/a11y.

**Spec:** issue #256, comment `<!-- factory-spec -->` « Spec (version 1) ».

## Global Constraints

- Fade about 0.2 s; instant under `prefers-reduced-motion`.
- No confirmation toast, except « Idée gardée. Écrivez dedans pour la lancer. » after « Garder » when `config.autoPick !== true`.
- Refusal line, verbatim: « GitHub a refusé : réessayez. » in `var(--danger)` (no new colour, DESIGN.md).
- Bump `?v=` of every changed panel module/stylesheet.

## Review Focus

- A poll answered before GitHub caught up must not bring a sorted card back → unit test on `ideasToShow` (Task 1).
- Switching project while a write is in flight must not hide or mark another project's idea of the same number → state keyed by repo (Task 2).
- A refusal on one card must not touch other cards in flight → e2e « un refus sur une carte ne touche pas les autres cartes en cours » (Task 3).
- The last idea refused must bring the section back with its count → e2e (Task 3).
- Screen-reader users must hear the refusal → `role="alert"` + `aria-describedby` asserted in e2e (Task 3).

---

### Task 1: `ideasToShow`

**Files:** Modify `panel/lib.mjs` · Test `test/panel-lib.test.mjs`

**Interfaces:** Produces `ideasToShow(ideas: Issue[], sorting: Map<number, 'sending'|'sent'>) → { shown: Issue[], settled: number[] }`.

- [x] Test « ideasToShow hides the ideas being sorted and forgets those GitHub no longer lists »: sorting `{6:'sending', 8:'sending', 7:'sent', 9:'sent'}` over ideas 5,6,7 → `shown` = [5], `settled` = [9].
- [x] Run `node --test test/panel-lib.test.mjs` → FAIL (not exported); implement; → PASS.

### Task 2: leave at the click, background write, refusal

**Files:** Modify `panel/app.mjs` (`ideasLane`, `leaveIdea`, `sortIdea`, ideas part of `drawBoard`), `panel/style.css` (`.idea-error`), `panel/index.html` (`?v=`).

**Interfaces:** Consumes `ideasToShow`. State: `sortingIdea(repo)`, `refusedIdea(repo)`, `ideaFocus`.

- [x] e2e journeys first (Task 3), seen failing.
- [x] Click: clear refusal, mark `'sending'`, fade + count drop, then redraw and slide; focus goes to the same button on the next card.
- [x] Success: `'sent'`, `refresh()` if still on that project. Failure: forget the sort, mark refused, hide the keep reminder, redraw.

### Task 3: e2e journeys

**Files:** Create `e2e/ideas.e2e.mjs` · Modify `e2e/fixture.mjs` (`config`, `writeDelay`, `failing` for writes) · `a11y/panel-ideas.a11y.mjs` (wait for the background write).

- [x] One test per spec checkbox (French names), plus the two refusal edge cases above.
- [x] `CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 npm run test:e2e` → all pass.

### Task 4: review and design pass

- [x] Fresh code review, fixes, second review.
- [ ] impeccable critique of the ideas lane, fixes, before/after shots.
