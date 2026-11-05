# Background refresh Implementation Plan

**Goal:** Board and chat keep polling when the browser tab is hidden or another panel page is shown.

**Spec:** issue #151 (comment `factory-spec`).

## Task 1: hidden tab polls at the idle rhythm
- [x] Test: `isIdle(last, now, true)` is true (test/panel-live.test.mjs), seen failing first.
- [x] `isIdle(lastActivity, now, hidden = false)` in panel/live.mjs.
- [x] panel/app.mjs: `schedule()` no longer stops on hidden tab or hidden board page; passes `document.hidden`; `scheduleChat()` no longer stops on hidden tab; visibility handlers keep polling when hidden, refresh immediately on return.
- [x] Run `npm test`, typecheck, lint, build.
