# Issue 52 — smoother board (implementation plan)

**Goal:** poll every 8 s (30 s when idle for 2 min, paused when hidden, backoff kept), patch only changed cards, animate enter / leave / move / reorder, honour prefers-reduced-motion.

**Spec:** issue #52, comment `factory-spec` version 1.

## Task 1 — pure helpers (panel/live.mjs, test/panel-live.test.mjs)
- `pollDelay(failures, idle = false)`: base 8 000 ms (30 000 idle), doubled per failure, max 300 000.
- `isIdle(lastActivity, now)`: true after 120 000 ms without activity.
- `cardChanges(prev, next)`: Maps number -> signature, returns `{ added, removed, changed }` (number arrays).
- Tests first, see them fail, then implement.

## Task 2 — in-place board update (panel/app.mjs, panel/style.css)
- Cards carry `data-number` and `data-sig`; unchanged cards keep their DOM node, changed ones are swapped, new ones fade in, removed ones fade then collapse.
- FLIP slide (Web Animations API) for moved/reordered cards; fade instead when old or new place is off-screen.
- Activity tracking (pointer, key, scroll, visibility) switches idle/active polling.
- No animation when `prefers-reduced-motion` (JS and CSS); no redraw when nothing changed.

## Review focus
- Reduced motion: no transform animation. Off-screen target: fade only. Nothing changed: no DOM writes.
