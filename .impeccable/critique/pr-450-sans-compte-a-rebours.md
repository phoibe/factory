# Critique — « go » / « Ok » / « Jeter » without countdown (issue #450)

Target: `panel/app.mjs` (answerGo, goButton, dropButton), `panel/style.css`. Mode: Operate.
Method: dual-agent (Assessment A: design review · Assessment B: detector + rendered screenshots, phone and desktop, light and dark).

## Score
- First critique: 30/32 on the 8 applicable heuristics (9 error recovery and 10 help scored n/a), no P0/P1.
- After fixes: no recritique (no P0/P1 at the start); the owner's screenshot review is the final check.

## Findings and outcome
- P2 (A and B agree) — « Envoi… » on an « À vous de jouer » card faded to opacity .6 (white on pale blue, ≈ 3:1). **Fixed**: muted text on the card surface, full opacity, like a sent « go » on a waiting card; e2e test « « Envoi… » reste net à l'écran, pas pâli ».
- P2 (A) — after « Jeter » the next card slides up under the thumb. **Kept**: same as « Garder » since #402, sorting several cards in a row is wanted (« je peux trier plusieurs cartes à la suite sans attendre »).
- P2 (A) — a refused « Jeter » with no undo. **Already handled**: GitHub refusal brings the card back with its red line « GitHub a refusé : réessayez. ».
- P2 (B, to check) — touch area of go/Ok/Captures. **Already handled**: `::after` extends them to 44 px on « À vous » cards.
- P3 — min-widths sized for « Annuler (5s) ». **Kept**: they keep « go » / « Envoi… » the same width (no jump, checked on screenshots); comments updated.
- P3 — « Captures » stays active while « Ok » is sent; toast role. **No change**: reading the captures is harmless; the toast is `role=status` (checked in #402).
- P3 — 8 px between « Garder » and « Jeter ». **No change**: the owner chose no safety net (#450); the gap is the panel's standard.
- Detector: 7 findings, all pre-existing and unrelated (Geist font ×3, chat typing dots ×2, quote bar, one font size); none on the changed code.

Textes à l'écran: no explanatory text added. Removed: the toasts « « go » part dans 5s. », « L'idée part dans 5s. », « … annulé », and the « Annuler (5s) » label.

Questions skipped: run autonome de la factory
