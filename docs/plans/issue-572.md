# Panel: a stable page, a new-version banner instead of a surprise reload (issue #572) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** task 0 is built (commit `f75a58a`). Tasks 1 to 4 come from the design critique `.impeccable/critique/nouvelle-version-572.md` (32/40, one P1) and are not built. Their CSS approach was not prototyped: the e2e journeys are the judge.

**Goal:** The panel never reloads by itself; a neutral banner says a new version is online and the owner reloads when he wants. Remaining: the banner must stay visible on phone (in a conversation, on a scrolled page), say its refusal where the owner clicked, and sit better in its strip.

**Architecture:** `#new-version` stays inside `header.top` (desktop unchanged). `app.mjs` publishes two measured heights as CSS variables; phone-only CSS uses them to keep the strip on screen. The refusal replaces the strip's sentence instead of a toast.

**Tech Stack:** plain ESM panel (`panel/`), `node --test` + Playwright e2e (`e2e/fixture.mjs`, `withPanel`). No dependency.

**Spec:** `docs/specs/572-tableau-de-bord-une-page-plus-stable-sans-rechargement-compl.md`

**Order:** tasks 1 to 5 are sequential, never in parallel: they all edit `panel/style.css`, `panel/app.mjs` and `e2e/new-version-banner.e2e.mjs`.

## Global Constraints

- Exact copy, unchanged: « Une nouvelle version du tableau de bord est disponible. », « Recharger », « Enregistrez d'abord vos réglages, puis rechargez. », « Envoyez ou effacez d'abord votre message, puis rechargez. », « Attendez la fin de la réponse de l'agent, puis rechargez. »
- The page never reloads by itself, also when the cause of a refusal goes away. One banner, no cross, never blue (the existing colour journey stays green).
- Desktop (> 700 px) keeps today's place and behaviour: under the top bar, inside the sticky bar. The existing desktop journeys stay green untouched, except the `#toast` assertions of task 3.
- « Recharger » keeps a 44 px hit area and a visible focus ring.
- Each task that edits `panel/style.css` or `panel/app.mjs` bumps its `?v=` in `panel/index.html` (today `style.css?v=64`, `app.mjs?v=94`).
- Owner-facing text French (vouvoiement, no jargon); code and comments English. Never edit `.factory/` nor `.claude/skills/`; every commit also adds `.factory/journal`. Tests first (red), then green.

## Review Focus

- A conversation left open on phone, then another tab: `#chat` is hidden but may keep its class `viewing`. The strip must go back under the bar: every phone rule tests `#chat.viewing:not([hidden])` (task 1, last assertion).
- A window 601 to 700 px wide: the conversation is already full screen there, while the bar is still sticky (a sticky bar is a stacking context, so the strip's z-index alone does not lift it above the conversation): task 1 runs at 650 px too.
- The refusal sentence is longer than the usual one: the strip grows (2 or 3 lines at 390 and 320 px) and the conversation under it must follow: task 3, phone journey.
- The banner arrives while the owner is already far down a page on phone: it shows at the top at once: task 2 scrolls first, then publishes the version.
- The cause of a refusal goes away: the sentence comes back, and the page still does not reload: task 3.

---

### Task 0: the banner replaces the automatic reload (built, `f75a58a`)

- [x] `checkVersion()` no longer reloads; `#new-version` (inside `header.top`) with « Recharger »; old « elle se chargera dès que… » toast removed.
- [x] `reloadBlocker({ settings, message, answering })` in `panel/lib.mjs` (`test/reload-blocker.test.mjs`); `hasUnsaved()` built on it.
- [x] Tab title written only when the waiting-card count changes.
- [x] `DESIGN.md` « Bandeau de nouvelle version »; journeys in `e2e/new-version-banner.e2e.mjs` (replaces `e2e/new-version.e2e.mjs`).

### Task 1 (P1): on phone, the banner stays above an open conversation

- **Files:** Modify `panel/style.css` (next to line 341), `panel/app.mjs` (next to `checkVersion`), `panel/index.html` (`?v=`); Test `e2e/new-version-banner.e2e.mjs`.
- **Produces:** `fitBanner()` in `app.mjs`: sets `--new-version-h` on `document.documentElement` to the strip's `getBoundingClientRect().height` in px (`0px` while hidden). Called right after `$('new-version').hidden = false`, on `resize`, and by a `ResizeObserver` on `#new-version`.
- **Rule** (inside `@media (max-width: 700px)`, only while `body:has(#chat.viewing:not([hidden])):has(.new-version:not([hidden]))`): `.top` is `position: static`; `.new-version` is `position: fixed; top: 0; left: 0; right: 0; z-index: 6; margin: 0`, its top padding at least `env(safe-area-inset-top)` (and `.chat-head` back to `padding-top: 10px`); `#chat.viewing .chat-thread` gets `top: var(--new-version-h, 0px)` and `height: calc(100dvh - var(--new-version-h, 0px))`.
- [ ] Failing journey « sur téléphone, dans une conversation de l'onglet Agent, le bandeau reste visible au-dessus de la conversation », at 390×844 then 650×844: Agent tab, wait `#chat.viewing` (click « Nouvelle conversation » if the list shows), `newVersion`, then:
  - the strip's box: `Math.abs(y) <= 1`, full width; `document.elementFromPoint` at the centre of « Recharger » is `#new-version-reload`;
  - `#chat-back` top ≥ strip bottom − 1; `#chat-input` bottom ≤ 844; `scrollWidth <= innerWidth`;
  - `#chat-back` click, reopen the conversation: same three checks (banner shown before the conversation);
  - « Suivi » tab with the conversation left open: the strip's `y` > 0 and « Recharger » still passes the hit test.
- [ ] `node --test e2e/new-version-banner.e2e.mjs` → the new journey red (hit test finds the conversation); implement; green, the other journeys included.
- [ ] Commit `fix(panel): the new-version banner stays above a phone conversation (#572)`.

### Task 2 (P2): on phone, the banner stays at the top of a scrolled page

- **Files:** Modify `panel/style.css` (phone block, line 424), `panel/app.mjs` (`fitBanner`), `panel/index.html` (`?v=`), `DESIGN.md`; Test `e2e/new-version-banner.e2e.mjs`.
- **Consumes:** `fitBanner()`, `--new-version-h` (task 1).
- **Produces:** `fitBanner()` also sets `--top-h` (height of `header.top`); the existing `ResizeObserver` on `.top` calls it.
- **Rule** (inside `@media (max-width: 600px)`, banner shown, no conversation open as defined in task 1): `.top` is `position: sticky; top: calc(var(--new-version-h, 0px) - var(--top-h, 0px))`. The bar scrolls away with the page and only its last row, the strip, stays at the top. At the top of the page the strip is still under the bar, as the spec says.
- [ ] Failing journey « sur téléphone, le bandeau reste en haut de l'écran quand on fait défiler », at 390×844, on « Paramètres » then in « Réglages généraux »: before scrolling, the strip's top ≥ `nav` bottom − 1; `scrollTo(0, document.body.scrollHeight)`; then `Math.abs(strip.y) <= 1`, `.brand` bottom ≤ 1 (the bar is gone), hit test on « Recharger », `scrollWidth <= innerWidth`. Second case: scroll to the bottom first, then `newVersion`: same checks.
- [ ] Run → red (`y` far above the screen); implement; green. The desktop journey « le bandeau suit la barre du haut quand on fait défiler » stays green.
- [ ] `DESIGN.md`, « Bandeau de nouvelle version »: replace « (dans la barre, qui reste collée en haut) » with « (dans la barre : sur ordinateur elle reste collée en haut ; sur téléphone la barre défile avec la page et seule la bande reste collée en haut de l'écran, y compris au-dessus d'une conversation de l'onglet « Agent ») ».
- [ ] Commit `fix(panel): the new-version banner sticks to the top on phone (#572)`.

### Task 3 (P2): the refusal is said in the banner itself

- **Files:** Modify `panel/index.html` (`<span id="new-version-text">`, `?v=`), `panel/app.mjs` (« Recharger » handler), `DESIGN.md`; Test `e2e/new-version-banner.e2e.mjs`.
- **Rules:**
  1. The usual sentence is read once from `#new-version-text` (the HTML stays its only source).
  2. Click with `why = reloadBlocker(unsavedParts())`: `#new-version-text` shows `why`; no toast, no reload. The strip's `role="status"` announces the change.
  3. While a refusal is shown, a 1 s timer asks `reloadBlocker(unsavedParts())` again: any answer other than the sentence shown (cause gone, or another cause) puts the usual sentence back and stops the timer. It never reloads.
  4. Next click: evaluated afresh (rule 2, or `location.reload()`).
- [ ] Update the four refusal journeys: `#toast` assertions become `page.locator('#new-version', { hasText: … })` (same three texts, same 3 s limit); add: the usual sentence is no longer in the strip, `#toast.show` count is 0, « Recharger » is still visible. The helper `banner(page)` filters on the usual sentence: where a refusal is shown, assert on `#new-version` instead.
- [ ] Extend them: settings saved → `banner(page)` back within 3 s with `samePage` still true, then the click reloads; message erased (`fill('')`) → sentence back, `samePage` true; agent answer « Bien reçu. » arrived → sentence back, `samePage` true.
- [ ] New phone journey (390×844, then 320×700), draft typed in an open conversation, click « Recharger »: the refusal shows in the strip, `scrollWidth <= innerWidth`, `#chat-back` top ≥ strip bottom − 1, `#chat-input` bottom ≤ viewport height, the draft is still in `#chat-input`.
- [ ] Run → red; implement; green.
- [ ] `DESIGN.md`: replace « « Recharger » ne recharge pas et un message bref dit quoi faire d'abord » with « « Recharger » ne recharge pas : la phrase du bandeau est remplacée par ce qu'il faut faire d'abord, jusqu'à ce que ce soit fait ».
- [ ] Commit `fix(panel): the reload refusal is shown in the banner, not in a toast (#572)`.

### Task 4 (P3): strip proportions

- **Files:** Modify `panel/style.css` (lines 80-83), `panel/index.html` (`?v=`), `DESIGN.md`; Test `e2e/new-version-banner.e2e.mjs`.
- **Rule:** `.new-version`: `padding: 6px 16px`, `flex-wrap: nowrap`; its text `flex: 1 1 0; min-width: 0` (it wraps); its button `flex: none`, `border-color: transparent`, `background: transparent`, ink text, `background: var(--surface)` on hover, `min-height: 44px` kept, the global ink focus outline kept (2 px, offset 2 px).
- [ ] Failing journey « le bandeau est une bande fine, avec un bouton sans cadre » (desktop): strip computed `padding-top` and `padding-bottom` are `6px`; button `border-top-color` and `background-color` are `rgba(0, 0, 0, 0)`, box height ≥ 44; press Tab until `document.activeElement.id === 'new-version-reload'` (12 at most): `outline-style` `solid`, `outline-width` `2px`, `outline-color` equal to the strip's `color`.
- [ ] Failing journey « sur téléphone, le texte et le bouton restent sur une seule rangée » (390 and 320 px wide): vertical centres of text and button within 1 px; button left ≥ text right − 1; button right ≤ width − 15; `scrollWidth <= innerWidth`; at 320 px the text is taller than one line (> 30 px). In the existing phone journey, `button.height >= 32` becomes `>= 44`.
- [ ] Run → red; implement; green (tasks 1 to 3 journeys included: the strip's height changed).
- [ ] `DESIGN.md`: replace « puis à droite le bouton discret « Recharger » » with « puis à droite le bouton « Recharger », sans cadre dans la bande (zone de 44 px) », and the last sentence with « Sur téléphone, le texte passe à la ligne et le bouton reste à droite, sur la même rangée. »
- [ ] Commit `style(panel): thinner new-version strip, borderless button, one row on phone (#572)`.

### Task 5: fixes from the final code review

- **Files:** to be listed from the review's findings.
- [ ] For each accepted finding: failing test first, fix, green. Refused findings are answered with the reason.
- [ ] Final check on the committed tree: `npm test`, `npm run test:e2e`, `npm run test:a11y`, `npm run lint`, `npm run typecheck`, `npm run build` → all green. Then re-run the critique (the P1 asked for it) and fresh phone and desktop screenshots, light and dark.
