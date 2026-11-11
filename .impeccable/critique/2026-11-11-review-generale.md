---
target: "panel, every screen (general review #338)"
total_score: 28
max_score: 36
first_score: 25
na_heuristics: 10
p0_count: 0
p1_count: 4
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-11T19-30-00Z
slug: panel-index-html
---
Method: dual-agent (A: design review on screenshots + source · B: detector + browser measurements), then one re-check evaluation after the fixes.
Screens: login, no project, board empty and busy (light/dark, 1280 px and 390 px), « Plus » menu, projects list on phone, release dialog, stack sheet, Agent (empty, conversation), Paramètres (light/dark).

## Scores
First critique 25/36 · re-check 28/36 (help n/a: screen-text rule).

## Fixed
- [P1] Screen texts explaining how things work, removed: login how-to (« Choisissez « All repositories »… »), Paramètres section intros (« Ces réglages ne changent que… », « …s'appliquent à tous vos projets »), « Mise en production » preprod/main sentence, « Contrôles supplémentaires » sentence, release dialog « Le CHANGELOG et le tag suivent ce numéro », stack sheet intro paragraph, empty board « Lancez-vous avec… ». Machine labels shortened.
- [P1] Phone « Plus » menu opened inline and pushed the board ~480 px down: now a floating menu.
- [P1] Phone header: project meta line hidden (DESIGN.md: only the name, « Nouvelle fonctionnalité », « Plus »).
- [P2] « PR #20 » on cards → « livraison #20 ». Site address field and chat input at 44 px.

## False positives
- One Voice Rule: early `--accent` rules are overridden by the issue-123 layer (links, summaries, checkboxes, steps bar are ink).
- Card buttons 32 px: a 44 px hit area exists (`::after`, inset -7px).
- Detector: overused-font Geist (chosen in DESIGN.md), pulsing typing dots (live state, not decoration), grey on blue tint 6.5:1.

## Remaining (issues opened)
- Phone: « Mise en production » takes a row of its own above the cards (#343).
- Paramètres: about thirty settings at once, many technical (#342).
- « Serveur de dev : pas encore vérifié, machines GitHub en attendant. » kept as a state line, shortened.

Questions skipped: run autonome de la factory
