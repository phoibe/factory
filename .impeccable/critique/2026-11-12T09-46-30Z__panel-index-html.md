---
target: "project header and Plus menu (#354)"
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:cdefedee4c384c381f654c75c73795d15b43bd62f154890b9823f61b48d1bb1c"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-12T09-46-30Z
slug: panel-index-html
---
Method: dual-agent (A: design review · B: detector + static renders; overlay injection not performed, panel needs a mocked GitHub API)

# Critique — project header and « Plus » menu after removing « Cadrer le projet / Revoir le cadrage » (#354)

## Design Health Score: 29/40 (heuristics 9 and 10 scored neutral; no explanatory text, rule « Textes à l'écran » respected)

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of status | 3 |
| 2 | Match with real world | 3 |
| 3 | User control | 3 |
| 4 | Consistency | 2 |
| 5 | Error prevention | 3 |
| 6 | Recognition over recall | 3 |
| 7 | Flexibility | 3 |
| 8 | Aesthetic & minimal | 3 |
| 9 | Error recovery | 3 (n/a, neutral) |
| 10 | Help | 3 (n/a, neutral) |

## Design specificity
Header follows DESIGN.md (monochrome, thin outlines). The removal is clean: no gap, phone row stays « Nouvelle fonctionnalité + Plus », desktop row is « Nouvelle fonctionnalité · Signaler un bug · Review générale · Stack technique ».

Deterministic scan: 3 warnings on panel/index.html (Geist overused font, two pulsing typing dots), plus style.css side-stripe — all pre-existing, none on diff lines. Caused by the change: 0.

## Priority issues (none caused by this change)
- P1 pre-existing: small underlined links inside the phone « Plus » menu (« Ajouter l'adresse… », « Voir les demandes sur GitHub », « Aucun agent lancé aujourd'hui ») have no 44px target.
- P2 pre-existing: menu mixes links and buttons without grouping.
- P2 pre-existing: open « Plus » trigger looks heavier than « Nouvelle fonctionnalité » on phone (open-state border, unchanged by this diff).
- P3 pre-existing: status/jargon lines (« GitHub », « agent ») at first level of the menu.
- P3 pre-existing: menu overlaps tabs without scrim (acceptable per DESIGN.md).

## Persona red flags
Thumb on small menu links; « Stack technique » / « Review générale » are jargon-ish; framing job is still reachable via the automatic install framing, a feature request or the chat (owner's decision, ADR 0005).

## Minor observations
Phone project name shows a thin glyph with the test fixture's one-letter name « r »: fixture artefact.

Questions skipped: run autonome de la factory
