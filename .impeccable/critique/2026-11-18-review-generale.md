---
target: "panel, every screen (general review #483)"
total_score: 29
max_score: 36
first_score: 28
na_heuristics: 10
p0_count: 0
p1_count: 2
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-18T18-30-00Z
slug: panel-index-html
---
Method: dual-agent (A: design review on screenshots + source · B: detector + browser measurements), then one re-check evaluation (single, on the after screenshots) centred on the priority items.
Screens (light and dark, 1440 px and 390 px): login, empty board, busy board (À vous de jouer, blocked, working, queued, ideas, done), board with GitHub unreachable, phone « Plus » menu, phone project switcher, release dialog, stack sheet, Agent (list, conversation, new conversation, full screen, read-token setup), Paramètres and « Avancé » opened.

## Scores
First critique 28/36 (A: 28.5, rounded down) · re-check 29/36 (help n/a: screen-text rule).

## Fixed
- [P2] Type back on the DESIGN.md ramp: mono figures were 11.96 px inside 13 px lines (now never under 13 px), card titles 16.32 px (now 16 px), the fold glyph of release cards 15 px (now 13 px). Detector `design-system-font-size` ×1, browser measurements ×37.

## Not changed, with the reason
- [P1, A] Read-token setup sentence (« La discussion utilise désormais un jeton… ») : text validated word for word by the owner in spec #395 (owner exception of the screen-text rule).
- [P1, A] « Privé · 2 en parallèle » and the « Avancé » summary line: project state, not an explanation of how the screen works.
- [P1, A] Phone « Plus » menu mixes buttons and quiet links: the links are 44 px high (fixed in #403) and the agent counter is a status link validated with the runs counter.
- [P2, A] Sticky « Enregistrer » bar in the middle of Paramètres: full-page screenshot artefact of a sticky bar; in the real viewport it sits at the bottom.
- [P3, A] « Bloqué » + « Débloquez l'agent » on a blocked card, « Jeter » without undo: validated specs (#269, #402 already planned).

## False positives (detector)
- broken-image on `#lightbox-img` (src set by JS), overused-font Geist / Geist Mono (chosen in DESIGN.md), pulsing typing dots (live state), `.bubble blockquote` quote bar (line colour, 3 px, not an accent).
- Live overlay injection refused by the panel's CSP (`script-src 'self'`): kept, it is a security feature.

## Measured clean
- 0 text under AA contrast in 20 state/theme/size combinations; 0 horizontal overflow at 390 px; focus ring 2 px ink everywhere tested; small visible buttons all carry a 44 px hit area.

Questions skipped: run autonome de la factory
