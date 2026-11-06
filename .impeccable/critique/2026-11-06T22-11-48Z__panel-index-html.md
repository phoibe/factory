---
target: "Agent tab badge (#283)"
total_score: 26
max_score: 28
na_heuristics: 5,9,10
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:200461754b737caf13dbdecc10447317e0e98a613ec0671883d2e183d1064b18"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-06T22-11-48Z
slug: panel-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

Target: « Agent » tab badge lit while on « Suivi » / « Paramètres » (issue #283). Look unchanged; only when it appears changed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Detection waits for a poll (4 s awaited, 30 s otherwise); tab bar not sticky on phone |
| 2 | Match System / Real World | 4 | Count on a tab, « 1 nouvelle réponse » for screen readers |
| 3 | User Control and Freedom | 4 | One tap on « Agent », row marked « Nouvelle réponse » |
| 4 | Consistency and Standards | 4 | Both chat modes behave the same; badge matches the rows |
| 5 | Error Prevention | n/a | Passive indicator |
| 6 | Recognition Rather Than Recall | 4 | No need to remember to check « Agent » |
| 7 | Flexibility and Efficiency | 3 | Browser title does not show answers (refused by the owner, ADR 0002) |
| 8 | Aesthetic and Minimalist Design | 4 | One glyph, no text |
| 9 | Error Recovery | n/a | Passive indicator |
| 10 | Help and Documentation | n/a | No help needed or shown (« Textes à l'écran » respected) |
| **Total** | | **26/28** | Excellent |

## Design Specificity Verdict
LLM: ink pill (text on bg) with Geist Mono figure; follows One Voice (no blue: an answer is not a « go »), Mono Numbers, flat, 999px radius. Distinct from the grey count chip of « Terminé ».
Deterministic scan: 3 warnings on panel/index.html: overused-font (Geist, deliberate brand choice), 2 × pulsing-dot on the typing indicators (false positives: real live state, off under reduced motion). Badge not flagged. Contrast 18.5:1 light, 16.8:1 dark.
Visual overlays: live detect.js blocked by the panel CSP (correct hardening); with CSP stripped in the test browser only: overused-font and one straggler « ». » at 390px elsewhere on the board, unrelated to the badge.

## Priority Issues
- [P2] On a phone the tab bar scrolls away: a lit badge may be off-screen when the owner has scrolled « Suivi ». Not fixed: the owner asked for the badge only (no toast, no notification); a sticky tab bar is a layout change outside this feature.
- [P2] Screen-reader users were not told when the badge appeared while away. Fixed: a hidden status region now says « Nouvelle réponse de l'agent. » when the count rises.
- [P3] Browser title ignores answers: refused by the owner (ADR 0002). No change.
- [P3] Detection can lag 30 s when nothing is awaited: per spec.

## Persona Red Flags
- Owner on phone: badge legible, 44px tab; off-screen case when scrolled (P2 above).
- Screen-reader user: complete tab description; live announcement added.

## Minor Observations
- `.badge` declared font-weight 700 then 500: dead 700 removed.
- Header-only crops were mis-framed (evidence only).
