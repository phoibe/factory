---
target: production gap line and dialog
total_score: 21
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:9c33fc964318f9e2fce37d053389e1645ca472fb1f654fbc9234549b6ca1a06a"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-13T13-29-06Z
slug: panel-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

Target: production gap line under the project name (#prod-gap) and its dialog (#gap-dialog), panel/index.html — issue #369.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | five states covered, failure in red + words |
| 2 | Match System / Real World | 2 | dialog title "Écart de production" does not echo the trigger "En ligne" |
| 3 | User Control and Freedom | 3 | Fermer + Esc, focus returns to trigger |
| 4 | Consistency and Standards | 2 | dotted underline vs solid links; date format differs from cards ("8 nov. 2026" vs "le 8 nov.") |
| 5 | Error Prevention | 3 | nothing destructive |
| 6 | Recognition Rather Than Recall | 3 | titles as links |
| 7 | Flexibility and Efficiency | 2 | no path to the failed publication |
| 8 | Aesthetic and Minimalist Design | 2 | intro sentence in dialog, repeated year |
| 9 | Error Recovery | 1 | failed publication gives no cause or action |
| 10 | Help and Documentation | n/a | no help by design (rule « Textes à l'écran ») |
| **Total** | | **21/36** | Acceptable |

## Design Specificity Verdict
LLM: specific and restrained, reuses the release dialog pattern and DESIGN.md tokens (--muted, --danger). Deterministic scan: 3 findings, all pre-existing and unrelated (overused-font Geist, two pulsing typing dots). Browser: #prod-gap 44px tall (48px wrapped on phone); contrast 5.43–8.28 (AA); dialog modal, labelled, focus contained, Esc returns focus.

## Priority Issues
- [P1] Dialog intro sentence describes the screen (rule « Textes à l'écran »). Fix: remove; keep only the required reason for « version inconnue » and a one-line empty state. Command: distill.
- [P1] Dialog title jargon / repeated year. Fix: title « Pas encore en ligne », date « validée le 8 nov. » like the cards. Command: clarify.
- [P2] Failed text wraps centred on phone. Fix: left-aligned wrapping. Command: adapt.
- [P2] Order oldest-first differs from Suivi. Kept: the validated spec asks oldest first.
- [P3] Trigger affordance. Kept dotted underline (quiet, DESIGN restraint).

## Persona Red Flags
Owner (phone, non-technical): red failure line reads as alarm without next step — out of scope here (no retry in spec). Power user: wants link to failed run — idea for later.

## Minor Observations
« à jour » still opens the dialog: needs a short empty-state line. Orange requested by the spec is not in DESIGN.md: failure uses the design's red.
