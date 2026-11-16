---
target: "lane Terminé #435"
total_score: 22
max_score: 28
na_heuristics: 5,7,10
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:e180c2b2751227372ffae973c03660fce43d8d3bb01bcf54c97f99dcbfb8fe5b"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-16T15-14-17Z
slug: panel-index-html
---
Method: dual-agent (A: design review · B: detector + in-page browser checks)

## Design Health Score (lane « Terminé », issue #435)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Green/red outcomes read at a glance |
| 2 | Match System / Real World | 4 | Plain French |
| 3 | User Control and Freedom | 3 | Fold opens/closes freely |
| 4 | Consistency and Standards | 3 | Uniform grid; open card breaks row rhythm (validated) |
| 5 | Error Prevention | n/a | Read-only lane |
| 6 | Recognition Rather Than Recall | 3 | Clamped title: hover only, tap opens the request |
| 7 | Flexibility and Efficiency | n/a | Read-only lane |
| 8 | Aesthetic and Minimalist Design | 3 | Empty space below short cards (validated by owner) |
| 9 | Error Recovery | 3 | Red card carries its remedy |
| 10 | Help and Documentation | n/a | No help text wanted |
| **Total** | | **22/28** | Good |

## Design Specificity Verdict
Specific to the product: calm cards, green/red outcomes, French status lines. Detector: 3 pre-existing warnings (overused-font Geist, 2 pulsing dots in the chat typing indicator), none in this lane.

## Priority Issues
- [P2] Phone lane tall with empty space: owner validated the same height everywhere → kept, not changed.
- [P2] Full title hover-only on phone: spec says two lines, title readable by opening the request → kept.
- [P3] Height from a raw calc: moved into a named variable `--done-card-height`; rows also share the tallest card's height while nothing is open, so a fuller card (two-line headline, undo + fix link) no longer stands out (found by the real-data try, test added).
- [P3] Muted text contrast and « Voir le site en ligne » 40px target: pre-existing, outside this change.
- [P3] Red card last in the lane: ordering change, outside this request.

## Persona Red Flags
- Pierre on phone: scrolls more (accepted trade-off of the validated spec).
- Keyboard: focus ring not clipped by the clamp (checked).

## Minor Observations
- Fold arrow slightly large; « ✅ » next to « En ligne »: pre-existing, outside scope.
