# Critique — Bandeau de nouvelle version (#572), 2026-11-24

Method: dual-agent (A: design review · B: detector + browser evidence)

Score: 32/40 (one P1: re-critique after fixes).

---
# Assessment A: Design Review, the « nouvelle version » banner (#572)

Scope: `panel/index.html` (`#new-version` inside `header.top`), `panel/style.css` lines 80-83, `panel/app.mjs` `checkVersion` and the « Recharger » handler, `panel/lib.mjs` `reloadBlocker`, the DESIGN.md component « Bandeau de nouvelle version » and the « Projet (en-tête commun aux onglets) » layout.

Evidence: Playwright screenshots (deviceScaleFactor 1) in `/tmp/claude-0/-home-user-factory/8615ba7e-2d97-522a-9547-bb33f27ea1d5/scratchpad/critA/`, from the script `shots.mjs` in the same folder: desktop 1280x800 and phone 390x844, light and dark; Suivi, Agent, Agent plein écran (desktop), Paramètres (scrolled), Réglages généraux (desktop), and the blocking toasts (message in progress, settings not saved).

Measurements: the banner is 53 px tall on desktop and 77 px on phone, where the button wraps under the text. The « Recharger » button is 87x44 px. The page does not scroll sideways at 390 px. Ink on surface 2 has a contrast of 17.4:1 in light and 14.9:1 in dark. The surface-2 strip against the paper is 1.06:1 in light and 1.13:1 in dark, so the edge comes from the 1 px line above the strip, not from the fill.

## Design-specificity verdict

**Grounded, deliberately plain.** The banner speaks the panel's own visual language: the surface-2 tone of queued tickets and the projects column, the 1 px `--line` rule, 13 px text on the label size of the scale, and the « bouton discret » (surface, line, ink, 44 px). It keeps the « one blue voice » rule: in the screenshots the blue « go » card stays the only coloured thing on the screen. Another product could use it unchanged, but that suits an infrastructure notice, which should not have a personality. Its specificity lies in what it does not do: no blue, no cross, no reload by itself, and no lost text.

## Nielsen heuristics

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Clear and persistent on desktop, but hidden by the phone conversation view and scrolled away on phone (static top bar) |
| 2 | Match with the real world | 4 | « tableau de bord », « Recharger »: the owner's own words, formal « vous » |
| 3 | User control and freedom | 3 | The owner decides when; no dismiss, by spec choice (acceptable, it is one discreet strip) |
| 4 | Consistency and standards | 3 | Tokens and button are consistent; sticky on desktop but not on phone, so the « always there » behaviour differs between devices |
| 5 | Error prevention | 4 | « Recharger » refuses to throw away unsaved settings, a draft message, pending images or an answer still arriving |
| 6 | Recognition rather than recall | 3 | The blocking toast lasts 4 s, then the owner must remember why nothing happened |
| 7 | Flexibility and efficiency | 3 | The browser's own reload also works; nothing more is needed here |
| 8 | Aesthetic and minimalist design | 3 | Quiet, but the 44 px button in a 4 px-padded strip looks squeezed on desktop; on phone it costs 77 px of chrome |
| 9 | Error recognition and recovery | 3 | Messages name the cause and the fix (« Enregistrez d'abord vos réglages, puis rechargez. ») and keep the work, but appear far from the button clicked |
| 10 | Help and documentation | 3 | No explanatory text (correct per « Textes à l'écran »); the blocking message is the right help at the right moment |
| **Total** | | **32/40** | **Good (80 %)** |

## Cognitive load

Checklist: 0 failures. There is one message and one action, no decision beyond « now or later », and nothing to remember while the banner is visible. The only memory demand is after a blocked click, once the toast has faded (see P2-a). The decision point has 1 option. **Low load.**

## Emotional journey

- **Arrival**: a grey strip appears under the bar without moving the rest of the page. It feels calm and does not compete with the blue « À vous de jouer » card. This is the right register for a non-urgent notice. The real emotional gain is the absence of the old surprise reload, which wiped a page the owner was reading.
- **Valley**: on phone, the owner is in a conversation (the most common phone activity besides « go ») and sees nothing. He then comes back to the list, and the strip is sitting there. This is mildly confusing, not distressing.
- **Blocked click**: the owner clicks and the page stays the same. A dark toast at the bottom says what to do, and nothing typed is lost. Reassurance is good, but on desktop the message appears about 650 px away from where the eye is, top right.
- **End**: the reload is instant and the page comes back without the banner. A clean peak-end.

## Strengths

1. **It respects the blue rule and the calm of the panel.** It is neutral surface 2, with an ink text and a discreet button, in both themes. The « go » card keeps its monopoly on colour (desktop-light-suivi, desktop-dark-suivi).
2. **Work is never lost, and the refusal says exactly what to do.** There are three precise messages in the formal « vous ». The draft stays in the field and the setting stays changed. This is error prevention at its best (5 → 4).
3. **It lives inside the sticky header**, so on desktop it follows the page on every screen with no extra layout code: Suivi, Agent, Agent plein écran, Paramètres scrolled, Réglages généraux. It adds no explanatory text; the sentence is a status line, which the rule allows.

## Priority issues

### [P1] The phone conversation view covers the banner completely
- **What**: at 390 px, the Agent tab opens the conversation as `#chat.viewing .chat-thread { position: fixed; inset: 0; z-index: 5 }` (style.css:341). That layer sits above `header.top` (z-index 2), and the header is `position: static` on phone anyway. In the screenshot `phone-light-agent.png`, the banner is nowhere to be seen. It shows up again only after « ← Retour aux conversations ».
- **Why it matters**: the spec promises the banner « sur téléphone, et même quand l'onglet Agent est en plein écran ». On phone, the conversation view *is* the Agent full screen. The e2e test only checks the desktop « Plein écran » button, so this gap is not covered.
- **Fix**: render the strip inside the phone thread too. Either move `#new-version` out of `.top` into a `position: sticky; top: 0` element with a `z-index` above the thread (6), or show it as the first row of `.chat-thread` on phone, above the « ← Une carte » header with the same style. Add a 390 px e2e check on the conversation view.
- **Suggested command**: /impeccable adapt

### [P2] On phone, the banner scrolls away with the top bar
- **What**: `@media (max-width: 600px) { .top { position: static; } }` (style.css:425). Once Paramètres or Suivi is scrolled, the banner is gone (it measured at y = -1271 px in Réglages généraux). DESIGN.md says « dans la barre, qui reste collée en haut », which is true only on desktop.
- **Why it matters**: the notice is not urgent, so this is not blocking. But the owner reads mostly on phone, and the spec lists « sur téléphone » among the places where it must be seen. The same component also behaves differently on the two devices.
- **Fix**: either make only the banner sticky on phone (`.new-version { position: sticky; top: 0; }` once it lives outside the static bar), or state in DESIGN.md that on phone it sits at the top of the page and scrolls with it. Pick one and make the text and the code agree.
- **Suggested command**: /impeccable adapt

### [P2] The blocking message appears far from the click and fades in 4 s
- **What**: on desktop the click happens at the top right (about x = 980, y = 95), while the toast appears at the bottom centre (y ≈ 750). The button gives no feedback where it was clicked. After 4 s the toast is gone, and the banner gives no sign that it was refused.
- **Why it matters**: « I clicked and nothing happened » is the exact feeling this feature was meant to remove. Pierre may click twice and then think the button is broken.
- **Fix**: show the refusal in the banner itself. Swap the sentence for the blocking message (for example « Enregistrez d'abord vos réglages, puis rechargez. ») until the cause is gone, then restore the original text, and give it `aria-live` through the existing `role="status"`. Keep the toast only if the shared pattern demands it.
- **Suggested command**: /impeccable clarify

### [P3] Squeezed strip on desktop and a tall strip on phone
- **What**: `padding: 4px 16px` around a 44 px button gives a 53 px strip where the button almost touches both edges, and 13 px text sits beside a much heavier bordered button. On phone the button wraps to its own left-aligned row (77 px, about 9 % of the screen).
- **Fix**: use `padding: 6px 16px` and drop the button's border inside the strip (ghost style, keeping the 44 px hit area). On phone, keep the text and button on one row by letting the text wrap to two lines (`flex: 1 1 0` on the span, `flex: none` on the button) instead of pushing the button down. The validated sentence stays unchanged.
- **Suggested command**: /impeccable layout

## Persona red flags

- **Pierre on phone (Casey, distracted mobile user)**: in a conversation he never sees the banner (P1). On a scrolled board it is off-screen (P2). The thumb reach of « Recharger » at the top left is fine and its 44 px height is met.
- **Jordan (literal first-timer)**: the text and the button are unambiguous, with no jargon. The only red flag is the blocked click: a literal reader expects « Recharger » to reload, and a message that disappears from the far bottom of the screen is easy to miss (P2).
- **Sam (accessibility)**: `role="status"` is announced politely when the strip appears, and the button is a real `<button>` with a visible focus ring (ink border visible in the toast screenshot). Contrast is 17:1 / 15:1. There are no red flags beyond the blocking message living in a separate live region from the button.

## Minor observations

- There are two `role="status"` regions (banner and `#toast`). This is fine, but if the refusal moves into the banner (P2), the toast is no longer needed for this case.
- `#toast` is `z-index: 3`, under the phone thread overlay (`z-index: 5`). This does not affect the banner today, since its button cannot be reached from the thread, but it would affect any future in-thread use.
- On desktop the strip stops at the projects column (the column is fixed above it). It is consistent with the header and reads well.
- « Textes à l'écran »: compliant. The sentence is a status line and the refusals are short « what to do » messages. No help text was added.
- The `|` project name on the phone screenshots comes from the fixture (repo `o/r`), not from the banner.

## Provocative questions

- Should the strip also say *what* changed (one link to the release notes), or is « something new, reload when you like » exactly the right amount for an owner who never reads code?
- If a reload is refused because an agent answer is arriving, could the banner offer « Recharger à la fin de la réponse » instead of asking Pierre to come back?

---
# Assessment B: detector and browser evidence for the « nouvelle version » banner (#572)

Target: `#new-version` in panel/index.html, its CSS in panel/style.css (lines 80-83) and its logic in panel/app.mjs (`checkVersion` and the « Recharger » handler). Branch `claude/issue-572-stable-page` at f75a58a.
Read-only run: no tracked file was modified. The live-server created an untracked `.impeccable/live/` folder. I stopped the server with `stop --keep-inject` and then deleted that folder.

## 1. CLI detector (`impeccable detect --json panel/index.html`)

HEAD: exit 2, **4 findings**, all `file: panel/index.html, line: 0`:
| rule | severity | snippet |
|---|---|---|
| broken-image | warning | `<img> with no src attribute` |
| overused-font | warning | `Primary font: geist` |
| pulsing-dot | warning | `.typing-dot — 7x7px dot with infinite "blink" animation` |
| pulsing-dot | warning | `.bubble.typing span — 7x7px dot ...` |

origin/main, scanned from a temporary worktree that was removed afterwards: exactly the same 4 findings, so there are **0 new and 0 removed**. None of the findings is about the banner. All four were already there.
- The broken-image finding is probably a false positive: an `<img>` whose src is set at runtime (lightbox or preview).
- overused-font (Geist) is a design-system choice that predates this branch.

## 2. Browser evidence (Playwright, `withPanel` fixture, banner triggered the way new-version-banner.e2e.mjs does it)

Scripts: `/tmp/claude-0/-home-user-factory/8615ba7e-2d97-522a-9547-bb33f27ea1d5/scratchpad/critB/banner.mjs` and `/tmp/claude-0/-home-user-factory/8615ba7e-2d97-522a-9547-bb33f27ea1d5/scratchpad/critB/det.mjs`. Raw numbers are in `/tmp/claude-0/-home-user-factory/8615ba7e-2d97-522a-9547-bb33f27ea1d5/scratchpad/critB/results.json`. Screenshots in the same folder: `light|dark-1280|390|320.png`, `focus-light|dark.png`, `detector-light|dark.png`.

### Contrast (WCAG ratio, computed from the rendered colors)
| pair | light | dark |
|---|---|---|
| banner text (13px) on banner bg `--surface-2` | 17.41 | 14.85 |
| button text (13px, 600) on button bg | 19.18 | 15.67 |
| button border vs banner bg | 1.14 | 1.19 |
| button fill vs banner bg | 1.10 | 1.06 |
| banner bg vs top bar bg | 1.06 | 1.13 |

Text contrast is excellent. The button's edge, however, is close to invisible against the strip: 1.06-1.19 for both border and fill, well below the 3:1 that WCAG 1.4.11 asks for UI component boundaries. The button reads as a button only because of its bold label and the slightly whiter box. This is the same for every `.small-btn` in the app, so it is not specific to this branch. The strip itself barely separates from the top bar (1.06 in light). A 1px `--line` border does the separating.

### Touch target
« Recharger » measures 87 x 44 px at every width, which passes the 44 px minimum. On desktop the strip is 53 px tall with 4 px vertical padding, so the 44 px button almost fills it. That looks heavy next to the 13 px sentence (see light-1280.png).

### Focus ring (keyboard Tab)
Reached after 6 Tabs: brand link x2, « Sur mon téléphone », « Réglages généraux », « Se déconnecter », then « Recharger ». The banner comes logically right after the nav.
`:focus-visible` is true. The ring is `2px solid` with a 2px offset, colored `rgb(14,15,17)` in light and `rgb(242,242,239)` in dark, giving 17.41 and 14.85 against the strip. It is visible and not clipped (focus-light.png). Note that the ring takes the text color, not `--accent`: the colour-check e2e test forces this by forbidding blue inside the banner, so something overrides the global accent outline here.

### Overflow at 320 / 390 px
No horizontal overflow: `scrollWidth == innerWidth` at both widths, in light and dark.
- **390 px:** the text fits on one line and the button wraps underneath, left-aligned.
- **320 px:** the text wraps onto 2 lines. The banner is 96 px tall and the sticky header grows to **165 px**, more than 20% of an 800 px viewport, and it stays sticky until reload. At 390 px the header is 145.5 px.

On phone the wrapped layout puts the button at the left under the text (`space-between` + wrap). That works, but it looks like a stacked block, not a strip (dark-320.png).

### Layout shift when the banner appears
The banner shows up on a timer or on tab return, with no user input. The content below jumps down:
| viewport | `.tabs` / `main` moves | banner height | CLS (layout-shift entry, no recent input) |
|---|---|---|---|
| 1280 px | +53 px | 53 px | 0.031 |
| 390 px | +65 px | 76.5 px | 0.072 |

Both values are under the 0.1 "good" threshold, but the shift is real. On a phone it moves the board about 65 px while the owner may be about to tap a card. The source attributed is `main#app`.

### axe-core (4.x from node_modules, banner visible, 1280 px)
- Light: page 0 violations; `#new-version` alone 0 violations, 0 incomplete. Passes: aria-allowed-role, aria-roles, button-name, color-contrast, nested-interactive, and others.
- Dark: same result, 0 violations.

axe does not check non-text contrast (1.4.11), so the button-edge issue above does not show up in it.

Manual a11y note, not verified with a screen reader: the banner is `role="status"` and is revealed by toggling `hidden` with its text already inside. Many screen readers announce live regions only when their content changes, not when the region becomes visible, so the announcement may be unreliable.

## 3. Detector injection into the live page
- Live server started (`live-server --background`, port 8400).
- Preflight: `document.title` could be set, but an appended inline `<script>` did **not** run because of the page CSP (`script-src 'self'`).
- `page.addScriptTag({url: http://localhost:8400/detect.js})` was **blocked by the CSP**.
- Fallback: I fetched detect.js and ran it through `page.evaluate`, which bypasses the CSP. The script ran but its core failed: *"detector core unavailable: WebAssembly ... CSP without 'wasm-unsafe-eval'"*.
- Second attempt: I served index.html **without its CSP meta**, in the browser route only, with no file changed. addScriptTag was then blocked by Chromium's loopback-CORS policy, so I used the evaluate fallback. The detector ran and logged, in both light and dark: **`[impeccable] 1 anti-pattern found: overused-font — Primary font: geist (88% of text)`**. It reported nothing on the banner.

The overlay was therefore injected through evaluate with the CSP removed, not with the documented addScriptTag flow. On the real page, with its CSP, in-page detection does not work.
- Live server stopped with `--keep-inject`. No inject tag was ever written to the project. `.impeccable/live/` was removed and `git status` shows only the pre-existing changes.

## False positives / notes
- `broken-image`: probably a runtime-filled `<img>`, not a bug.
- `pulsing-dot`: this is the chat "typing" indicator. It is tied to a real live state, so it is arguably justified. It predates this branch.
