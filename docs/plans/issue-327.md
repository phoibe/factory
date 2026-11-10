# Faster project switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switching project on the board is near instant: a project already opened in this tab shows from memory, a first open shows the cards from the project-list background data, then refreshes silently.

**Architecture:** All in `panel/app.mjs`. One ETag map shared by the board and the project dots (so a first open reuses the dots' answers). Per-project board state (`boards` Map, tab memory only) saved on leave and restored on return. `refresh()` sends its first wave of requests together, draws as soon as the request list is known, then reads card comments 8 at a time.

**Tech Stack:** browser ES modules, Playwright journeys in `e2e/`.

**Spec:** issue #327, comment `<!-- factory-spec -->` version 1.

## Global Constraints
- Memory lasts only while the tab is open (no localStorage for boards).
- No visible "mise à jour…" indicator during the silent check.
- No change of appearance of cards, lanes or the project list.
- After fast clicks the board always shows the last clicked project, never a mix.
- Return to an opened project: cards < 250 ms. First open: cards < 1 s, details < 3 s (~20 cards).

## Review Focus
- A late answer from a project left meanwhile writes into the new project's state (comment maps): guard every write with `live.repo === repo`.
- Card numbers collide across projects (#3 in A and in B): a restored draw must never reuse or FLIP-animate the other project's nodes.
- Logout must forget every remembered board and ETag.
- A refresh of the left project still in flight must not delay the new project's first refresh.
- Seeded first draw has no « Terminé » data yet: it must not claim « Rien de livré ».

---

### Task 1: Journeys that measure the switch (fail first)
**Files:** Create `e2e/fast-switch.e2e.mjs`
- [ ] Tests: « en revenant sur un projet déjà ouvert, ses cartes et leurs détails sont là en moins d'un quart de seconde » (slow repo 1500 ms; return measured with `performance.now()`); « à la première ouverture d'un projet, ses cartes apparaissent en moins d'une seconde et leurs détails en moins de trois » (20 cards with estimate comments, other project seeded by the dots); « après un rechargement de la page, aucun ancien état n'est affiché »; « une demande changée pendant l'absence se met à jour seule au retour ».
- [ ] Run `npm run test:e2e` → new tests FAIL.

### Task 2: Shared ETags, remembered boards, parallel first wave
**Files:** Modify `panel/app.mjs` (`refreshDots`, `openProject`, `refresh`, `renderBoard`, `drawBoard`, logout paths)
- [ ] `etags` (single Map) replaces `dotEtags` and `live.etags`.
- [ ] `boards: Map<repo, state>`; `enterBoard(repo)` saves the left project, restores or seeds (`seedFromDots(repo)` from the cached open-issues pages), clears the board, draws without entrance animation (`live.instant`).
- [ ] `refresh()`: per-run token instead of boolean `busy`; open issues + closed PRs + closed issues + events page 1 with `Promise.all`; draw right after; then events pages 2–3, release list and comments (`mapLimit(…, 8)`) together; redraw if details changed.
- [ ] Run `npm test` and `npm run test:e2e` → PASS. Commit.
