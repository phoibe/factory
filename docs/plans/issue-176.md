# Keep action buttons on waiting cards — Implementation Plan

> **For agentic workers:** executed inline with executing-plans (single small task).

**Goal:** A card in « Prise en compte en cours… » keeps its rectangular ticket shape and status line « En attente de GitHub », and also shows the same actions as in « À vous de jouer » (preview link, reply link or « go » button), in neutral colours.

**Architecture:** `panel/app.mjs` `card()` already renders the waiting ticket. Extract the reply action used by `youCard()` into `replyAction(c)` and reuse it in `card()` for the `pending` lane, together with the preview link and the « Bloqué » tag / skills alert. The click listener that records a click also matches `.ticket.pending[data-number]`, so a new click restarts the 2-minute wait. CSS turns the « go » button grey in the waiting zone.

**Tech Stack:** vanilla JS modules, node --test, Playwright a11y tests.

**Spec:** issue #176, comment `<!-- factory-spec -->` version 1.

## Global Constraints
- No blue in the waiting zone (no `--accent`/`--you` colours); only DESIGN.md tokens.
- Status text stays exactly « En attente de GitHub »; title stays plain text.
- « go » keeps its 5 s cancellable countdown.
- Other lanes and « À vous de jouer » unchanged; wait stays 2 minutes.

## Review Focus
- Re-clicking « Répondre » on a waiting card must restart the wait (card returns to « À vous » until back, then waits 2 more minutes).
- A « go » countdown started on a waiting card must survive the 5 s redraws (button found by `data-go`).
- A blocked waiting card shows the red « Bloqué » tag.
- The « go » button in the waiting zone must not be blue, including focus/hover.
- Buttons stay ≥ 44 px tall (accessibility).

---

### Task 1: Actions on waiting cards

**Files:**
- Modify: `panel/app.mjs` (`card`, `youCard`, click listener)
- Modify: `panel/style.css` (`.ticket.pending` rules)
- Test: `a11y/panel-pending.a11y.mjs`

- [ ] Step 1: In the a11y test, replace the « no link or button in the zone » assertion with: the waiting card for #2 has one `a.button` named « Répondre » with href `http://x/2`, the zone text still contains « En attente de GitHub », and the `.pending-zone button.go` background is not the accent colour. Add a second plate with `factory:spec-review` (go) put on hold via its preview… (go plates have no reply link: use plate 1, opened via its title? title of go plate is excluded) — instead click « Répondre » again on the waiting card #2 and check it returns to « À vous » until focus, then waits again.
- [ ] Step 2: Run `npm run test:a11y` → FAIL (no button in zone).
- [ ] Step 3: Implement `replyAction(c)` (returns the go `<button>` or the reply `<a class="button secondary">`), use it in `youCard` and in `card` when `lane === 'pending'`; show the preview there; add `blocked-tag` « Bloqué » and the skills alert for pending cards; extend the click listener to `.ticket.pending[data-number]`; CSS grey `go`.
- [ ] Step 4: Run `npm run test:a11y` and `npm test` → PASS.
- [ ] Step 5: Commit.
