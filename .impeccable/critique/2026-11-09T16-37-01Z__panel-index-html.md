---
target: "panel project list (issue #314)"
total_score: 25
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:f79ab9622119da4f2b95b53de4531236509f2c928a22e42b51de58e7ccdd117f"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-09T16-37-01Z
slug: panel-index-html
---
Method: two isolated sub-agents (A design review, B detector + browser). Target: project list and project switch (issue #314).

## Design Health Score
| # | Heuristic | Score |
|---|---|---|
| 1 | System status | 3 |
| 2 | Real-world match | 3 |
| 3 | User control | 3 |
| 4 | Consistency | 2 |
| 5 | Error prevention | 3 |
| 6 | Recognition | 2 |
| 7 | Flexibility | 2 |
| 8 | Minimalism | 4 |
| 9 | Error recovery | 3 |
| 10 | Help | n/a (screen-text rule) |
Total 25/36.

## Design Specificity Verdict
Specific: same lanes and colours as the board, no counts, no icons, no blue on the open project.

## Deterministic scan
CLI: 3 file-level warnings (overused-font Geist — fixed by DESIGN.md; pulsing-dot on the chat typing indicator) — none on the project list. In-page (CSP bypassed on the test page only): overused-font, and gray-on-color in dark mode on the « À vous » card (6.01:1, false positive). Grey dot contrast 5.84:1 light / 7.15:1 dark.

## Priority Issues
- [P1] Phone: the « another project » dot right after the name read as the open project's own state. Fixed: the dot now sits on the chevron's corner, ringed.
- [P1] Dot meaning tooltip-only on touch. Kept: the owner chose a hover legend with no visible text (spec Q8); screen readers get the label; colours are the board's own.
- [P2] An urgent project can scroll out of a long list on desktop. Not done: outside the spec (owner has a handful of projects).
- [P2] « No dot » before the first check. Not done: the first round lands within seconds of opening.
- [P3] Open project barely distinct (1.04:1 fill). Fixed: the column is a shade off the page, the open project lighter than the column in both themes, stronger border, bold.

## Persona Red Flags
- Mobile owner: misread header dot (fixed).
- Keyboard: focus lost when dots refresh (fixed, with an e2e test).

## Minor Observations
- Heading of the phone held hidden text « changer de projet »: removed (noisy heading name).
- 901-1024 px: header buttons wrap to two rows; acceptable, breakpoint fixed by the spec (~900 px).

Questions skipped: run autonome de la factory
