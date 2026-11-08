---
target: panel « Mise en production »
total_score: 24
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:9a2d9ee30e255bc7bca38103373b183522cae7b871d4886bf8afd1b0c5c8578c"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-08T20-12-01Z
slug: panel-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

## « Mise en production » : bouton, confirmation, réglage (issue #294)

**Design health:** 24/36 (heuristic 7 n/a).

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 2 |
| 2 | Match with real world | 3 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition over recall | 3 |
| 7 | Flexibility | n/a |
| 8 | Aesthetic and minimalist | 3 |
| 9 | Error recovery | 1 |
| 10 | Help | 3 |

**Specificity:** specific — reuses the panel's quiet button, dialog and fieldset patterns, monochrome, no new colour.

**Strengths:** aria-disabled greyed button stays focusable with a « Rien en attente » toast; confirmation lists the real titles with pluralised title, focus on Annuler, Esc returns focus; host sentence only shown on « sur mon accord ».

**Priority issues**
- [P1] Send errors shown in a toast under the modal backdrop, with raw API text → fixed: `role="alert"` message inside the dialog, « L'envoi a échoué. Réessayez. »
- [P1] « Rien ne vous attend » while changes wait → not changed: the owner decided (spec Q5) that pending changes are not an « À vous de jouer » signal.
- [P2] Explanatory sentence in the dialog → removed.
- [P2] Confirm looks like Annuler → ink fill, « Envoi… » while sending, Annuler disabled meanwhile. Label kept « Confirmer » (spec wording).
- [P2] Silent publication when switching back to automatic → toast « Paramètres enregistrés. N modification(s) mise(s) en ligne. »

**Detector (B):** 3 pre-existing slop warnings (overused-font geist, pulsing typing dots); new finding `unbalanced-heading` on the dialog title (« ? » alone on a line) → non-breaking space + `text-wrap: balance`. Browser: 44 px targets, contrast 19:1 / 15.7:1, focus order and dialog focus correct, no console error.

**Minor observations:** count now in Geist Mono; host links use `.quiet-link` and point to Vercel and GitHub Pages environments; `aria-describedby` links the hint to its radio; desktop gap after the button comes from the existing « Plus » element (unchanged).

Questions skipped: run autonome de la factory
