---
target: "panel, every screen (general review #556)"
total_score: 28
max_score: 36
first_score: 28
na_heuristics: 10
p0_count: 0
p1_count: 0
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-24T15-00-00Z
slug: panel-index-html
---
Method: dual-agent (A: design review on screenshots + source · B: detector CLI + rendered-page scan over CDP + browser measurements), isolated sub-agents. No P0/P1, so no re-check critique (design-pass step 4): the owner's screenshot review is the final check.
Screens (light and dark, 1440 px and 390 px): login, empty board, busy board (À vous de jouer, blocked, working, queued, ideas, done, finished release), board with GitHub unreachable, phone « Plus » menu, phone project switcher, release dialog, stack sheet, Agent (list, conversation with a proposal card, new conversation, full screen, read-token setup), Paramètres with « Avancé » opened, Réglages généraux.

## Scores
First critique 28/36 (help n/a: screen-text rule). Heuristics: 4,3,3,3,3,3,3,3,3,n/a.

## Design specificity
Authored for this product: board ordered by who has to act, one blue (go/Ok and the waiting dot only), status in the owner's words with mono figures. Generic spots: the stack of one-checkbox skill-pack blocks in « Avancé », the standard chat shell.

## Priority issues (A)
- [P2] « Avancé »: fold « Choisir les skills » inside « Savoir-faire » blocks (leftover of the French rename); four one-checkbox fieldsets take ~900 px. → clarify, layout.
- [P2] Idea « Garder » / « Jeter » use the 44 px default button and outweigh the 32 px blue go/Ok. → polish.
- [P2] Release and gap dialogs at 420 px while DESIGN.md « Fenêtre » sets 640 px; the title wraps on desktop. → layout.
- [P3] Phone action row: without « Mise en production » the row stops ~35 px short of the edge. → adapt.
- [P3] Header link line mixes 16 px `#site` with 13 px quiet links. → polish.

## Detector and measurements (B)
- CLI: 8 findings, 7 known false positives (lightbox img src set by JS, Geist / Geist Mono chosen in DESIGN.md ×3, typing dots ×2, blockquote quote bar). Real: `.pwarn` 12 px off the ramp.
- Rendered-page scan: `gray-on-color` on `.ticket.yours .eta` in dark (6.1:1, passes AA: style signal, kept); `nested-cards` proposal inside the chat frame (the proposal is a card in a thread, kept).
- Overlay injection refused by the panel CSP (`script-src 'self'`): kept, security feature.
- Contrast: 0 failures in 28 runs. Overflow at 390 px: none.
- Touch targets: « À vous » card title link 20 px high; checkboxes/radios in Paramètres and Réglages généraux 18 px with a 13 px dead gap before the label; « Copier la réponse » 42 px.
- Type off the ramp: `.num` 14.72 px, `#chat-back` 17.6 px, `.pwarn` 12 px.
- Focus: `summary` « Choisir les skills » 1 px ring; `#stack-body` default ring.
- axe: `scrollable-region-focusable` on `#stack-body` (only violation).
- Tokens: `--surface-2` and `--danger-bg` used but missing from DESIGN.md; many spacings off the 4/8 scale (12, 10, 6, 14 px).

## Minor (A)
- `.proposal-kind` set in mono while board cards use sans for the same word.
- Units inside the mono span read « 1  h » with a wide gap.
- Login card: ~80 px empty under the button (empty `.error` keeps its min-height).
- DESIGN.md stale: go « seul sur sa ligne » and phone card buttons « pleine largeur » contradict validated #269 (the page is right).
- No current-place cue on the « Réglages généraux » button while its page is open.

## Screen-text rule
No violation: the Réglages généraux sentences (#544, #550), the read-token sentence (#395) and the QR-code warning (safety) are owner-validated or safety messages.

## Fixed / not changed
See the PR « Design » section for what was fixed. Not changed, with the reason: off-scale spacings across the stylesheet (a re-spacing of every screen is a redesign, not a review fix); field borders at ~1.25:1 (the DESIGN.md line colour, fields are also identified by their label and position).

Questions skipped: run autonome de la factory
