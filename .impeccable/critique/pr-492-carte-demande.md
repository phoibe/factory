# Critique — carte « Créer cette demande » (issue #492)

Method: design review (sub-agent A) + detector and screenshot measurements (sub-agent B), then one focused re-check.
Questions skipped: run autonome de la factory.

## First critique — 28/40
- P1 no primary button: « Créer cette demande » and « Ignorer » looked identical → « Créer » filled ink (like the send button), « Ignorer » ghost.
- P1 « Lire le texte » did not read as a control → chevron ▸/▾, ink text, same pattern as the release fold.
- P2 card blended with the agent bubble → surface background, line border, 8 px above.
- P2 weak hierarchy → label in mono 0.8125rem muted (DESIGN.md Label), title at body size 600.
- P2 « Créée » too discreet, link under 44 px → green check, bold « Créée », underlined « Voir la demande » with a 44 px target.
- P3 error said twice (card + toast) → only on the card, next to the retry button.
- Detector: 3 advisories on the new rules (radius 12 px, font sizes .875/.75rem) → replaced by DESIGN.md values (radius token 14 px, 0.8125rem). Other findings pre-existing.
- Rule « Textes à l'écran »: compliant, no explanatory text.

## Re-check — 33/40
- All P1/P2 fixed. Follow-ups applied: bigger chevron, « ✕ Ignorée », 8 px between « Créée » and the link, « Ignorer » text in ink for contrast.
- Left as is (out of scope of the spec): no undo after « Ignorer » (the owner asks the agent for a new card), no « Tout créer ».
