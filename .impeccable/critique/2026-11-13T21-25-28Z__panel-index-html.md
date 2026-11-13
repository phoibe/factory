---
target: panel board status line
total_score: 18
max_score: 28
na_heuristics: 3,5,7
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:cdf8359e7d943f7616b05bb8ddda0d5c1dbdb11ba027584046b393fcfa65b616"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-13T21-25-28Z
slug: panel-index-html
---
# Critique: panel board, « En direct » status line (issue #397)

Method: two isolated sub-agent assessments (A design review, B detector + screenshots), desktop 1280 and phone 390.

## Design specificity
Specific enough: small, muted, a single dot, fits « un outil précis et calme ». The fix removes a real lie (the previous project's « à jour à l'instant » / « Connexion perdue » shown on a project not read yet).

## Heuristics (n/a: 3, 5, 7)
| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 |
| 2 | Match with the real world | 2 |
| 4 | Consistency and standards | 3 |
| 6 | Recognition rather than recall | 3 |
| 8 | Aesthetic and minimalist design | 2 |
| 9 | Error recovery | 2 |
| 10 | Help and documentation | 3 |
Total 18/28.

## Deterministic scan
7 findings (Geist font ×3, pulsing typing dots ×2 in the chat, side-tab border, 8px radius): none on the changed line; all pre-existing.

## Priority issues
- [P2] Green dot while « mise à jour… » claims health before the first read → neutral dot until read (in scope, fixed).
- [P2] « En direct · à jour il y a 25 s » exposes the polling rhythm; could show nothing when all is fine (pre-existing, out of scope).
- [P2] « Connexion à GitHub perdue · nouvel essai automatique » names GitHub and narrates the retry (pre-existing, out of scope).
- [P3] The seconds counter ticks without any action depending on it (pre-existing).
- [P3] An outage is not announced to assistive technology (pre-existing).

## Persona red flags
Pierre on phone: green dot next to « mise à jour… » reads as « tout va bien ».

## Minor
Line sits close to « 1 en file » at the same grey (pre-existing).
