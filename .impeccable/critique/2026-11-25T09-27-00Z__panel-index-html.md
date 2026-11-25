---
target: "Réglages généraux (#605)"
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:a0731d85f61703dd95bafe7bf201ef00be356e4b39fe54ccd953f284e4775c5d"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-25T09-27-00Z
slug: panel-index-html
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this run)

# Critique — Réglages généraux (#605), 2026-11-25

Method: single context, Assessment A recorded before the detector ran; browser evidence (Chromium, fake GitHub via e2e/fixture withPanel) at 1280, 390 and 320 px, light and dark.
Rule « Textes à l'écran » applied. Help sentences of the roles are validated verbatim by the owner (spec #605 for « Relectures d’une review générale »): kept.

Score: 30/40 (no P0/P1, no re-critique). Previous: 30/40 (#570).

## Fixes applied
- Role help sentences limited to 65 characters a line (DESIGN.md « Body »): on a computer the new help ran on one 135-character line across the whole frame, far from its select. Now `max-width: 44ch` with `text-wrap: pretty`: the help wraps in the select's column (384 px ≤ 420 px), 3 lines, no lone word. E2E test added.
- DESIGN.md « Réglages généraux » layout: the help's measure is now written down.

## Kept on purpose
- Help text of « Relectures d’une review générale »: validated verbatim by the owner.
- Detector findings (4): the same as #544/#570, all outside this page.

## Layout check (DESIGN.md « Mises en page »)
Matches « Réglages généraux (page à part) »: one column, framed blocks, five roles in order, selects 420 px on a computer, full width on a phone, sticky « Enregistrer ». Screen already listed.

---
# Assessment A (design review)

## Design specificity verdict
Unchanged: the panel's own system (framed fieldsets, bold label, grey help, select). The changed row is data-driven from MODEL_ROLES; only its sentence grew (~105 → 135 characters).

## Nielsen scores
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Save state line, pressed top button |
| 2 | Match real world | 3 | Owner's vocabulary (« review générale », « Revue ») |
| 3 | User control | 3 | Back restores the tab; unsaved choices kept |
| 4 | Consistency | 3 | Five identical rows |
| 5 | Error prevention | 3 | No scope cue on « Machine des tâches » (unchanged) |
| 6 | Recognition | 3 | Values and labels visible |
| 7 | Flexibility | 2 | No reset-to-default (unchanged) |
| 8 | Minimalist design | 3 | Help lines ran full frame width on a computer (fixed) |
| 9 | Error recovery | 3 | Failure toast only (unchanged) |
| 10 | Help & docs | 4 | One line per role, now says it also reads the project's history |
| **Total** | | **30/40** | **Good** |

## Cognitive load
Seven decisions in two blocks; low.

## Strengths
1. Data-driven row: label, help, order stay in step with the agent's settings.
2. No overflow at 1280, 390, 320 px (scrollWidth = innerWidth), both themes; « Revue » keeps its guillemets (frenchSpaces).
3. Help contrast AA in both themes (rgb 95,99,104 on white; 154,160,166 on dark).

## Priority issues
1. [P2] Help measure on a computer: 135 characters on one line (DESIGN.md caps body text at 65), the eye travels 974 px away from the select it describes. Fix: cap the help width. Fixed (layout/typeset).
2. [P3] At 320 px the help ends on « par « Revue ». » alone-ish; with `text-wrap: pretty` the last line holds two words. Fixed.

## Persona red flags
- Pierre on a phone: 3 lines at 390 px, 4 at 320 px; role name wraps to 2 lines at 320 px (acceptable).
- Keyboard/SR: select described by its help (aria-describedby), unchanged.

## Minor observations (outside this change, ideas)
- The grey note under the five roles (« L’agent qui pilote… ») is capped at 65ch, i.e. ~90 characters a line, also above DESIGN.md's 65; and it explains how the factory works (« Textes à l'écran »), though DESIGN.md describes it on purpose.
- Points from #544 not reopened (scope cue on the machine, no reset-to-default).

## Detector
CLI on panel/index.html + panel/screen-general.mjs: 4 findings (broken-image, overused-font Geist, pulsing-dot ×2 for the chat typing dots), same as #570, none on this page. No overlay injected (no live browser tab for the owner).

Questions skipped: run autonome de la factory
