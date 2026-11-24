---
target: "panel main screens after #560 split"
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/.claude/worktrees/agent-a97fa8bb9625681d7/panel/index.html"
target_fingerprint: "sha256:db2d586bcc0559983dbace802b09dd53f44e57c1020fdb42d03bda7104692004"
target_path: /home/user/factory/.claude/worktrees/agent-a97fa8bb9625681d7/panel/index.html
timestamp: 2026-11-24T17-23-44Z
slug: panel-index-html
---
⚠️ DEGRADED: single-context (the caller forbade dispatching sub-agents; Assessment A finished and recorded before the detector ran, then Assessment B, then synthesis)

# Critique — panel after the screen-module split (#560), 2026-11-24

Scope: issue #560 is a pure refactor (panel/app.mjs split into one module per screen) whose validated spec forbids any visible change. This critique covers the main screens as they render on branch `claude/issue-560-panel-split` (afff7c0): sign-in, project list (desktop column and phone full-screen list), project top + « Suivi », « Agent », « Paramètres », « Réglages généraux », at 1366×900 and 390×844, served with fake GitHub data (e2e/fixture.mjs).
**Nothing is fixed in this PR** (spec: « Aucun changement visible »). Every finding below is an idea to file separately.
Judged against PRODUCT.md, DESIGN.md (including « Mises en page ») and the « Textes à l'écran » rule (no text that explains how a screen works; titles, labels, short error messages, one sentence on an empty screen).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | « En direct · à jour à l'instant », step bars, « Tout est enregistré » are clear; status dots in the project list carry state at a glance |
| 2 | Match System / Real World | 2 | English jargon on first-level buttons for a non-coder owner: « Review générale », « Amélioration UI », « Stack technique »; « PR », « review » in the Réglages généraux help |
| 3 | User Control and Freedom | 3 | « ← Retour au projet », Échap on dialogs, « Fermer » on the phone list; Plus menu closes outside |
| 4 | Consistency and Standards | 3 | Two settings pages with different title levels (« Ce projet : r » small vs « Réglages généraux » display); phone « Plus » mixes three visual styles |
| 5 | Error Prevention | 3 | Sticky save bar, disabled when clean; « go » sends at once by design |
| 6 | Recognition Rather Than Recall | 3 | Labels visible, current project marked (bold, own background); tabs always visible |
| 7 | Flexibility and Efficiency | 3 | One-tap « go » on phone, project switch in one tap; no shortcuts needed for a single owner |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, flat, one blue voice; phone « Plus » holds 10 entries; Réglages généraux carries 4 help lines + a 3-sentence paragraph |
| 9 | Error Recovery | 3 | Not exercised here beyond existing toasts/« Réessayer » (unchanged by the refactor) |
| 10 | Help and Documentation | 3 | Agent empty state shows three example messages, the right kind of help; explanatory paragraph on Réglages généraux goes the other way |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: The panel is authored for this product: the « À vous de jouer » section with its single blue « go », step bars in mono, the project column with one status dot each, the chevron dot on phone that says *another* project waits. It follows « Le plan d'architecte » faithfully (flat, hairlines, paper/surface contrast, one blue voice). Layout matches « Mises en page »: header order, 1100 px content, 240 px column glued right above 900 px, settings blocks with legend on the frame and sticky save bar, Réglages généraux replacing the project view with the top button pressed, selects ≤ 420 px, sign-in card ≤ 560 px centred. No layout contradiction found. Weak spots are copy (anglicisms, explanatory text) and the phone « Plus » menu, not structure.

**Deterministic scan** (`impeccable detect --json panel`, exit 2, 7 findings):
- `overused-font` ×3 (index.html, style.css l.1-2: Geist / Geist Mono) — false positive: fonts pinned by DESIGN.md.
- `broken-image` ×1 (index.html `#lightbox-img` without src) — false positive: src is set when the image viewer opens.
- `pulsing-dot` ×2 (`.typing-dot`, `.bubble.typing span`, infinite « blink ») — real but minor: DESIGN.md wants motion « presque invisible »; a calmer or finite cue would fit better.
- `side-tab` ×1 (style.css l.283, `.bubble blockquote { border-left: 3px solid var(--line) }`) — borderline: grey quote rule in agent answers, not a coloured stripe, but DESIGN.md « Don't » lists side borders.

**Visual overlays**: injected detect.js into the live panel (desktop and phone, CSP stripped in the test harness only) — console: 1 anti-pattern, `overused-font` (Geist 86% of text), same false positive. No user-visible [Human] tab (headless Playwright run).

## Overall Impression
The refactor renders a panel identical in structure to DESIGN.md; nothing visible regressed. The biggest opportunity is the words: first-level labels still speak English/dev jargon, and one settings page explains itself in paragraphs.

## What's Working
- One blue voice: only the « go » button and the blue project dots; everything else ink/grey, so the eye lands on what waits.
- Layout discipline: same grid of 280 px cards in every section, same block frames in both settings pages, sticky « Enregistrer » bar.
- Phone header: name + chevron with the other-project dot, then exactly « Nouvelle fonctionnalité » + « Plus » on one line, « go » right under it.

## Priority Issues

- **[P2] Phone « Plus » menu is a wall of 10 mixed entries**: 3 small underlined links (site, GitHub, agents), 4 ink buttons, then 3 grey buttons (« Outils Mac », « Réglages généraux », « Se déconnecter »).
  **Why**: > 7 options, three visual weights with no grouping logic the owner can read; « Outils Mac » is useless on a phone.
  **Fix**: group (project actions / links / account), one style per group, drop or demote « Outils Mac » on phone.
  **Suggested command**: /impeccable distill

- **[P2] English and dev jargon at first level**: « Review générale », « Amélioration UI », « Stack technique », and « PR », « review » in the Revue help of Réglages généraux.
  **Why**: PRODUCT.md: owner writes French, never reads code; DESIGN.md Don't: « pas de jargon technique au premier niveau ».
  **Fix**: French labels (e.g. « Revue générale », « Retouche de l'apparence », « Technologies »), « modification » for PR.
  **Suggested command**: /impeccable clarify

- **[P2] « Textes à l'écran »: Réglages généraux explains itself**: a grey help sentence under each of the 4 roles plus a 3-sentence paragraph about claude.ai under the selects.
  **Why**: the rule forbids help under fields when the label suffices and text that explains how the screen works; DESIGN.md « Mises en page » currently validates these lines (spec #544), so this needs the owner's call.
  **Fix**: ask the owner whether to keep them (owner exception) or reduce to labels only (shorten the paragraph to one line or remove).
  **Suggested command**: /impeccable clarify

- **[P3] Two settings pages, two title levels**: « Ce projet : r » is a small bold heading; « Réglages généraux » is a display h1.
  **Why**: same page type in « Mises en page », different hierarchy.
  **Fix**: align both on one heading level.
  **Suggested command**: /impeccable typeset

## Persona Red Flags

**Pierre (owner, phone, « go » in seconds)**: lands on the card fine; opening « Plus » to reach « Réglages généraux » means scanning 10 entries in 3 styles; « Review générale » / « Amélioration UI » read as developer words.

**Sam (accessibility)**: targets ≥ 44 px measured on interactive elements (only the inline link row is 44 px by padding); focus ring ink 2 px; typing dots blink forever (reduced-motion not verified in this pass).

**Jordan (first-timer)**: sign-in is one card, one field, one blue button — clear. Agent empty state gives three example messages, good. Paramètres « Avancé » summary line « Serveur de dev · 7 contrôles sur 7 · 4 savoir-faire activés » is jargon-dense but folded.

## Minor Observations
- Empty « Agent » tab on desktop shows « Nouvelle conversation » twice side by side (list button and conversation header).
- No non-breaking space after « / before »: on phone « avec le bouton « » breaks with « at line end (Paramètres, Mise en production).
- « À vous » card: title and « Validez la spec » have the same weight and size; the request line competes with the title.
- Sign-in on phone: « Créer le jeton sur GitHub (tous les dépôts) ↗ » wraps on two lines inside a button.
- Detector: blinking typing dots (infinite) and grey quote side rule in agent answers (see above).

## Questions to Consider
- What if « Plus » on phone only held project actions, with account actions behind the logo?
- Does Réglages généraux need any sentence the role name does not already say?
- What would the action row look like entirely in plain French?

Questions skipped: run autonome de la factory
