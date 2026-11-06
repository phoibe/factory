---
target: Paramètres tab
total_score: 20
max_score: 20
na_heuristics: 3,5,7,9,10
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:dfa8af6c329fe3a905794b14862c4b5223404860a4d9935f24be71bf377dfd36"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-06T16-48-05Z
slug: panel-index-html
---
# Critique: « Paramètres » tab (renamed from « Règles »), issue #250

Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

## Design Health Score (scoped to the tab label and the save toast)
| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 2 → 4 after fix |
| 2 | Match system / real world | 4 |
| 3 | User control and freedom | n/a (untouched) |
| 4 | Consistency and standards | 3 → 4 after fix |
| 5 | Error prevention | n/a (untouched) |
| 6 | Recognition rather than recall | 4 |
| 7 | Flexibility and efficiency | n/a (untouched) |
| 8 | Aesthetic and minimalist design | 4 |
| 9 | Error recovery | n/a (untouched) |
| 10 | Help and documentation | n/a (no help text, per « Textes à l'écran ») |
| **Total** | | **17/20 → 20/20** |

## Design specificity
« Paramètres » matches the tab content (site address, agent engine, parallel features, steps, checks, skills), and « Suivi », « Discussion », « Paramètres » read as a consistent set of plain nouns. Fits on one line at 390 px (112 px wide, 44 px tall).

## Deterministic scan
`impeccable detect panel/index.html`: 3 warnings (overused-font Geist, pulsing-dot ×2 on the chat typing indicator), all pre-existing, none on changed lines; pulsing-dot is a false positive (live state). Browser overlay (CSP removed in the test only): 1 finding, overused-font, pre-existing.

## Priority issues
- [P1] Save toast hidden behind the sticky save bar (toast had no z-index): on phone only half of the first line showed, on desktop nothing. Fixed: toast stacks above the bar; e2e journey added.
- [P2] Unreadable-config and vanished-config messages still said « réglages »: now « paramètres », one word for one thing.
- [P3] Toast could be shortened: kept as is, its exact wording is in the validated spec.

## Persona red flags
Phone owner saved and saw no readable confirmation (fixed).

## Minor observations (pre-existing, out of scope)
English words in the tab (« skills », « GitHub Actions »); small « 9 sur 15 » counts on phone.

Re-check after fix (single evaluation): toast fully readable above the save bar on phone and desktop, light and dark.

Questions skipped: run autonome de la factory
