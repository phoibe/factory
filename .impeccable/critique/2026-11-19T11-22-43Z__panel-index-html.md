---
target: "panneau, alerte serveur de dev (#504)"
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:8d0dc75e05327f2bca6e7fce743ba55e9d64d688725a29f8e126192791266478"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-19T11-22-43Z
slug: panel-index-html
---
# Critique: alerte « projet pas vu par le serveur de dev » (issue #504)

Method: two isolated sub-agents (A design review, B detector + browser evidence). Questions skipped: run autonome de la factory.

## Design Health Score: 29/40
| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of status | 4 |
| 2 | Match with real world | 3 |
| 3 | User control | 3 |
| 4 | Consistency | 2 |
| 5 | Error prevention | 3 |
| 6 | Recognition over recall | 3 |
| 7 | Flexibility | 3 |
| 8 | Aesthetic / minimalist | 2 |
| 9 | Error recovery | 3 |
| 10 | Help | 3 |

## Design specificity
Native to the panel: DESIGN.md warn-soft / warn-line « ⚠️ » callout colours, quiet secondary button, one sentence naming the consequence.

## Deterministic scan
4 warnings in panel/index.html (broken-image, overused-font, 2 pulsing-dot): all pre-existing, none on the new elements. Overlay not injectable (panel CSP blocks the detector's WebAssembly). Browser: banner text 17.65:1 light / 13.37:1 dark, help text 5.57:1 / 5.68:1, button 44 px high, no horizontal scroll at 375 px, axe-core 0 violations on #runner-alert and #projects-list.

## Priority issues
- P1 Settings line red and stuttering (« Serveur de dev : ce projet n'est pas vu par le serveur de dev : … »), inconsistent with the orange banner.
- P1 Phone: the « ! » mark lives in the project list (behind the switch); only the banner text says which project.
- P2 Help sentence floats right of the button on desktop; order should be message, step, button.
- P2 Banner pushes the head down on every tab (acceptable: it disappears once fixed).
- P3 Banner names another project than the open one: name is first, in bold.
- P3 « ! » ring low non-text contrast (glyph itself 17:1).

## Persona red flags
- Pierre on phone: no confirmation after ticking the project until the next check (spec: 15 min at most).
- Persistent orange can become noise if the fix is deferred.

## Minor observations
- « ! » on the right, status dots on the left: no clash.
