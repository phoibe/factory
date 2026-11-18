# Critique — cursor in the message box when the « Agent » tab opens (issue #489)

Target: `panel/app.mjs` (selectTab, focusChat), `panel/style.css` (#chat-input focus ring). Mode: Operate.
Method: dual-agent (Assessment A: design review · Assessment B: detector + axe-core + rendered screenshots, desktop 1280×800, light and dark).

## Score
- First critique: 30/40, no P0/P1.
- After fixes: no recritique (no P0/P1 at the start); the owner's screenshot review is the final check.

## Findings and outcome
- P2 (A and B agree) — at 1280×800 the focused message box sat ~14 px below the fold, its focus ring cut. **Fixed**: the whole composer is scrolled into view after focusing; e2e test « sur un écran d'ordinateur portable, la zone de saisie où se trouve le curseur est entièrement visible ».
- P3 (A) — #chat-input focus ring offset 1 px where DESIGN.md says 2 px. **Fixed**: 2 px.
- Code review (same screen) — the arrow keys of the tab list jumped into the message box, trapping keyboard users on « Agent ». **Fixed**: only a real click (mouse, touch, Enter) moves the cursor; the arrows keep moving along the tabs.
- P2 (A, pre-existing, out of scope) — the read-token card has a paragraph explaining why a read-only token is used (« Textes à l'écran »). **Left**: not part of this request; listed in the PR as a remaining point.
- Detector: 3 findings, all pre-existing and unrelated (Geist font, chat typing dots ×2). axe-core: 0 violations, light and dark. Focus ring contrast ≥ 15:1 in both themes.

Textes à l'écran: no text added or removed.

Questions skipped: run autonome de la factory
