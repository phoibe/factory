# Critique — Réglages généraux (#570), 2026-11-24

Method: single assessment (proportionate: the change is one data-driven row, « Relectures d’une review générale ») + detector + browser evidence (Chromium, fake GitHub, desktop 1280 and phone 390, light and dark).

Score: 30/40 (no P0/P1, no re-critique). Previous: 29/40 (#544).

## Fixes applied
- Help texts and the claude.ai note keep French spaces unbreakable (« Revue » no longer leaves its closing guillemet alone on a line on a phone; « claude.ai : » no longer starts a line with the colon).

## Kept on purpose
- Help text of « Relectures d’une review générale »: validated verbatim by the owner in the spec (exception to « Textes à l’écran »).
- Role name with « review »: the owner’s own word for the general review, used across the panel.
- Detector findings (5): the same as #544, all outside this page (false positives here).

## Layout check (DESIGN.md « Mises en page »)
« Réglages généraux (page à part) » already lists the five roles in this order; the screen matches (one column, framed blocks, selects 420 px on desktop, full width on a phone, sticky « Enregistrer »). Nothing to add.

---
# Assessment (design review): Réglages généraux

## Design specificity verdict
Unchanged from #544: faithful to the panel’s own system (framed fieldsets, legend on the frame, hairline between rows, bold label + grey help + select). The new row is rendered from MODEL_ROLES, so it is identical in form to its siblings and sits where the owner asked (after « Revue », before « Tâches simples »). Its help names « Revue » by its on-screen name, which ties the two rows together without extra text.

## Nielsen scores
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Save state line and pressed top button; no per-row changed cue |
| 2 | Match real world | 3 | « review générale » / « PR » are the owner’s vocabulary; the new row reuses it consistently |
| 3 | User control | 3 | Back restores the tab; unsaved choices kept |
| 4 | Consistency | 3 | Five identical rows; the new one follows the pattern exactly |
| 5 | Error prevention | 3 | Unreadable-settings guard; no scope cue on « Machine des tâches » (unchanged) |
| 6 | Recognition | 3 | Labels and current values visible; the « Revue » cross-reference explains who does the synthesis |
| 7 | Flexibility | 2 | No reset-to-default or default marker (unchanged) |
| 8 | Minimalist design | 3 | Five selects with the same list make a longer block; still one column, short help lines |
| 9 | Error recovery | 3 | Failure toast; nothing inline (unchanged) |
| 10 | Help & docs | 4 | Each role says what it does in one line; the new row says where the synthesis goes, the question an owner would have |
| **Total** | | **30/40** | **Good** |

## Cognitive load
Seven decisions (5 selects + 2 radios), grouped in two blocks; each select has 3 options. Two neighbouring rows (« Revue », « Relectures d’une review générale ») both mention the general review; the new help resolves the overlap in one sentence. Verdict: low.

## Strengths
1. Data-driven: the row comes from MODEL_ROLES, so order, label, help and select stay in step with the agent’s settings, the tests and the DESIGN.md description.
2. The help separates the two roles clearly (reading vs. synthesis) with the on-screen name « Revue ».
3. Desktop and phone, light and dark: no horizontal overflow (scrollWidth = innerWidth), selects 420×44 / 324×44, help contrast 6.05 light / 6.66 dark.

## Priority issues
1. [P3] French spaces breakable in the help texts and the note: on a phone (390 px) the new help wrapped as « … par « Revue\n». ». Fix: render help and note through `frenchSpaces` (already used for the stack page). Fixed.

## Persona red flags
- Pierre on phone: the new row is the longest label (« Relectures d’une review générale ») and still fits one line at 390 px; help wraps to 2–3 lines, fine.
- Keyboard/SR: the new select is named by its label and described by its help (aria-describedby `model-audit-help`).

## Minor observations
- Five selects with the same options make the block taller; acceptable for a page visited rarely.
- Points from #544 not reopened (scope cue on the machine, no reset-to-default): outside this change.

## Detector + browser
- CLI on panel/index.html + panel/app.mjs: 5 findings (broken-image, overused-font Geist, pulsing-dot ×2 for the chat typing dots, design-system-radius in the ?largeur debug banner). Same as #544, none on this page.
- Browser: no overflow at 1280 and 390, both themes; targets ≥ 44 px; help text 13 px, contrast AA.

Questions skipped: run autonome de la factory
