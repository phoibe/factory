# « Oui pour tout » on the questions cards (issue #620) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task says « parallélisable » or « séquentielle (après la tâche N) ».

> **Size:** the request was classed « petite » at first read; it is now « moyenne », because it touches 4 code files (`panel/live.mjs`, `panel/pending.mjs`, `panel/screen-board.mjs`, `panel/style.css`), one more than the 3 a small request may touch. Hence this plan.

**Goal:** On a « Questions en cours » card, a blue « Oui pour tout » button posts « oui à tout » in one touch when the agent's latest message proposes it; « Répondre » stays beside it.

**Architecture:** The new button is a third kind of the existing « go » / « Ok » button, not a new flow: `yoursList` gives such a card `reply: 'all'`, and everything after the touch (« Envoi… », « Envoyé ✓ », toast, hold in « Prise en compte en cours… », error) is the code of « Ok ». Whether the button shows is decided by a pure function in `panel/live.mjs`, `yesToAllRound(comments)`, fed with the thread the board already reads for each card (already filtered by `trustNotes`): no extra GitHub request. Nothing changes in the agent, the relay or `scripts/`.

**Tech Stack:** Node 22 ESM, `node --test`, Playwright e2e (`e2e/fixture.mjs`: `withPanel`, `issue`, options `comments`, `viewport`, `device`, `writeDelay`, `forbidden`, `slowReads`, all existing), no-build vanilla panel. No dependency.

**Spec:** `docs/specs/620-bouton-oui-pour-tout-sur-les-cartes-de-questions.md`.

## Global Constraints

- Copy, verbatim: button `Oui pour tout`; comment posted `oui à tout`; toast `« oui à tout » envoyé. L'agent reprend avec vos réponses.`; states `Envoi…`, `Envoyé ✓`; quiet button `Répondre`; failure toast starts with `Envoi impossible`.
- Sends at the touch: no confirmation, no countdown (as « go » / « Ok », #450).
- The button shows only when the **agent's last message** matches `/«\s*oui à tout\s*»/i`. An agent message carries `<!-- factory-agent -->` and is not `untrusted`. On any other questions card: « Répondre » only.
- Also on the questions of a project's framing (`factory:project` + `factory:grilling`).
- « go » (spec) and « Ok » (captures, recette) cards do not change, whatever their thread says.
- One blue button per card, first, same line as « Répondre », at 1280 px and at 390 px; small card buttons (32 px visible, 44 px under the finger).
- TDD: each test is written and seen red before its code. Code, comments, commits in English; on-screen text French « vous ». Every commit also adds `.factory/journal`. Never edit `.factory/` (journal apart) nor `.claude/skills/`.

## Review Focus

- A message written by someone else that copies the agent's marker and the sentence « oui à tout » (public repo): no button (task 1 unit test, task 3 journey).
- Notes that arrive after the round without being a new message of the agent (phone alert `<!-- factory-notified -->`, session note `<!-- factory-session -->`, an estimate posted alone): the button stays; a spec or a new question ends the round (task 1).
- A second round of questions after an answered one: a fresh, enabled button, not a stale « Envoyé ✓ » (task 3, round id in `goKey`).
- A button that takes another one's place under the finger: « Répondre » replaced by « Oui pour tout » when the comments arrive late; the next card's button sliding up on a phone after the first touch (task 4).
- A thread of a « go » / « Ok » card that contains « oui à tout »: the card keeps its button and its word (task 1 unit test, task 3 journey).

---

### Task 1: which cards a plain « oui à tout » answers (`panel/live.mjs`) — parallélisable

**Files:** Modify `panel/live.mjs` (around `REPLIES` / `yoursList`), `test/panel-live.test.mjs`.

**Interfaces (produced):**
- `yesToAllRound(comments) -> string | null`: `comments` oldest first (`{ id, body, untrusted? }`); the id (as a string) of the agent's last message when it proposes « oui à tout », else `null`.
- `offersYesToAll(comments) -> boolean` (`yesToAllRound(comments) != null`).
- `yoursList(cards)`: a card `{ column: 'grilling', offersAll: <round id> }` gets `reply: 'all'`; `spec` → `'go'`, `visual` / `acceptance` → `'ok'`, anything else → `'open'`, unchanged.

- [ ] **Step 1: failing tests**, at the end of `test/panel-live.test.mjs` (4 tests, names start with `issue #620:`):
  - `yoursList`: grilling + `offersAll: '3546210987'` → `'all'`; grilling without → `'open'`; spec + `offersAll` → `'go'`; blocked + `offersAll` → `'open'`.
  - `offersYesToAll`: `[round]` → true; `[round, plain agent message]` → false; `[]` and `undefined` → false; `[round, factory-notified note]` → true; `[plain, same sentence without the marker]` → false; `[plain, { ...round, untrusted: true }]` → false; `[round, untrusted 'hello']` → true.
  - `yesToAllRound`: `[round(7)]` → `'7'`; `[round(7), owner's 'oui à tout' (8), round(9)]` → `'9'`; no agent message → `null`.
  - Not a new message: `[round, session note]` → `'7'`; `[round, lone estimate]` → `'7'`; round carrying an estimate (id 10) → `'10'`; `[round, spec with estimate]` → `null`; `[round, estimate + « quelle couleur ? »]` → `null`.
- [ ] **Step 2: red.** `node --test test/panel-live.test.mjs` → the 4 new tests fail (`yesToAllRound` is not exported).
- [ ] **Step 3: implement.** Walk the comments from the end; skip `untrusted`, those without the marker, and « not a message »: body with `<!-- factory-notified -->` or `<!-- factory-session -->`, or with `<!-- factory-estimate` and none of `<!-- factory-spec -->`, the « oui à tout » sentence, a `?`. Return `String(last.id ?? last.created_at ?? 'round')` when that last message matches, else `null`. `yoursList` maps through `replyFor(c)`.
- [ ] **Step 4: green.** Same command → 0 fail.

### Task 2: the button's words (`panel/pending.mjs`) — parallélisable

**Files:** Modify `panel/pending.mjs` (`goLabel`), `test/panel-pending.test.mjs`.

- [ ] **Step 1: failing test** `issue #620: the « oui à tout » button reads « Oui pour tout », then « Envoi… » and « Envoyé ✓ »`: `goLabel('oui à tout', {})` → `{ text: 'Oui pour tout', name: 'Oui pour tout' }`; `{ sending: true }` → `{ text: 'Envoi…', name: 'Envoi du oui à tout' }`; `{ sent: true }` → `{ text: 'Envoyé ✓', name: 'oui à tout envoyé' }`.
- [ ] **Step 2: red.** `node --test test/panel-pending.test.mjs` → 1 fail (text `go`).
- [ ] **Step 3:** a word → text table in `goLabel` (`ok` → `Ok`, `oui à tout` → `Oui pour tout`, default `go`). **Step 4: green.**

### Task 3: the button on the card (`panel/screen-board.mjs`) — séquentielle (après les tâches 1 et 2)

**Files:** Create `e2e/oui-pour-tout.e2e.mjs`. Modify `panel/screen-board.mjs`.

**Interfaces (consumed):** `yesToAllRound` (task 1), `goLabel('oui à tout')` (task 2).

- [ ] **Step 1: failing journeys** (issue #20 « Ajouter un compte », labels `factory:feature` + `factory:grilling`, one agent comment ending `Répondez par numéro (ex. « 1 oui, 2 non : … »), ou « oui à tout ».`):
  1. `la carte de questions montre « Oui pour tout » en bleu puis « Répondre »`, at 1280 px and 390 px: buttons `['Oui pour tout', 'Répondre']`, first child is `button.go`, `aria-label` `Oui pour tout pour #20 Ajouter un compte`, both on one line, nothing past the screen edge.
  2. `la carte de questions d'un nouveau projet montre aussi « Oui pour tout »` (`factory:project`).
  3. `ouvrir les questions avec « Répondre » laisse la carte dans « À vous de jouer »`: click « Répondre », come back (`focus`), no `.ticket.pending`, button still there.
  4. `« Oui pour tout » envoie « oui à tout » et la carte passe en prise en compte`: `Envoi…`, one POST on `/issues/20/comments` with body `oui à tout`, the toast verbatim, card in `.ticket.pending` with a disabled `Envoyé ✓`.
  5. `si l'envoi de « oui à tout » échoue, un message le dit et le bouton redevient utilisable` (`forbidden`).
  6. `sans « oui à tout » proposé par l'agent, la carte n'a que « Répondre »` (an open question; a round followed by a later agent message without it).
  7. `un message qui n'est pas de l'agent et propose « oui à tout » ne fait pas apparaître le bouton` (a stranger with the marker, association `NONE`; the owner's own words).
  8. `les cartes « go » et « Ok » n'ont pas changé`: threads holding the round sentence, buttons `['go']` and `['Ok', 'Captures']`, « go » posts `go`.
  9. `une nouvelle série de questions a un « Oui pour tout » neuf`: answer, agent runs, new round (comment id 3): the button is enabled again and posts a second `oui à tout`.
- [ ] **Step 2: red.** `node --test e2e/oui-pour-tout.e2e.mjs` (`npm ci` first if `node_modules/playwright` is missing; the cloud Chromium is found by itself) → 1 to 7 and 9 fail, 8 passes (it pins what must not move).
- [ ] **Step 3: implement**, all in `panel/screen-board.mjs`:
  - State: `live.yesToAll` (`Map` number → round id), added to `live`, `BOARD_KEYS` and `blankBoard()`. In `refresh()`, where each card's `thread` is read: store `yesToAllRound(thread)`, set `previewsChanged` when it differs. In `drawBoard()`: the card gets `offersAll: live.yesToAll.get(number)`.
  - Button: `GO_WORDS = { ok: 'ok', all: 'oui à tout' }` for `goWord`; `goText` from `goLabel`; class `go all` when `reply === 'all'`.
  - Order: `holdsAfterSend(c)` (`reply` is `'ok'` or `'all'`) replaces the `reply === 'ok'` checks in `answerButtons` (`[goButton, previewLink, replyLink]`), `isSent` and `sendGo` (the hold `{ column, clickedAt, backAt, sent: true }` in the pending state).
  - Keys: `goKey` ends with `:${c.offersAll}` when `reply === 'all'`, so that a new round is neither « sending » nor « sent ».
  - Toast: `SENT.grilling`, verbatim.
  - Reading: nothing to add, the click handler on a card's links already returns when the card holds a `button.go`; update its comment.
- [ ] **Step 4: green.** Same command → the 9 journeys pass. The journeys of the buttons it shares its code with: `node --test e2e/ok-button.e2e.mjs e2e/no-countdown.e2e.mjs e2e/yours-cards.e2e.mjs` → 0 fail.
- [ ] **Step 5: commit** (tasks 1, 2, 3 and 6 together) `Board: « Oui pour tout » answers a round of questions in one touch (#620)`.

### Task 4: no button changes place under the finger (`panel/screen-board.mjs`) — séquentielle (après la tâche 3)

**Files:** Modify `panel/screen-board.mjs`, `e2e/oui-pour-tout.e2e.mjs`.

- [ ] **Step 1: failing journeys.**
  - `avant la lecture des messages, la carte de questions ne montre aucun bouton de réponse (pas de « Répondre » qui laisse sa place)`: comments delayed 2500 ms (`slowReads`); the card has no answer button; a click where « Oui pour tout » will stand opens nothing and sends nothing; then the buttons are `['Oui pour tout', 'Répondre']`.
  - `sur téléphone, un second toucher au même endroit n'envoie pas la réponse de la carte suivante qui glisse sous le doigt` (390 px, touch, cards #20 and #21): tap #20, tap the same point again once #21's button is under it → nothing sent on #21; a third tap after it settled → `oui à tout` on #21.
- [ ] **Step 2: red.** `node --test --test-name-pattern="avant la lecture|sur téléphone" e2e/oui-pour-tout.e2e.mjs` → 2 fail.
- [ ] **Step 3: implement.**
  - `unread(c)`: `c.column === 'grilling' && !live.read.has(c.number)`; `card()` draws no `.card-actions` for it; `refresh()` asks for a redraw the first time a questions card's comments are read.
  - Tap guard: before each re-layout of the board (`drawBoard()`, and its delayed pass that removes the leaving cards), keep the rectangles of the `button.go[data-go]` (`goRects`) with `noteLayout(rects)`, valid for the slide (350 ms, 0 with reduced motion) + `SETTLE_MS = 600`. `justSlid(n, x, y)` is true when card `n`'s button was, in one of those layouts, farther than half its height from the press. `goButton`'s `onclick` ignores a pointer press (`e.detail > 0`) when `justSlid`; a keyboard press (`detail` 0) always answers; a button that did not exist before is never ignored.
- [ ] **Step 4: green.** Whole file → 0 fail (journey 9 waits 1 s before its second click, for the same reason).

### Task 5: one width, touch areas that do not overlap (`panel/style.css`) — séquentielle (après la tâche 3)

**Files:** Modify `panel/style.css` (rules `.ticket.yours .card-actions …` and `.ticket.pending .card-actions button.go`), `e2e/oui-pour-tout.e2e.mjs`.

- [ ] **Step 1: failing journeys.**
  - `« Oui pour tout » garde sa largeur d'un état à l'autre, avec la même marge que « go » et « Ok »`: at least 12 px between the label and each inner edge; same width for `Oui pour tout`, `Envoi…` and `Envoyé ✓` (the last one on the pending card).
  - `les zones de toucher de « Oui pour tout » et « Répondre » ne se chevauchent pas`, at 1280 px and 390 px: right edge of the first `::after` ≤ left edge of the second.
- [ ] **Step 2: red** (`--test-name-pattern="largeur|zones de toucher"`).
- [ ] **Step 3: implement.** `button.go.all` gets `min-width: 9em` on `.ticket.yours` and `.ticket.pending` cards; the blue button's `padding-inline` goes from 8 px to 12 px; the `::after` touch area goes from `inset: -7px -5px` to `-7px -4px` (two areas meet in the middle of the 8 px gap).
- [ ] **Step 4: green** (the vertical inset is untouched: still 44 px under the finger), then `node --test e2e/yours-cards.e2e.mjs e2e/ok-button.e2e.mjs` → 0 fail. **Step 5: commit** (tasks 4 and 5) `Board: « Oui pour tout » fixes from the design critique and code review (#620)`.

### Task 6: `DESIGN.md` — parallélisable

- [ ] « Bleu signal » and « The One Voice Rule »: « Oui pour tout » joins « go » and « Ok » as the blue button of a card « À vous ».
- [ ] « Section « À vous de jouer » »: at most one blue button (« go », « Ok » or « Oui pour tout »), « Répondre » beside it; shown only when the agent's last message proposes « oui à tout »; no answer button until the card's messages are read; a card that shows it stays in « À vous de jouer » when opened with « Répondre », a questions card without it goes on hold as before.
- [ ] « « go » immédiat »: « Oui pour tout » (#620) sends at the touch; a touch on a blue button that a move of the cards just brought under the finger (less than 0.6 s after it arrived) is ignored.
- [ ] « Boutons des cartes »: add « Oui pour tout » and « Répondre » to the list of small buttons.

### Task 7: final verification — séquentielle (après les tâches 1 à 6)

```bash
npm run typecheck && npm run lint && npm run build
npm test 2>&1 | tail -8          # 0 fail, 1781 pass (1776 before + 5)
node --test e2e/oui-pour-tout.e2e.mjs   # 13 pass
npm run test:e2e 2>&1 | tail -8 && npm run test:a11y 2>&1 | tail -8   # 0 fail
git status --short               # nothing under .factory/ except .factory/journal/, nothing under .claude/ (the design critique is kept in .impeccable/critique/)
```

- [ ] Spec, « Comment vérifier » 1 to 5: journeys 1, 3, 4, 6 and 8 of task 3. What only a real request can show (the relay starting the agent on the posted « oui à tout ») goes in the PR as « Pas vérifié en vrai ».
- [ ] For each finding accepted from the final review: failing test first, fix, green; then this task again.
