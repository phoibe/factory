# Critique — Réglages généraux (#544), 2026-11-24

Method: dual-agent (A: design review · B: detector + browser evidence)

Score: 29/40 (no P0/P1, no re-critique).

## Fixes applied
- Routine paragraph shortened to two sentences.
- Top button shows its pressed state while the page is open (aria-pressed).
- Unsaved choices kept on back/reopen (done in the review fixes).

## Kept on purpose
- Legend « Machine des tâches » and the Revue help wording: words validated by the owner in the spec; the page title already says the scope.
- Detector findings (5) are outside this page (false positives here).

---
# Assessment A (design review): Réglages généraux

## Design specificity verdict
Faithful to the product's own system (framed fieldset blocks with legend on the frame, one setting per row split by a hairline, grey bold-label pattern, sticky Enregistrer bar). It is a quiet settings page, grounded in the panel but not distinctive: any settings page could use it. That is right for Operate mode and for PRODUCT.md "outil précis et calme". Coherent with Paramètres (same fieldset/legend, same machineRadios). No missed character opportunity worth pursuing.

## Nielsen scores
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | "Modifications non enregistrées / Tout est enregistré" + disabled button are good; no visible hint of WHICH row changed; page open state in top bar not marked (no active state on « Réglages généraux ») |
| 2 | Match real world | 3 | Role names are clear in French; "Fable / Opus / Sonnet (5.2 / 5.5 aujourd'hui)" is jargon but it is the owner's own vocabulary; "PR", "review" in help text of Revue is English/tech for a non-code reader |
| 3 | User control | 3 | Back link restores tab; unsaved changes kept when reopened. No "Annuler / revenir" for edits, and leaving via back link with dirty state gives no warning (state silently kept) |
| 4 | Consistency | 3 | Matches Paramètres blocks. Differences: Modèles rows have help text (spec exception) while DESIGN says "pas d'aide sous les champs" elsewhere; the top-bar button stays visible, so no state change on it |
| 5 | Error prevention | 3 | Unreadable-settings guard exists (general.unreadable). Switching the global machine has no hint it affects every project (only title + link context) |
| 6 | Recognition | 3 | Labels visible above each select, current values shown. 4 selects look identical; roles differ only by text |
| 7 | Flexibility | 2 | Fine for 2 blocks; no keyboard shortcut or reset-to-default, no per-role default indicator |
| 8 | Minimalist design | 3 | Short and clean. Closing paragraph (models-note) is 4 sentences, ~330 characters, long for "textes courts"; grey small text on mobile becomes a wall |
| 9 | Error recovery | 3 | Failure toast "Échec de l'enregistrement. …" present; no inline error near the bar |
| 10 | Help & docs | 3 | Per-role help does the job; claude.ai note explains the limit. Too long and sits under the 4th select (mobile: hidden behind the sticky bar in the screenshot, an artifact) |
| **Total** | | **29/40** | **Good** |

## Cognitive load
Checklist failures: 1 (minimal choices: 4 selects + 2 radios = 6 decisions on one screen, borderline; each is independent and grouped, so acceptable). Single focus OK, chunking OK (4 + 2), hierarchy OK. Verdict: low (0-1 failures).
Note: 4 sibling selects whose options are identical (same model list) make the model-to-role mapping the only thing to remember; the help phrase carries it.

## Strengths
1. Strong consistency with Paramètres: same framed fieldsets, legend on the frame, hairlines, radio rows; the page feels native and calm.
2. Clear flow in/out: « ← Retour au projet » underlined link first, h1, focus moved to title on open, back restores the previous tab; sticky save bar with an explicit state.
3. Dark and mobile hold up: single column, full-width selects, 44px targets, good contrast in both themes.

## Priority issues
1. [P2] Machine choice has no scope cue. "Machine des tâches" on this page applies to every project, but the fieldset says nothing; Paramètres says "Comme le réglage de tous les projets". Fix: in app.mjs renderGeneral (`el('legend', {}, 'Machine des tâches')`) rename legend to "Machine des tâches, tous les projets" (or put "Tous les projets" in the h1 area via index.html `#general-title` sibling grey line "S'applique à tous les projets"; a title is allowed, a paragraph is not). Same for « Modèles ».
2. [P2] models-note too long / badly placed. In app.mjs `el('p', { class: 'models-note' }, …)` cut to two sentences, e.g. « Le modèle de l'agent qui pilote se règle dans la routine du projet, sur claude.ai. » Drop the "Ce pilote confie toujours…" sentence (internal mechanism, non-actionable for Pierre). Check `.models-note` in style.css keeps margin so it is not glued to the last select/savebar.
4. [P2] Jargon in role help: « Revue » help says "avant chaque PR… review générale" (tech English). Fix in the MODEL_ROLES `help` strings (app.mjs/lib): « Relecture finale avant chaque livraison, revue de sécurité, bilan d'une review générale. »
3. [P3] No cue on the top bar that the page is open. `#general-open` (index.html line 20): add `aria-current="page"` and a pressed style (`.ghost[aria-current]`) while `#project-view.on-general`; set/unset in openGeneral()/closeGeneral().
5. [P3] Leaving with unsaved changes is silent (state kept in `general`, survives reopen). Fix: in closeGeneral when generalDirty(), show a toast « Modifications non enregistrées conservées », or disable nothing; one line, no dialog.

## Persona red flags
- Pierre on phone ("go" in seconds): the sticky bar covers the bottom of the last select when scrolling; confirm the form has bottom padding equal to the bar height (`#general` padding-bottom) so the last field and note stay reachable.
- First-timer Jordan: "Fable / Opus / Sonnet" with versions in parentheses gives no cue which is stronger or cheaper; the role help is the only guide.
- Stress tester Riley: changes the machine to GitHub for all projects with no confirmation and no scope text (issue 1).
- Keyboard/SR Sam: focus goes to the h1 on open (good), selects are linked to help via aria-describedby (good); the radio fieldsets have a legend (good).

## Minor observations
- The project list rail ("Projets") remains visible next to the general page while the project header disappears: slightly ambiguous context; OK.
- Selected model label "5.2 aujourd'hui" uses a typographic apostrophe consistently; good.
- Radio rows in Machine have no explanation of "Serveur de dev" vs "Machines GitHub" here, while Paramètres has a status line; acceptable under the text rule, but a title-attribute-free option is to reuse the status line (`currentMachineLine`) if short.
- Link « Changer le réglage de tous les projets » (Paramètres → Avancé): sits after the radio block with the underline style, good affordance, 44px height; it follows the machine radios so the destination is predictable. Minor: it is far from the other Avancé blocks visually (looks detached after a long fieldset); consider placing it in the same `.rules-more` spacing as other sections (already margin 0 0 16px).

---
# Assessment B (detector + navigateur) - Réglages généraux

## CLI: exit 2, 5 findings sur panel/index.html + panel/app.mjs
- broken-image (warning) index.html: "<img> with no src attribute" (ligne 0). Probablement FP / hors cible (img rempli par JS ou hors page Réglages): à vérifier, sans lien avec la nouvelle page.
- overused-font (warning) index.html: Geist. Choix de marque existant, pas lié à la page.
- pulsing-dot x2 (warning) index.html: .typing-dot et .bubble.typing span (animation blink). Vrais indicateurs "en train d'écrire" du chat: FP/hors cible.
- design-system-radius (advisory) app.mjs:3387: border-radius 8px dans showWidthReport (bandeau de debug ?largeur). Hors page Réglages: FP pour cette critique.
Aucun finding sur la page Réglages généraux ni sur le lien d'Avancé.

## Mesures navigateur (Chromium, fake GitHub, script: scratchpad/measB.mjs)
- Contraste (ratio calculé, fond effectif): textes d'aide (13px) 6.05 clair / 6.66 sombre; note modèle de la routine 6.05 / 6.66; "Tout est enregistré" / "Modifications non enregistrées" 5.84 clair / 7.15 sombre; titres et labels 15.7 à 19.2. Tout >= 4.5 (AA OK), aucun échec.
- Débordement horizontal: aucun (scrollWidth = innerWidth: 1280 et 390, clair et sombre).
- Cibles tactiles à 390px: bouton Retour 139x44, selects 324x44, labels radio 116x44 et 131x44 (l'input natif fait 18x18 mais le label cliquable fait 44 de haut), Enregistrer 116x44. Toutes >= 44. Labels des selects 34px de haut (texte seul, pas une cible).
- Focus clavier (:focus-visible vrai): Retour, selects, radios ont tous outline 2px solide offset 2px, couleur rgb(14,15,17) en clair, rgb(242,242,239) en sombre. Visible et contrasté. Pas de box-shadow de remplacement nécessaire.
- Largeur des selects sur desktop 420px, labels 974px: ok.
- Taille du texte d'aide 13px: petit mais conforme au contraste; seul point de vigilance lisibilité mobile.

## Faux positifs / limites
- Les 5 findings CLI sont tous hors page Réglages (voir ci-dessus). Pas d'overlay live-server injecté (mesures par script Playwright uniquement). Pas de capture de focus examinée visuellement, valeurs calculées seulement.
