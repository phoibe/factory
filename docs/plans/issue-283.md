# Agent tab badge while away Implementation Plan

> **For agentic workers:** executed inline (executing-plans). Steps use checkbox syntax.

**Goal:** the « Agent » tab badge lights up when an answer arrives while the owner is on « Suivi » or « Paramètres », in both chat modes.

**Architecture:** the chat poll (`refreshChat`/`scheduleChat` in `panel/app.mjs`) keeps running while the Agent panel is hidden (4 s while an answer is awaited, 30 s otherwise); a conversation is marked seen only while the Agent panel is visible. Instant mode (chat server) gets the same seen map, keyed by conversation id with the `updated` time last shown.

**Tech Stack:** plain browser modules, node --test, Playwright journeys in `e2e/`.

**Spec:** issue #283, comment `<!-- factory-spec -->` version 1.

## Global Constraints
- Badge look unchanged: the count of open conversations with an unread answer; finished ones never count.
- Only the project on screen. No browser-title count (ADR 0002), no sound, no system notification.

## Review Focus
- Owner leaves the Agent tab with the awaited conversation open: it must not be marked seen in the background.
- Coming back with another conversation open keeps the badge; opening the answered one clears it.
- Instant mode: answer finishing while on Agent → no badge; while away → badge.
- A brand new conversation in instant mode (never seen before) still lights the badge when its first answer ends away.
- Switching project resets polling to the new project only.

---

### Task 1: `serverUnread(c, seen)` in `panel/chat.mjs`
- Test (`test/panel-chat.test.mjs`): never seen → false; `updated` later than `seen[id]` → true; equal → false; closed → still computed by caller (caller filters open).
- Implement: `seen[c.id] != null && Date.parse(c.updated) > Date.parse(seen[c.id])`.

### Task 2: background polling and seen-only-when-shown (`panel/app.mjs`)
- e2e (`e2e/agent-badge.e2e.mjs`): write in conversation 7, go to « Suivi », the fake GitHub adds an agent comment → badge « 1 » appears; back on « Agent » with 7 open → badge gone; variant opening another conversation first → badge stays and row shows « Nouvelle réponse ».
- Fixture: serve `/repos/o/r/issues/<n>` from `issues`.
- `scheduleChat`: when the Agent panel is hidden, poll at 4 s if waiting else 30 s (server mode: 30 s). `selectTab` reschedules instead of stopping. `resetChat` starts the background poll. `markSeen` only when the Agent panel is visible.

### Task 3: instant mode badge
- e2e: fixture option `chatServer` (serves `chat-server.json`, answers `POST /chat` after a delay, serves the chat branch index). Leave for « Paramètres » during the answer → badge; stay on « Agent » → no badge.
- `drawChatList` counts `serverUnread` in server mode; seen set to the entry's `updated` when shown while visible; on `done` away from the tab, seen of a new conversation is set to the send time.
