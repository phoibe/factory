---
target: Stack technique dialog
total_score: 21
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:d9aa8eda22ffd3b0847bc0311e3e035c5338b9a6085cc335d1d1edc554e2e9f9"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-06T16-16-53Z
slug: panel-index-html
---
# Critique: « Stack technique » dialog (panel)

Method: two isolated sub-agent assessments (design review A, detector + browser evidence B).

## Design Health Score
| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 |
| 2 | Match system / real world | 2 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | n/a (read-only sheet, single non-expert owner) |
| 8 | Aesthetic and minimalist design | 2 |
| 9 | Error recovery | 2 |
| 10 | Help and documentation | n/a (product rule forbids help text) |
| **Total** | | **21/32** |

## Design specificity
On-system (tokens, 65ch, dark theme, French dates); generic dialog shell, product character carried by the content.

## Deterministic scan
6 warnings (overused-font Geist, pulsing-dot ×2, side-tab on chat blockquote), all pre-existing, none on the dialog lines.

## Priority issues
- [P1] Empty and in-progress states explain how the feature works (« Textes à l'écran »): keep one short sentence each.
- [P1] A failed refresh replaces the shown sheet with a raw HTTP error and no retry.
- [P2] Section titles barely heavier than bold item names: separate sections.
- [P2] Mono sub-headings go against DESIGN.md's mono-for-numbers rule.
- [P3] In-progress state after a click lacks the « Suivre la demande » link.

## Persona red flags
Raw « 403 » with nothing to tap; 4 lines before the button on phone; colon starting a line (no non-breaking space).

## Minor observations
No non-breaking spaces before « : » « ; »; backdrop click does not close; focus not moved after the empty state replaces the loading text; jargon in the sheet (PR, label, specs), dangling preposition in the httpx line, services list cost before role.
