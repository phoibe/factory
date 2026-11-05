# Issue 165 — show at most 9 finished features

**Goal:** the « Terminé » lane shows the 9 most recent finished items; the counter keeps the real total; a discreet note says how many older ones are hidden.

**Spec:** comment `factory-spec` on issue #165.

### Task 1: pure helpers (`panel/lib.mjs`, `test/panel-lib.test.mjs`)
- [ ] Test: `doneItems(pulls)` keeps every merged request (no cap), newest first.
- [ ] Test: `doneView(done)` -> `{ shown, hidden }`, `shown.length <= DONE_SHOWN (9)`; 9 or fewer -> `hidden === 0`; 14 -> 9 shown, 5 hidden.
- [ ] Test: `olderNote(n)` -> `''` for 0, `'+ 1 plus ancienne non affichée'`, `'+ 5 plus anciennes non affichées'`.
- [ ] Implement, run `npm test`.

### Task 2: panel (`panel/app.mjs`, `panel/style.css`)
- [ ] Counter = `live.done.length`; cards = `doneView(live.done).shown`; note `<p class="done-more">` under the cards when hidden > 0. Bump `lib.mjs?v=`.
- [ ] Run typecheck, lint, test, build.
