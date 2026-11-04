# Issue 123 — phone header, cancellable go, reserved blue (plan)

**Goal:** implement the validated spec of issue #123 in the static panel.
**Architecture:** one new pure module `panel/countdown.mjs` (testable 5 s cancellable action); the rest is markup/CSS/app.mjs wiring.
**Spec:** last `factory-spec` comment of issue #123.

## Tasks
1. `panel/countdown.mjs` `startCountdown({seconds, tick, done, every, clock})` -> `{cancel}`; tests in `test/panel-countdown.test.mjs` (ticks 5..1, fires once at 0, cancel prevents firing, cancel idempotent).
2. `app.mjs` `answerGo`: first tap -> button "Annuler (5 s)" with countdown; cancel restores; at 0 posts the comment. One pending per card. No persistence (reload cancels).
3. Phone header: `#more` menu (`<details>`) in `index.html`; on phone (<=600px) secondary actions + nav items live in it; desktop unchanged. "Nouvelle fonctionnalité" stays outside.
4. Blue reserved: links ink + underline, `#chat-send` ink, accent only on you-card/go/login submit; focus rings ink.
5. Loading skeleton cards (no animation); persistent chat-list error with "Réessayer".
6. Token help in French, numbered steps, GitHub button names in English quotes.
7. DESIGN.md update (blue rule, header), run typecheck/lint/test/build/test:a11y.

## Review focus
- reload during countdown sends nothing (no timers persisted)
- double tap never double-posts (cancel/finish idempotent)
- failed retry keeps error message
