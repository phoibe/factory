# Critique — page « Consommation » (#628)

Method: two isolated sub-agents (Assessment A: design review; Assessment B: detector + browser evidence), synthesized by the pilot.
Questions skipped: run autonome de la factory.

## Synthesis

**Design Health Score: 25/40 (Acceptable)** — from Assessment A.

Both assessments agree on the main defect: the table is cut off on the right at 1280 px (« Semaine tous moteurs ») and, at 390 px, every figure sits off-screen with no sign the frame scrolls. The detector caught nothing in the new code (its 7 warnings are false positives or older code: Geist is the DESIGN.md font, chat blockquote, lightbox image, typing dots). Assessment B also noticed that mono is applied to words (« trop peu de mesures », times inside sentences), which Assessment A rates P2.

Priority issues to fix (all):
- P1 Table overflow on desktop and phone (wide mono phrase in « En moyenne », headers that never wrap; phone: fold engine under type, keep first column in place, show that it scrolls).
- P1 Disabled controls look active (« Enregistrer », « Noter le relevé », locked fields); silent failure on a first visit; no « Enregistrement… » state.
- P2 No way out of the Oui/Non question (no « Annuler »).
- P2 Mono only for digits, not whole cells/phrases.
- Cognitive load: weekly reset (set once) stays open above the reading (done each time).
- Screen reader: « Mon forfait » is a legend, not a heading.
- Minor: filters and price line on the empty state; label weights in « Mon forfait »; calibration line wraps to 3 lines on phone; row toggle underlines like a link; expanded rows repeat « trop peu de mesures »; « Supprimer ce relevé » without confirmation.

Code-review remarks folded into the same wave: unsaved reset draft erased after noting a reading; « Choisissez un jour et une heure. » stays after correction.

Out of scope (pre-existing, not changed by #628): the long explanatory paragraph `p.models-note` in « Réglages généraux ».

---

## Assessment A (design review)

# Assessment A: Design Review (issue #628, « Consommation » + link in « Réglages généraux »)

Target: `panel/screen-usage.mjs` (+ `panel/style.css` l.766-805, `panel/index.html` l.117-120, `panel/screen-general.mjs` l.102).
Branch `claude/issue-628-consommation` @ 957ad64. Mode: Operate.
Method: source read + Playwright screenshots through `e2e/fixture.mjs` (1280x900 and 390x844, light and dark, deviceScaleFactor 1):
uncalibrated, question Oui/Non, calibrated with « Revue » expanded, empty state, Réglages généraux.
Files: `/tmp/claude-0/-home-user-factory/494eb2f2-dc79-5ee6-9616-a103c8ec77aa/scratchpad/critique/A-*.png` (script `shotsA.mjs`).
I did not run the detector and did not look at any detector output.
Note: no structured question tool or decision page is used. This is a subagent brief, so the judgment comes from the brief, PRODUCT.md and DESIGN.md alone.

## Design specificity verdict

**Authored for this product.** The page uses the panel's existing vocabulary instead of a generic analytics look. It has the « ← Retour » link-button and the display title. « Mon forfait » is a framed block with its title on the frame, the same as Paramètres and Réglages généraux. Figures are in mono and the palette is monochrome with no blue at all, which is correct because nothing on this page waits for an answer. There are no charts, cards or KPI tiles, as the brief asks. The table language is the owner's own: « Moteur · effort », « Semaine de forfait en cours », « relectures 2 et 3 », « trop peu de mesures ».

One weakness is that « Mon forfait » is a plain stack of form controls with no hierarchy between what you set once (the weekly reset) and what you do every time (the reading). That part reads like a settings form, not a tool.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Disabled buttons (« Enregistrer » with no change, « Noter le relevé » before a reset exists, the fields while the question is open) look exactly like active ones. Saving shows no « Enregistrement… » on the button. « Chargement… », the role=status message and the save toast are good. |
| 2 | Match System / Real World | 3 | Plain French throughout. « tokens », « étalonnage », « jauge », « (provisoire) » are borderline jargon, but the spec requires them and the owner knows them. |
| 3 | User Control and Freedom | 2 | Once the Oui/Non question appears there is no way to back out (no « Annuler »; the fields are locked). « Supprimer ce relevé » has no undo and can wipe a calibration. The back link keeps unsaved general settings (good). |
| 4 | Consistency and Standards | 3 | Two mono treatments on one page: whole table cells are mono (units and phrases included), while the plan lines put only the digits in mono. Field label weights are inconsistent (« Jour »/« Heure » grey regular, « Tous moteurs (%) » bold, gauge legend 500). |
| 5 | Error Prevention | 3 | 0-100 validation, a half-set reset refused, and a merge with readings noted on another device all work. The guards are silent disabled states, though (see 1). |
| 6 | Recognition Rather Than Recall | 3 | The last reading and the calibration are always shown. On a phone, the figures are off-screen and nothing shows that they exist. |
| 7 | Flexibility and Efficiency | 2 | The Période and Taille filters work, and the table is a keyboard-scrollable region. The page does not remember the period or the expanded rows when reopened. The frequent action (« Nouveau relevé ») sits below the rarely used reset. |
| 8 | Aesthetic and Minimalist Design | 2 | The table overflows at 1280px (last column clipped). « trop peu de mesures » appears 5 times in wide mono. In the empty state, filters and the « Ce n'est pas une facture » footnote qualify nothing. |
| 9 | Error Recovery | 3 | Short actionable messages: « Entrez un nombre entre 0 et 100. », « Choisissez un jour et une heure. », « Les chiffres de s n'ont pas pu être lus. », « Impossible de lire les réglages actuels. Réessayez dans un instant. » |
| 10 | Help and Documentation | 2 | The no-explanation rule is respected (only the grey lines the spec allows). The one place help is missing is why « Noter le relevé » does nothing on a first visit. |
| **Total** | | **25/40** | **Acceptable** |

## Cognitive load

Checklist failures (3 of 8, moderate):
- **Chunking:** up to 7 table columns. « Mon forfait » has 5 sub-parts in one frame: reset, reading, question, last reading, calibration and split.
- **Minimal choices:** the reset sub-block shows 4 selects and 1 button at once (5 controls, above the limit of 4).
- **Progressive disclosure:** the weekly reset is set once in the product's life but stays fully open above the recurring reading on every visit.

Passes: single focus, grouping (the frame), hierarchy of the title, filters and table, working memory (the last reading is restated), one decision at a time (the question only appears when needed).

## Emotional journey

- **Peak:** after the second reading, the plan columns appear and the line reads « Jauge tous moteurs à 20 % : factory ≈ 10 %, hors factory ≈ 10 % ». That is the payoff, but it arrives as three dense grey-free lines at the very bottom, under the form.
- **Valley:** on a first visit Pierre types a reading, presses « Noter le relevé », and nothing happens. The button is disabled because no reset is saved, but it looks enabled and no message appears.
- **End:** the page ends on the calibration text rather than on a clear « this week, the factory used X % ».

## What is working

1. **The table is right in kind.** Figures are right-aligned and mono, tokens sit small and grey under the dollars, and the 2px rule above « Total ». Expandable rows use a real `<button aria-expanded aria-controls>` with a rotating chevron, and the kind rows use surface-2 with indented normal-weight names. It looks like a precise instrument, not an enterprise dashboard.
2. **Restraint.** No blue anywhere, no charts, no intro paragraph. The only explanations are the ones the spec requires (the price line, the « En dehors de la factory » line, the calibration messages).
3. **Focus handling and state honesty.** Focus moves to the question, then to the result message. Unreadable projects are named individually. A reading noted on another device is merged before writing. The link from « Réglages généraux » sits cleanly under the « Modèles » frame, and the return path keeps unsaved choices.

## Priority issues

**[P1] The plan columns are clipped on a 1280px desktop**
- **Where:** `panel/screen-usage.mjs` `table()` (`fig(fmtAverage(...))`) and `panel/style.css` l.776 (`white-space: nowrap`), l.779 (`td.fig { font-family: var(--mono) }`).
- **What:** with the calibrated columns, the « Semaine tous moteurs » header and all its values (« ≈ 4,5 % », « ≈ 10 % ») are cut at the right edge of the frame at 1280px. The cause is mainly the « En moyenne » column, which sets « trop peu de mesures » in wide mono, plus nowrap headers.
- **Why it matters:** the plan share is the column the whole calibration flow exists to produce, and on the main desktop it is half hidden behind a scroll with no visible hint.
- **Fix:**
  - Render the non-numeric cell text (« trop peu de mesures », « tarif inconnu ») in the body font, muted, at 13px.
  - Let the column headers wrap onto two lines.
  - Tighten the horizontal padding to 8px for figure columns.
  - Check that all 7 columns fit at 1100px of content.
- **Suggested command:** /impeccable layout

**[P1] On a phone, the table shows names and no figures**
- **Where:** `panel/style.css` l.773-784.
- **What:** at 390px only « Type de tâche », « Moteur · effort » and a clipped « Tâ » are visible. The dollars, the averages and the plan share are all off-screen to the right. The expanded kind rows look like empty grey bands.
- **Why it matters:** Pierre checks things on his phone first. The answer to « how much? » needs a sideways scroll that nothing announces.
- **Fix:** below about 600px, either:
  - fold « Moteur · effort » into a second grey line under the type name and make the first column sticky (`position: sticky; left: 0`, with a surface background), so « Tâches » and « Total » fit on the first screen; or
  - drop « Moteur · effort » into the expanded detail.

  The spec's « défile de gauche à droite » can stay for the extra columns.
- **Suggested command:** /impeccable adapt

**[P1] Disabled buttons look active; the first reading fails silently**
- **Where:** `panel/screen-usage.mjs` `plan()`: `usage-reset-save` is `disabled: off || !resetChanged`, and `usage-reading-save` is `disabled: off || !q.reset.all || !!usage.asking`. In `panel/style.css` there is no `.secondary:disabled` / `button:disabled` style for this page; the other screens each define their own (opacity .55-.6).
- **What:** « Enregistrer », « Noter le relevé », the reading fields during the question, and every control during a save all keep their full enabled look.
- **Why it matters:** on a first visit the reading cannot be noted until a reset is saved. Pierre types « 20 », taps, and nothing happens: this is the main valley of the page. During a save nothing shows that the tap was taken.
- **Fix:**
  - Give disabled controls in `#usage-view` the panel's usual disabled treatment (opacity .55, `cursor: default`).
  - Keep « Noter le relevé » enabled without a reset. On click, answer with a short error that says what to do, for example « Choisissez d'abord le jour et l'heure de remise à zéro. » (allowed by « Textes à l'écran »).
  - Show « Enregistrement… » on the button being saved.
- **Suggested command:** /impeccable harden

**[P2] The Oui/Non question has no exit**
- **Where:** `plan()`, the `usage.asking` branch.
- **What:** after « Noter le relevé » the two fields are locked and only « Oui » or « Non » can move on. A typo in the reading (« 2 » instead of « 20 ») cannot be corrected except by leaving the page.
- **Fix:** add a quiet « Annuler » button next to Oui/Non that clears `usage.asking` and gives the field focus back, or keep the fields editable while asking.
- **Suggested command:** /impeccable harden

**[P2] The table breaks the Mono Numbers Rule; the page uses two mono treatments**
- **Where:** `panel/style.css` l.779; `money()` and `fig()` in `screen-usage.mjs`.
- **What:** whole cells are mono: « $ », « 500 000 tokens », « 1 M de tokens », « trop peu de mesures », « tarif inconnu ». DESIGN.md (« le chiffre seul … l'unité reste dans la police du texte ») and the comment at style.css l.436 (« never whole sentences ») say otherwise. The « Mon forfait » lines on the same page wrap only the digits.
- **Why it matters:** the table looks typewriter-like and visibly different from the lines just below it, and the wide mono phrases cause the P1 overflow.
- **Fix:** run the cell text through the same digit wrapper (`numbers.mjs`) and keep `font-variant-numeric: tabular-nums` with right alignment on the cell for column alignment.
- **Suggested command:** /impeccable typeset

## Persona red flags

**Casey (distracted mobile user; Pierre on his phone):**
- The table on the first screen shows no dollar figure at all.
- « Nouveau relevé », the only recurring action, is about 1,100px down, below the table and the 4 reset selects.
- Six selects and two inputs with 44px targets is fine, but « Oui » and « Non » sit 8px apart.
- After the screen is turned off, an unanswered question is lost with no trace (in-memory `usage.asking`).

**Jordan (first-timer, first visit to « Mon forfait »):**
- « Noter le relevé » is silently inert until the reset is saved, and nothing says so.
- « Pas encore d'étalonnage » says what is missing but not what to do (the wording is spec-required, but a first step is not suggested anywhere).
- Fable's « — » reset is optional, but nothing distinguishes it from the required « Tous moteurs » one until the error message.

**Sam (keyboard and screen reader):**
- Mostly good: the table is a focusable named region, row toggles expose `aria-expanded`/`aria-controls`, and focus moves to the question and then to the role=status message.
- Red flags:
  - « Mon forfait » is a `<legend>`, not a heading, so the heading outline jumps from h1 « Consommation » to h2 « Remise à zéro de la semaine » with no parent.
  - Disabled buttons are announced as dimmed but look identical, which hurts low-vision keyboard users.
  - « ≈ » is read as « approximately equal to » before every share: verbose but acceptable.

## Minor observations

- **Empty state:** the Période and Taille filters and the grey « Équivalent au tarif public… Ce n'est pas une facture. » line stay visible with nothing to filter or qualify. Hiding the filters (and the line) when there is no measure would leave just the dashed sentence. The line itself is spec-allowed; its presence in the empty state is a design choice.
- **Label weights in « Mon forfait »:** « Jour »/« Heure » are grey regular, « Tous moteurs (%) »/« Fable (%) » are bold, and the « Tous moteurs »/« Fable » legends are 500. Pick one label style, the bold label from Paramètres.
- **Calibration line:** « Étalonnage du 28 nov. · 1 % de la semaine tous moteurs ≈ 2,22 $ · 1 % de la semaine Fable ≈ 1,20 $ (provisoire) » wraps to 3 lines on a phone. The two « Jauge … » lines below it carry the real answer and could come first or be slightly emphasised.
- **« Jauge … » lines:** they appear offset by about 1px from the calibration line at 1280px (check margins).
- **« Supprimer ce relevé »:** it deletes without confirmation and may remove the calibration it produced. That is acceptable for the last reading only, but worth a short « Relevé supprimé. » status.
- **Hover on the row toggle:** it underlines the type name, which looks like a link rather than a disclosure. The chevron is enough, so the underline could be dropped.
- **Kind rows:** they repeat « trop peu de mesures » on every line. When the parent row already says it, a « — » in the children would cut the noise.
- **Réglages généraux:** « Voir la consommation » sits alone between the two frames, after the grey pilot paragraph. It is correct per spec and readable. On a phone it is the only link-style element between two framed blocks, which is fine.
- **Header button:** « Réglages généraux » stays pressed on the Consommation page, as specified. Good.

## Questions to consider

- Should « Nouveau relevé » come first in « Mon forfait », with the weekly reset folded into a one-line summary once it is set (« Remise à zéro : jeudi 0 h · Modifier »)?
- What if the top of the page answered « cette semaine, la factory ≈ 10 % de votre forfait » in one line above the table, so the phone gives the answer without scrolling sideways?
- Does « En moyenne » earn a column when most rows say « trop peu de mesures »?

---

## Assessment B (detector + browser evidence)

# Assessment B: Detector + Browser Evidence (issue #628, Consommation page)

Run: isolated sub-agent, read-only. No repo file edited. Live-server overlay injection skipped (it would touch the project's entry file); the CDP scan was used instead.

## 1. CLI file scan
Command: `.claude/skills/impeccable/scripts/impeccable detect --json panel/screen-usage.mjs panel/style.css panel/index.html` -> exit 2, 7 findings (all warnings). screen-usage.mjs: 0 findings.

| # | Rule | File:line | Snippet | Verdict |
|---|------|-----------|---------|---------|
| 1 | side-tab | panel/style.css:304 | `.bubble blockquote { border-left: 3px solid var(--line) }` | False positive: a chat blockquote rule that predates this branch, not a card accent. Not on the Consommation page. |
| 2 | overused-font | panel/style.css:1 | `font-family: Geist` | False positive: Geist is set in DESIGN.md (« Display / corps : Geist »). The brief wins. |
| 3 | overused-font | panel/style.css:2 | `Geist Mono` | Same: set in DESIGN.md. |
| 4 | overused-font | panel/index.html:0 | Primary font: geist | Same. |
| 5 | broken-image | panel/index.html:0 (`<img id="lightbox-img">`, line 177) | img with no src | False positive: the lightbox image gets its src at runtime. Not new. |
| 6 | pulsing-dot | panel/index.html:0 | `.typing-dot` blink | Not on this page. Pre-existing (chat « writing » indicator, tied to a live state). |
| 7 | pulsing-dot | panel/index.html:0 | `.bubble.typing span` blink | Same. |

Net: 0 findings for the code added by #628 (the `.usage-*` rules at style.css:766-804, screen-usage.mjs).

## 2. Browser scan (CDP)
Method: throwaway script `scratchpad/critique/b-cdp.mjs` reuses e2e/fixture.mjs (fake GitHub, usage records of e2e/usage.e2e.mjs), launches /opt/pw-browsers/chromium with `--remote-debugging-port=9222` (127.0.0.1), seeds each state, then runs `impeccable detect --cdp 9222 --json`.
States: calibrated (plan columns, « Revue » expanded), Oui/Non question, empty state, « Réglages généraux » with the link; 1280x800 and 390x844; light and dark. 14 scans, 18 screenshots (`b-*.png`, raw JSON `detect-*.json`, summary `detect-summary.json`, all in the scratchpad critique folder).

| State | 1280 light | 1280 dark | 390 light | 390 dark |
|---|---|---|---|---|
| Calibrated + Revue expanded | overused-font | overused-font | overused-font | overused-font |
| Oui/Non question | overused-font | overused-font | overused-font | overused-font |
| Empty state | overused-font | overused-font | overused-font | overused-font |
| Réglages généraux (link) | line-length + overused-font | (not scanned) | overused-font | (not scanned) |

- overused-font (body, Geist 64-92 % of text): false positive, DESIGN.md sets Geist.
- line-length, `p.models-note` in Réglages généraux, "~95 chars on 2 of 3 rendered lines": real but pre-existing (the paragraph is not new in this branch; it has max-width: 65ch at .8125rem, and 65ch measures about 95 proportional characters). It sits right above the new « Voir la consommation » link. It is also an explaining text under the « Textes à l'écran » rule, but it is not part of #628.
- No contrast, touch-target, overflow or layout findings in either theme or width. Console messages from the detector: none apart from the JSON above.

## 3. Things seen in the screenshots that the detector does not flag (raw evidence for synthesis, not a design verdict)
- 1280px: the table is wider than its frame even on desktop. The last column « Semaine tous moteurs » and its values (« ≈ 4,5 % ») are cut at the right edge and scroll horizontally inside the frame, with nothing to show they continue (b-calibrated-1280-light.png).
- 390px: only « Type de tâche » and « Moteur · effort » fit. Every figure (Tâches, Total, %) is off-screen to the right, with no hint to scroll (b-question-390-dark.png). The e2e test confirms the frame scrolls and the page does not, but you have to scroll sideways to see any figure.
- « trop peu de mesures » is a sentence, yet it is set in Geist Mono inside the « En moyenne » column (td.fig). Times like « 12:10 » and percentages in the « Dernier relevé » and « Étalonnage » prose also render in mono in the middle of Geist text (« à 12 : 10 »).
- The « Mon forfait » fieldset is a long form (reset day/hour x2, Enregistrer, two gauges, Noter le relevé, Oui/Non, last reading, calibration). On the phone it is taller than the table.

## 4. Skipped / failed steps
- Live-server `detect.js` overlay: skipped on purpose (read-only critique; the overlay flow can edit the entry HTML). No user-visible overlay exists.
- Dark mode and phone width of Réglages généraux: screenshots taken, detector scan only in light (same DOM).
- Local servers belonged to the fixture and closed with each journey; the Chromium/CDP port closed with the browser. Nothing left running.
