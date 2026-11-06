# « À vous de jouer » as cards — Implementation Plan

> **For agentic workers:** executed inline (executing-plans) by the factory agent.

**Goal:** Render the « À vous de jouer » items as the same `.ticket` cards as the other lanes, tinted soft blue.

**Architecture:** `youCard()` in `panel/app.mjs` returns, when something waits, a `section.lane.lane-yours.you-card` with an `h2` « À vous de jouer » + `.count`, the live status line, and a `.tickets` grid of `card(c, 'yours', …)`. `card()` gains, for the `yours` lane, the « Bloqué » tag and a `.card-actions` row built by `answerButtons` (blue button first). The calm state (nothing waits) is unchanged.

**Tech Stack:** plain JS modules, CSS, node --test + Playwright (e2e/a11y).

**Spec:** issue #269, comment `<!-- factory-spec -->` version 1.

## Global Constraints

- Colours only from `DESIGN.md` (`--you-bg`, `--you-line`, `--danger`, `--danger-bg`); one blue button per card.
- Order unchanged (oldest first, from `yoursList`); tab title counter unchanged.
- Buttons and their behaviour unchanged (« go »/« Ok » → « Prise en compte en cours… »).
- No explanatory text added.

## Review Focus

- A blocked card in « À vous » shows the red card and « Bloqué » (no running agent).
- A spec card shows « go » before « Voir l'aperçu » (blue first).
- Clicking a link of a card without a go button still moves it to « Prise en compte en cours… » (click listener selector).
- Board redraw reuses unchanged « À vous » cards without losing a running « Annuler (n s) ».
- Phone width: one card per line, no horizontal scroll.

---

### Task 1: cards in « À vous de jouer »

**Files:** Modify `panel/app.mjs` (`card`, `answerButtons`, `youCard`, click listener), `panel/style.css` (yours lane), `DESIGN.md` (carte « À vous » component); Test: `e2e/ok-button.e2e.mjs`, `e2e/yours-cards.e2e.mjs` (new), `a11y/panel-pending.a11y.mjs`, `a11y/panel-robust.a11y.mjs`.

- [ ] Step 1: switch the existing tests from `.you-item` to `.ticket.yours`; add `e2e/yours-cards.e2e.mjs` (one test per acceptance criterion: heading + count, card content, three per line on desktop / one on phone, oldest first, go → pending, blocked card red with « Bloqué », calm message).
- [ ] Step 2: run `npm run test:e2e` — expect FAIL.
- [ ] Step 3: implement in `panel/app.mjs` and `panel/style.css`.
- [ ] Step 4: run `npm test`, `npm run test:e2e`, `npm run test:a11y` — expect PASS.
- [ ] Step 5: commit.
