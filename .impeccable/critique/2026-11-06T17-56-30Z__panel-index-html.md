---
target: "panel/index.html (issue #260)"
total_score: 23
max_score: 28
na_heuristics: 5,9,10
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:9017f9f5b1cb421a0a88bc848b10dc616e97d7bd9bb3928f4659ddc8773ffd33"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-06T17-56-30Z
slug: panel-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

# Critique — panel/index.html, issue #260 (« Discussion » tab renamed « Agent », « Discuter avec l'agent » removed)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Unread badge stays on the tab, « Nouvelle réponse » in the list |
| 2 | Match System / Real World | 2 | « Agent » (tab) vs « agents » (workers on « Suivi ») |
| 3 | User Control and Freedom | 4 | |
| 4 | Consistency and Standards | 3 | Vocabulary, see #2 |
| 5 | Error Prevention | n/a | |
| 6 | Recognition rather than Recall | 3 | The tab is always visible |
| 7 | Flexibility and Efficiency | 3 | Blank conversation now 2 taps on phone instead of 1 |
| 8 | Aesthetic and Minimalist Design | 4 | One entry point instead of two |
| 9 | Error Recovery | n/a | |
| 10 | Help and Documentation | n/a | Correctly nothing added |
| | **Total** | **23/28** | |

## Design specificity
A clean subtraction that fits DESIGN.md: quiet tabs, ink badge (One Voice Rule kept), shorter « Plus » menu.

## Priority issues
- P2 — « Agent » clashes with the « agents » of « Suivi ». The owner asked for « Agent » explicitly: kept, raised in the PR.
- P3 — The badge's number had no meaning for a screen reader (« Agent 1 »). Fixed: the tab is now described as « 1 nouvelle réponse ».
- P3 — Untitled conversations are still titled « Discussion ». The validated spec keeps it unchanged: kept.

## Detector (B)
3 warnings, all pre-existing, none on changed lines: overused-font (Geist, chosen in DESIGN.md: false positive), pulsing-dot ×2 (typing indicators shown only while the agent is thinking, stopped under reduced motion: false positives). Browser overlay skipped: headless session.

## Persona red flags
Pierre may look for « Discuter » in « Plus » once out of habit; the tab sits just below.

Questions skipped: run autonome de la factory
