# Critique — Agent tab opens on the most recent open conversation (issue #477)

Target: `panel/app.mjs` (pickDefaultConversation, openChat), `panel/chat.mjs` (defaultConversation). No CSS change. Mode: Operate.
Method: dual-agent (Assessment A: design review · Assessment B: detector + rendered screenshots, phone and desktop, light and dark).

## Score
- First critique: 25/32 on the 8 applicable heuristics (9 error recovery and 10 help scored n/a), no P0/P1.
- After fixes: no recritique (no P0/P1 at the start); the owner's screenshot review is the final check.

## Findings and outcome
- P2 (A) — on phone, « Nouvelle conversation » is one tap further (back arrow, then the button). **Kept**: the owner chose it in the spec (« la flèche retour ramène à la liste », « le bouton « Nouvelle conversation » reste tel quel »).
- P2 (A) — an old open conversation may open, and the owner may type into it by mistake. **Kept**: each message shows its time, the conversation is highlighted in the list, and « Nouvelle conversation » stays one click away on desktop; « Terminer » keeps the list short.
- P3 (A, B) — « Terminer » and message times are low-contrast grey; « Copier la réponse » is about 32 px tall on phone; the phone header takes two rows. **Pre-existing**, outside this request (no visual change here).
- Detector: 9 findings (Geist font ×3, typing dots ×2, img without src, side-tab border, one font size, one radius), all pre-existing; none on the changed code.

Textes à l'écran: no text added or removed.

Questions skipped: run autonome de la factory
