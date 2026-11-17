---
target: "panel, every screen (general review #394)"
total_score: 28
max_score: 36
first_score: 25
na_heuristics: 10
p0_count: 0
p1_count: 3
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-13T19-30-00Z
slug: panel-index-html
---
Method: dual-agent (A: design review on screenshots + source · B: detector + browser measurements), then one re-check evaluation after the fixes.
Screens: login (desktop, phone), empty project, busy board (light/dark, 1280 px and 390 px), phone « Plus » menu, phone project switcher, release dialog, stack sheet, Agent (desktop, phone), Paramètres (desktop, phone dark, « Avancé » opened).

## Scores
First critique 25/36 · re-check 28/36 (help n/a: screen-text rule).

## Fixed
- [P1] Explanatory texts in the Agent tab shortened: « L'agent réfléchit · en général 1 à 3 min » → « L'agent réfléchit… »; the « pas encore de réponse » notice no longer explains the agent's daily launch limit.
- [P1] Jargon: « elle s'arrête au merge » removed from the « Externe » production choice in Paramètres.
- [P2] Font sizes back on the DESIGN.md ramp (release card lists and links, stack sheet headings, Paramètres section titles); detector `design-system-font-size` ×5.
- [P2] Links get the same 2 px ink focus ring as buttons (they had the browser default); DESIGN.md now says the focus ring is ink, as the code already did (blue stays for what waits for an answer).
- [P3] Stack sheet: double divider under the title removed. Paramètres: the 2 px black rule between sections is a 1 px line like everywhere else. Agent list: no more uppercase separator (the only one in the app).
- [P3] Quiet links (« Voir les demandes sur GitHub », agent counter) measured 43.5–43.9 px high: now 44 px.
- DESIGN.md: dark values of green and red documented.

## False positives
- Card hover turning blue (`style.css:105`): overridden by the issue-123 layer (`:316`, `:350`).
- Detector: overused-font Geist (chosen), pulsing typing dots (live state), `.bubble blockquote` grey quote bar (line colour, not an accent).
- Card buttons 32 px and title links 19 px: the 44 px hit areas exist (`::after`).
- Paramètres technical vocabulary: folded under « Avancé » by the owner-validated issue #342.
- Agent tab example prompts and card time lines: validated specs, clickable shortcuts and status, not explanations.

## Remaining (issues opened)
- « Jeter » an idea has no « Annuler (5 s) » like « go » (#402).
- Paramètres stays long on a phone (« Étapes » = 9 boxes); « Stack technique », « Review générale », « Outils Mac » remain first-level labels on desktop.
- « En ligne : version inconnue » stays vague (spec #372).

Questions skipped: run autonome de la factory
