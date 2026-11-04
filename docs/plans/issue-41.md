# Issue 41 — new panel design (Atelier monochrome)

**Goal:** apply DESIGN.md to every panel screen; add the « À vous » card with a « go » button.

**Spec:** issue #41 (spec version 1). No function added or removed except the card's go shortcut.

## Task 1: pure helper `yoursList` (TDD)
- Test: `test/panel-live.test.mjs` — oldest first, `reply: 'go'` only for the spec step, others `'open'`, running items excluded.
- Code: `yoursList(cards)` in `panel/live.mjs`.

## Task 2: « À vous » card and quiet buttons
- `panel/app.mjs` drawBoard: card on top, go button posts `go` on the issue.
- `panel/style.css`: only go + send are blue; mono numbers; Geist embedded (`panel/fonts/`), CSP `font-src 'self'`.

## Task 3: verify
- tests, a11y contrast light/dark, phone + desktop screenshots.
