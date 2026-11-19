# Request card right away in both chats — Implementation Plan

> Medium request (it grew past 3 source files): executed inline, in one go (executing-plans).

**Goal:** both chat agents answer, then show the `<creer-issue>` card right away, without asking « Voulez-vous une fiche ? » first.

**Architecture:** the Agent tab follows `agent/stages/question.md`; the board chat follows the `SYSTEM`/`ASK_BLOCK` prompt of `server/chat/core.py`. The board agent has no issue access (read-only token, contents only), so the panel sends the board's open requests with each message and the server lists them in the prompt.

**Spec:** `docs/specs/506-afficher-directement-la-carte-de-demande-sans-demander-voule.md`

## Global Constraints

- Never create an issue from the agent: only a card, created by the owner's click.
- One card per subject (not re-proposed once shown, unless re-requested or a correction is asked); no card for a mere question; at most 3 cards per answer.
- Always check open requests first; if one covers the subject, say so instead of a card.
- The chat server never gets more than the read-only token; listing the open requests must never break an answer.

## Review Focus

- Private project: the read-only token cannot list issues → the panel sends them (`openRequests` in the POST body).
- Body without / with a malformed `openRequests` → the prompt says the list is unavailable, the answer still comes.
- Pull requests and `factory:question` chats (including the current one) are never counted as duplicates.
- Issue titles from strangers on a public project → truncated to 150 characters, labelled as data, not instructions.
- A card ignored, then explicitly requested again → the agent proposes it.

---

### Task 1: Agent tab rule

**Files:** Modify `agent/stages/question.md` (point 4); Test `test/question-stage.test.mjs`.

- [x] Failing test: no « voulez-vous … fiche », « directement », « simple question », « ne la repropose pas », « sauf s'il la redemande », jq filter `select(.pull_request | not)` and `factory:question`.
- [x] Rewrite point 4; run `npm test`.

### Task 2: Board chat prompt

**Files:** Modify `server/chat/core.py` (`SYSTEM`, `ASK_BLOCK`, `build_prompt(conv, message, image_files, open_requests=None)`); Test `server/chat/test_core.py`.

- [x] Failing tests: no « voulez-vous »; list section « Demandes déjà ouvertes » with `n° <number> : <title[:150]>`, « aucune » when empty, « indisponible » when `None`.
- [x] Implement; run `python -m unittest discover -s server/chat`.

### Task 3: Panel sends the open requests

**Files:** Modify `panel/chat.mjs` (`openRequests(issues) -> [{number, title}] | null`, at most 200, no PR, no `factory:question`), `panel/app.mjs` (`boardRequests(repo)`, POST body `openRequests`), `server/chat/service.py` (validate body list, `MAX_OPEN_REQUESTS = 200`), `panel/index.html` (cache bump); Tests `test/panel-chat.test.mjs`, `server/chat/test_service.py`, `e2e/card-right-away.e2e.mjs` (+ `e2e/fixture.mjs` records `openRequests`).

- [x] Failing tests (unit, service, e2e journeys named after the spec's checks).
- [x] Implement; run `npm test`, the Python tests and `npm run test:e2e`.
