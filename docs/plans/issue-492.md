# Confirm agent-proposed requests Implementation Plan

> **For agentic workers:** executed inline (medium request, `executing-plans`).

**Goal:** a bug or feature the chat agent proposes is only created after the owner clicks « Créer cette demande » on a card under the answer.

**Architecture:** both chat modes keep the agent's proposals as data on the agent message instead of creating issues. Server mode stores `proposals` on the agent message in `chats/<id>.json` and updates its `state` when the owner decides. Fallback (issue) mode: the question-stage agent writes `<creer-issue>` blocks in its comment (same format as the chat server); the panel parses them and records each decision as a hidden agent-marked comment (`<!-- factory-proposal: <id> created <url> -->`), which the relay ignores (agent marker) and the chat hides (empty once markers are stripped).

**Tech Stack:** plain JS modules (panel), Python (chat server), node --test, Playwright e2e.

**Spec:** issue #492, comment `<!-- factory-spec -->` (version 1).

## Global Constraints
- Nothing is created without the owner's click; one click creates at most one request.
- Card copy: « Créer cette demande », « Ignorer », « Créée », « Ignorée ». No editing in the card.
- Once created: `issueRequest` as today (bug starts, feature joins the queue with `factory:kept`).
- Max 3 proposals per answer (`wantedIssues`).

## Review Focus
- Double click / two devices: the button is disabled while creating; server mode re-reads the stored state before creating.
- Creation fails: the card says so and keeps « Créer cette demande ».
- Old conversations with `issues` (already created) still show their « créée » chips.
- A stranger's comment can never carry a proposal or a decision (`fromStranger` filter, agent marker required).
- A proposal block in the issue text is never shown as raw text.

---

### Task 1: pure helpers in `panel/chat.mjs` (test: `test/panel-chat.test.mjs`)
- `proposalsFrom(text) -> { text, proposals: [{kind,title,body}] }` (same regex as `server/chat/core.py`, max 3).
- `chatMessages`: agent comments get `proposals: [{ id: '<commentId>-<i>', kind, title, body, state, url? }]`; decisions read from agent-marked comments `<!-- factory-proposal: <id> created|ignored [url] -->`.
- `decisionComment(id, state, url)`; `addExchange(conv, mine, answer, now, proposals)` stores `proposals` with `state: 'pending'` and an id; `decideProposal(conv, id, state, url) -> conv`; `serverMessages` passes `proposals` through.

### Task 2: panel UI (`panel/app.mjs`, `panel/style.css`; e2e `e2e/confirm-request.e2e.mjs`)
- `finishExchange` no longer creates issues; saves proposals.
- `bubble` renders a `proposal-card` per proposal: kind, title, `<details>` with the text, buttons or the outcome.
- `decide(p, state)`: creates via `issueRequest` (server: re-read the file first, skip if not pending), records the decision, redraws; error → toast + card message, button back.

### Task 3: agent instructions
- `agent/stages/question.md` and `server/chat/core.py` (`ASK_BLOCK`): the agent proposes with a `<creer-issue>` block, never creates, never closes the conversation for it; update tests.
