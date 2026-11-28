---
target: "Oui pour tout (#620)"
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/factory/panel/screen-board.mjs"
target_fingerprint: "sha256:35f515a8447481330e5ab935100bfc268767e3376aad1f6515dde465732d6271"
target_path: /home/user/factory/panel/screen-board.mjs
timestamp: 2026-11-27T16-23-21Z
slug: panel-screen-board-mjs
---
# Critique — « Oui pour tout » on a questions card (#620), 2026-11-27

Method: two isolated sub-agents (A: design review, B: detector + browser evidence), Chromium with fake GitHub, 1280 and 390 px, light and dark.

Score: 28/40 (one P1, so one focused re-critique after fixes).

## Design specificity
Grounded in the product: it reuses the « go » / « Ok » pattern exactly (same blue, same states « Envoi… » / « Envoyé ✓ », same hold in « Prise en compte en cours… »), and the blue appears only when the agent's latest message really proposes « oui à tout ». No explanatory text added (the toast is status feedback).

## Nielsen scores
| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of status | 3 |
| 2 | Match real world | 3 |
| 3 | User control | 2 |
| 4 | Consistency | 3 |
| 5 | Error prevention | 2 |
| 6 | Recognition over recall | 2 |
| 7 | Flexibility | 4 |
| 8 | Minimalist design | 3 |
| 9 | Error recovery | 3 |
| 10 | Help | 3 |
| | Total | 28/40 |

Cognitive load: low (1 failure of 8: what « oui » accepts lives in the questions, not on the card).

## Strengths
- Behaves exactly like « go » / « Ok », across devices.
- Blue only when true; the card without the proposal keeps « Répondre » alone.
- « Répondre » no longer moves the card out of « À vous de jouer ».

## Priority issues
- P1 — Phone, after a touch: the sent card moves and the next card's blue « go » lands under the thumb (y≈447 → 448). A second tap would start another request. Fix: ignore taps on blue card buttons that just slid under the pointer (≈600 ms).
- P1 (from code review) — Before a questions card's comments are read, it shows « Répondre » alone; « Oui pour tout » then takes that exact spot, so a tap aimed at « Répondre » sends « oui à tout ». Fix: draw no answer button on a questions card until its comments were read once.
- P2 — The card does not say how many proposals one touch accepts. Kept: out of the validated spec (the card's line and labels are fixed by it).
- P2 — Phone toast covers cards while the board moves. Kept: toast wording is fixed verbatim by the spec.
- P3 — Label cramped (8 px side padding) and width grows from « Oui pour tout » to « Envoyé ✓ ». Fix: same padding as « go »/« Ok », stable minimum width.
- P3 — Touch zones of « Oui pour tout » and « Répondre » overlap by 2 px. Fix: no overlap.

## Persona red flags
- Owner on a phone: the next blue button under the thumb (P1).
- Experienced user: no undo; a correction goes through « Répondre » (same as « go »).
- Accessibility: fine (labels change with each state, visible focus, dark contrast holds).

## Minor observations
- Toast says « vos réponses » while the owner accepted proposals (kept: spec wording).
- A card on hold after a written answer still shows an enabled « Oui pour tout » (same as « Ok » today).
- DESIGN.md sentence about « Répondre » keeping the card reads as if it covered every questions card: narrow it.

## Deterministic scan
CLI (`panel/index.html`, `panel/screen-board.mjs`): 4 findings, all page-level and outside this change — `broken-image` #lightbox-img (false positive, src set at runtime), `overused-font` Geist (project-wide choice), `pulsing-dot` ×2 (chat typing indicator, live state: false positive). Browser overlay at 1280 and 390: only `overused-font`. Nothing on the card.

Questions skipped: run autonome de la factory
