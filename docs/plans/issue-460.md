# Agent tab comfort (issue #460) Implementation Plan

> **For agentic workers:** executed inline (medium request, `executing-plans`).

**Goal:** make the « Agent » tab comfortable: copy buttons, coloured callouts, full width and exact height, readable waiting, image zoom, distinct owner messages, a faster question agent.

**Architecture:** pure helpers in `panel/chat.mjs` (tested by `test/panel-chat.test.mjs`), DOM in `panel/app.mjs`, look in `panel/style.css`, one `<dialog>` in `panel/index.html`. Speed: shorter `agent/stages/question.md` and the callout rule in both agent prompts (`agent/stages/question.md`, `server/chat/core.py`).

**Tech Stack:** plain ES modules, node --test, Playwright journeys (`e2e/agent-comfort.e2e.mjs`).

**Spec:** issue #460, comment `<!-- factory-spec -->` (version 1) → `docs/specs/460-*.md`.

## Global Constraints
- Copy feedback: « Copié ✓ », failure « Copie impossible ».
- Waiting line: « Réfléchit… 0:42 » + « d'habitude, environ 1 à 2 min »; timer restarts at each message, gone with the answer.
- Callouts only for lines starting with ⚠️ (orange), ✅ (green), ➡️ (blue); readable in light and dark; no coloured side border (DESIGN.md).
- Only the Agent tab goes full width; other tabs unchanged. Answers capped for reading comfort.
- Composer always visible (desktop, short window, phone).

## Review Focus
- A ⚠️ inside a sentence (not at line start) must stay plain text.
- A code block inside a callout-looking answer: the copy button copies only the code, not the button label.
- Clipboard refused (insecure context / permission): « Copie impossible », never a silent failure.
- Window resized or header wrapping onto two lines: the composer stays on screen.
- Timer must not keep ticking after the answer arrives or the conversation changes.

---

### Task 1: pure helpers (chat.mjs)
**Files:** `panel/chat.mjs`, `test/panel-chat.test.mjs`
**Produces:**
- `markdown(text)` emits `{ type: 'callout', tone: 'warn'|'ok'|'todo', inline }` for a paragraph whose first line starts with ⚠️ / ✅ / ➡️ (emoji kept in the text).
- `elapsed(ms) -> 'm:ss'` (negative → `0:00`).
- `waitingSince(messages) -> iso|null`: `at` of the last owner message when it is the last message.
- Tests first: callout tones, mid-sentence emoji stays a `p`, `elapsed(42000) === '0:42'`, `elapsed(125000) === '2:05'`.

### Task 2: page (app.mjs, index.html, style.css)
- Code block → `.code` wrapper with a « Copier » button (top right); agent message → « Copier la réponse » button under it; shared `copyText(btn, text)` showing « Copié ✓ » / « Copie impossible » for 2 s.
- Thinking line: `<span data-since=iso>` refreshed every second by one interval, text `Réfléchit… m:ss · d'habitude, environ 1 à 2 min`.
- Image click → `dialog#lightbox` (`showModal`), Esc or click outside the image closes.
- Owner bubble: soft blue (`--you-bg`, `--you-line`); agent: no bubble, full conversation width.
- `body.chat-wide` while the Agent tab is shown: `main` max-width none; messages column capped at 860 px and centred.
- Height: `--chat-top` set from `#chat` top (on tab open, resize, ResizeObserver on `.top`/`.project-head`), `#chat` height `calc(100dvh - var(--chat-top) - 16px)`, min 320 px.
- Callout CSS: `.callout.warn|ok|todo` tinted background + 1px border, new orange tokens in light/dark.
- Journeys `e2e/agent-comfort.e2e.mjs`, one per checkable criterion of the spec.

### Task 3: agent speed + docs
- `agent/stages/question.md`: shorter, read only what serves the question, callout rule; `server/chat/core.py` SYSTEM: callout rule. Regenerate `.factory/` via `node scripts/sync.mjs` if it is the project's way.
- `DESIGN.md`: callout colours, owner bubble, full-width Agent tab as assumed exceptions.
