---
target: liste des projets
total_score: 27
max_score: 32
na_heuristics: 5,9
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:a8be9f9187fefe538b906884c4c4706ea87ecbfd56f10f197a0e2301c935097b"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-18T17-55-37Z
slug: panel-index-html
---
Method: dual-agent (A: design review · B: detector/browser)

## Critique — project list and status dots (issue #488)

Design-specificity: specific, restrained (DESIGN.md signal logic: red blocked, blue your turn, grey working, no text).

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 |
| 2 | Match real world | 4 |
| 3 | User control | 3 |
| 4 | Consistency | 3 |
| 5 | Error prevention | n/a |
| 6 | Recognition vs recall | 3 |
| 7 | Flexibility | 3 |
| 8 | Minimalist design | 4 |
| 9 | Error recovery | n/a |
| 10 | Help | 4 |
Total 27/32.

Detector: 3 warnings outside the target (overused-font geist; pulsing-dot on chat typing indicators, reduced-motion handled) — not in scope. Overlay injection blocked by the panel's CSP (script-src 'self').
Browser: .project-item 44px tall; dot contrast 5.1–8.3:1 in light and dark.

Priority issues:
- P2: dot states differ by colour only (red vs grey close in dark lightness). Changing shapes would alter the validated DESIGN.md (8px dots) — out of this feature's scope.
- P2: legends only on hover/aria — adding visible legend text is forbidden by "Textes à l'écran"; kept.
- P3: no transition when a dot changes — the list is rebuilt on each change, a CSS transition would not play; not applied.
- P3: phone chevron badge small; hover tint in dialog close to list background — unchanged by this branch.
No regression: the branch makes no visual change.

Questions skipped: run autonome de la factory
