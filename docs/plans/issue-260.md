# « Agent » tab Implementation Plan

> Executed inline by the factory build run (the change was small: one entry point removed, one label renamed).

**Goal:** Remove « Discuter avec l'agent » from the « Plus » menu and rename the « Discussion » tab to « Agent ».

**Architecture:** Static panel markup (`panel/index.html`) plus its click wiring (`panel/app.mjs`). The « Plus » menu is rebuilt from `[data-menu]` nodes, so removing the button removes it everywhere.

**Tech Stack:** Plain JS modules, `node --test`, Playwright journeys in `e2e/`.

**Spec:** issue #260, comment `<!-- factory-spec -->` version 1.

## Global Constraints

- Tabs read exactly « Suivi », « Agent », « Paramètres », in that order; the tab keeps its unread badge.
- The other « Plus » buttons keep their order.
- The default title of an untitled conversation stays « Discussion ».

## Review Focus

- The badge number alone (« Agent 1 ») means nothing to a screen reader: describe it as « 1 nouvelle réponse » (test in Task 2).
- A leftover reference to the removed `#new-question` element would throw at load and blank the panel (covered by every e2e journey).

---

### Task 1: Remove the button, rename the tab

**Files:** Modify `panel/index.html` (`#new-question`, `#tab-chat`), `panel/app.mjs` (`new-question` listener); Test `e2e/agent-tab.e2e.mjs`; update `e2e/settings-tab.e2e.mjs`, `a11y/panel.a11y.mjs`, docs naming the tab (`STACK.md`, `agent/stages/question.md`, server comments).

- [x] Write one journey per acceptance criterion: « Plus » items are `['Signaler un bug', 'Cadrer le projet', 'Review générale', 'Stack technique']`; tabs `['Suivi', 'Agent', 'Paramètres']`; « Nouvelle conversation » clears `.conv.current` and shows `.chat-intro`; badge visible on `#tab-chat`.
- [x] Run `npm run test:e2e`: the 4 journeys fail.
- [x] Delete the button and its listener, rename the label.
- [x] Run `npm run test:e2e`, `npm test`, `npm run test:a11y`: all pass. Commit.

### Task 2: Spoken badge

**Files:** Modify `panel/index.html` (`aria-describedby="chat-badge-label"` on `#tab-chat`, hidden `#chat-badge-label`), `panel/app.mjs` (`drawChatList` fills it); Test `e2e/agent-tab.e2e.mjs`.

- [x] Journey: with one unread answer, the tab's description reads `1 nouvelle réponse`. Run: fails with `''`.
- [x] Fill `#chat-badge-label` with « n nouvelle(s) réponse(s) » or empty; mark the visual badge `aria-hidden`.
- [x] Run all suites: pass. Commit.
