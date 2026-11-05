# Issue 146 — phone alerts when a card waits for the owner

**Goal:** an ntfy alert per wait (spec, captures, recette, blocked), plus a count in the tab title.

**Spec:** comment `<!-- factory-spec -->` on issue #146.

## Tasks
- [x] `scripts/lib/notify.mjs`: `waitingCards`, `alertText`, `sendAlert` (JSON POST to ntfy, never throws), dedupe helpers. Tests: `test/notify.test.mjs`.
- [x] `scripts/relay.mjs`: `notifyWaiting()` called after every decision and after a checks report; one alert per wait, key = label + latest « labeled » event, stored in a hidden comment; no `NTFY_TOPIC` = nothing.
- [x] `.github/workflows/relay.yml`: pass the optional `NTFY_TOPIC` secret.
- [x] `panel/lib.mjs` `tabTitle(n)`, used in `panel/app.mjs`. Test in `test/panel-lib.test.mjs`.

## Review focus
- Failed send: retried at next tick, no comment written.
- Project without `NTFY_TOPIC`: no call, no comment.
- Agent working on the card or auto-go spec: no alert.
