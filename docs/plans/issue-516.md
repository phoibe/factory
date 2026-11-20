# End a chat conversation once its request is created — Implementation Plan

> Small request grown to 4 code files (panel/app.mjs, panel/chat.mjs, panel/style.css, panel/index.html): plan written
> after the fact, as the factory requires, and executed in one go.

**Goal:** a conversation of the « Agent » tab closes itself once every card is decided and at least one request was created.

**Architecture:** a pure rule in `panel/chat.mjs`; `decide()` in `panel/app.mjs` applies it after recording a choice and
calls the existing « Terminer » path (`closeConversation`) with `stay` (the conversation stays on screen) and its toast.

**Spec:** docs/specs/516-terminer-la-conversation-quand-sa-demande-est-creee.md

## Global Constraints
- Toast text: « Demande créée, conversation rangée dans « Terminées » ». Notice unchanged: « Conversation terminée. Écrivez un message pour la reprendre. »
- Both chat modes (chat server / `factory:question` issue). « Terminer » keeps working by hand.

## Review Focus
- An answer still on its way (it may bring new cards): never close then.
- Two cards decided at the same time: one close only.
- The owner switched conversation or project during the click: nothing closes.
- The choice could not be recorded: nothing closes.
- The toast must not cover the message box.

### Task 1: the rule
**Files:** `panel/chat.mjs`, test `test/panel-proposals.test.mjs`
- [x] Failing test `finishesConversation: every card decided and at least one request created` (created → true; created+ignored → true; created+pending → false; ignored only → false; [] and undefined → false).
- [x] `export const finishesConversation = (cards = []) => boolean`.

### Task 2: close after the last choice
**Files:** `panel/app.mjs`, `panel/index.html` (cache versions), `panel/style.css` (toast above the message box on the Agent tab), test `e2e/finish-conversation.e2e.mjs`
- [x] Failing journeys: single card created → closed + toast + notice; two cards (create then ignore) → closed only after the second; ignore only → open; issue mode → PATCH closed, stays on screen; answer in progress → not closed; « Terminer » by hand still works.
- [x] `conversationCards(open, decided)`, `answering()`; in `decide()` compute `finish` after a recorded choice (`here()`, not `answering()`, no other card of it being decided), then `closeConversation({ stay: true, said })`.
- [x] `closeServerConversation(id)` through `writeChatFile`; local list / issue marked closed at once.
- [x] `npm test`, `npm run test:e2e`, `test:a11y`, lint, typecheck, build green.
