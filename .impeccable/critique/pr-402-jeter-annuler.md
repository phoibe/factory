# Critique — « Idées à trier » card during the « Jeter » countdown (issue #402)

Target: `panel/app.mjs` (ideasLane, dropButton, showDrop, dropIdea), `panel/style.css`. Mode: Operate.
Method: Assessment A (design review) and Assessment B (detector + rendered screenshots, phone and desktop, light and dark) run as two isolated sub-agents.

## Score
- First critique: 30/36 on the 9 applicable heuristics (≈ 33/40), no P0/P1.
- After fixes: no recritique (no P0/P1 at the start); the owner's screenshot review is the final check.

## Findings and outcome
- P2 — disabled « Garder » at opacity .6 looked like an idle button (border vanished). **Fixed**: muted text colour and line border, full opacity, default cursor (same treatment as a sent « go »).
- P2 — « Annuler (5 s) » shows a wide gap before « s ». **Fixed in part**: non-breaking space (no wrap between the number and « s ») and tabular digits (no jitter between ticks). The remaining gap is the font's own figure spacing, identical on the existing « go » countdown.
- P3 — toast duplicates the button. **Kept**: the owner asked for it in the spec, and it is the screen-reader announcement (`role=status`).
- P3 — card outline darker than its neighbour. **No change**: it is the card's hover state under the mouse in the capture, not a focus ring.
- Detector: 0 findings on idea cards (3 unrelated: Geist font warning, chat typing dots).
- Touch targets: 44 px kept. Contrast: undo button ≈ 18:1, muted « Garder » passes AA in both themes.

Textes à l'écran: no explanatory text added; none removed.

Questions skipped: run autonome de la factory
