---
target: "onglet Agent (#563)"
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:7e57f8ac40090745b17f39ae0de59c834f418f2ae249b362c3c62c35fabe84e7"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-24T15-46-26Z
slug: panel-index-html
---
Method: dual-agent (A: design review · B: detector + browser evidence)

Contexte : demande #563 (relectures avec ETag en mode instantané). Aucun changement visible ; tous les points ci-dessous existaient avant cette branche et sortent de son périmètre (non corrigés ici).

## Design specificity verdict

**Partly authored.** The shell is the standard chat layout (conversation list on the left, thread, composer at the bottom). That is the right choice for a chat, but nothing in it belongs to this product alone. The product character is in the details, and they are good:
- The in-thread **request proposal card** (kind « Bug », title, « Lire le texte » folded, « Créer cette demande » / « Ignorer ») turns a chat answer into the factory's own unit of work.
- The **emoji callouts** use soft orange, green and blue, a one-pixel border all round and no side stripe. They match DESIGN.md exactly.
- The **owner bubble in soft blue** and the agent's text with no bubble.
- **Mono timestamps** and the honest wait line « Réfléchit… 0:42 · d'habitude, environ 1 à 2 min ».

The empty state is the weakest part for specificity. It shows the same three examples for every project, and they say « votre appli » even when the project is not an app. Overall the screen stays monochrome and calm. It never uses bright signal blue, which is correct because nothing here waits for the owner, so the One Voice Rule holds.

## Nielsen heuristics (0-4)

| # | Heuristic | Score | Finding |
|---|-----------|-------|---------|
| 1 | Visibility of system status | 2 | The three dots, the ticking timer and the usual-duration hint are good. On the phone, though, every toast is hidden under the conversation view. A failed send shows nothing: the message silently comes back into the field (see P1-a). |
| 2 | Match with the real world | 3 | Plain French, formal « vous ». But « En faire une fonctionnalité » posts « Créez une issue « Nouvelle feature »… » in the owner's own bubble. |
| 3 | User control and freedom | 3 | « Ignorer » on proposals; « Terminer » can be undone by writing again; Échap leaves fullscreen; the phone has a back arrow. |
| 4 | Consistency and standards | 3 | Header buttons use 13 px text while every other button uses 16 px. « C'est un bug » / « En faire une fonctionnalité » duplicate the project row's « Signaler un bug » / « Nouvelle fonctionnalité » with different wording. « envoi… » and « Envoi… » appear together, with different capitalisation. |
| 5 | Error prevention | 3 | After a failure the message goes back into the field. « Ne renvoyez pas votre message » guards against duplicate requests. The send button is disabled while sending. |
| 6 | Recognition rather than recall | 3 | Clear labels and example prompts. The icon-only buttons (image, fullscreen) have a label and a tooltip. |
| 7 | Flexibility and efficiency | 3 | Enter sends on a computer and Shift+Enter makes a new line. Images can be pasted or dropped. Échap works. There is no shortcut for a new conversation. |
| 8 | Aesthetic and minimalist design | 2 | Calm and flat, but at 1280x800 the project header takes about 340 px and the messages get 305 px (38 % of the height). The chat header's three text buttons cut the title down to « Est-ce que le formulaire de co… ». |
| 9 | Recognize, diagnose, recover from errors | 2 | The error wording is good and actionable. But errors appear only as toasts that vanish after 4 to 8 s, and on the phone they cannot be seen at all. There is no lasting error in the thread and no « Renvoyer » button. |
| 10 | Help and documentation | 3 | The examples in the empty state are the right amount of help. Some explanatory text that should not be there leaks through (see P2-c). |

**Total: 27/40, Acceptable** (top of the band; it would be Good once P1-a and P1-b are fixed).

## Cognitive load

Checklist: **2 failures, moderate.**
- **Single focus: fail on desktop.** The project action row stays above the conversation (« Nouvelle fonctionnalité », « Signaler un bug », « Review générale », « Amélioration UI », « Stack technique »), along with the top bar's 4 buttons and 3 links. That is 12 or more unrelated actions competing with a chat that is only 305 px tall.
- **Minimal choices: fail.** The conversation header alone has 4 controls (« En faire une fonctionnalité », « C'est un bug », « Terminer », fullscreen). Two of them duplicate actions already visible 130 px higher.
- Passes: chunking, grouping (the list column has a distinct background), hierarchy inside the thread, one thing at a time, working memory, progressive disclosure (the proposal text is folded).
- The phone is much better: the conversation takes the full screen and only the 3 header buttons remain.

## Emotional journey

- **Entry:** calm. A centred title, three examples to tap, and the field focused. This is reassuring.
- **Waiting:** good reassurance. The dots and « 0:00 · d'habitude, environ 1 à 2 min » set an honest expectation. The only flaw is the triple signal (« envoi… » under the bubble, the dots, « Envoi… » again).
- **Peak:** the answer arrives with coloured callouts and a proposal card, and one tap creates the request. This is the moment the product is built for, and it feels in control.
- **Valley:** on the phone, when the agent fails, nothing appears. The thread stays empty, and the message reappears in the field with no reason given. For an owner on the move this reads as « ça n'a pas marché, je ne sais pas pourquoi ».
- **End:** « Terminer » gives a toast (on desktop) and a grey notice. The ending is clean, but the notice explains the mechanism (P2-c).

## What works

1. **The proposal card in the thread.** The decision (« Créer cette demande ») sits where the idea comes up. It has one filled ink button, a quiet « Ignorer », and the long text folded under « Lire le texte ». It applies PRODUCT.md's rule that the agent proposes and the owner clicks.
2. **Honest waiting.** A ticking mono timer plus the usual duration avoids the « is it frozen? » doubt during a 1 to 2 minute wait, with no animation beyond three dots.
3. **The phone conversation view.** It takes the whole screen, the composer is pinned at the bottom, the main targets are 44 px (back, image, send, header buttons), and the callouts keep their emoji so colour is never the only signal. Dark mode holds up well (dark blue bubble, brown and green callouts readable).

## Priority issues

**[P1-a] On the phone, error and confirmation toasts are hidden behind the conversation.**
- Why: `#chat.viewing .chat-thread` is `position: fixed; z-index: 5` (`panel/style.css:328`), and `#toast` is `z-index: 3` (`panel/style.css:67`). I reproduced it at 390x844 with the chat server refusing. The toast « L'agent n'a pas pu répondre. … Votre message est dans la zone de saisie, renvoyez-le. » has the class `show`, but `elementFromPoint` at its centre returns `#chat-messages`, and the screenshot shows nothing. The same happens to « Impossible de terminer la conversation », « Réponse reçue, mais conversation non enregistrée. Ne renvoyez pas votre message. », and the request-creation errors. The phone is where the owner mostly works.
- Fix: put the toast above the conversation layer (for example `z-index: 6`, keeping its existing `bottom` offset above the composer). Better still, show a send failure as a lasting line in the thread under the owner's message, with a « Renvoyer » button.
- Command: `/impeccable harden`

**[P1-b] On desktop, the conversation gets only 38 % of the screen.**
- Why: at 1280x800 the top bar, project title, status line, links, five-button action row and tabs take about 340 px. The messages area is 716x305. A single answer with a proposal card does not fit, so the owner scrolls inside a small box. Fullscreen fixes it, but it is hidden behind an icon and is never remembered (by design).
- Fix: on the Agent tab, reduce the project header to one line (name and tabs) and hide the action row, or turn the status line and the links into the « Plus » menu as on the phone. Tell the owner if this changes DESIGN.md's « Mises en page › Projet » rule.
- Command: `/impeccable layout`

**[P2-a] The conversation header is crowded and duplicates the project actions.**
- Why: three 13 px text buttons plus the fullscreen button squeeze the title to 245 px (« Est-ce que le formulaire de co… »). « C'est un bug » and « En faire une fonctionnalité » sit right under « Signaler un bug » and « Nouvelle fonctionnalité » with different wording and different behaviour (one sends a message to the agent, the other opens GitHub). « Terminer » is grey 13 px ghost text and looks disabled.
- Fix: put the two « make it a request » actions together into one quiet « Créer une demande… » control, or move them near the last answer. Give the title the room. Bring the buttons up to the standard button size of DESIGN.md (`small-btn` is 13 px while other buttons are 16 px).
- Command: `/impeccable distill`

**[P2-b] The shortcut buttons put jargon in the owner's own mouth.**
- Why: « En faire une fonctionnalité » posts « Créez une issue « Nouvelle feature » à partir de cette conversation : proposez-la-moi pour que je la valide. » as the owner's blue bubble (`panel/chat.mjs:18-19`). That is English technical jargon at the first level, which DESIGN.md forbids, and the owner never typed it.
- Fix: show a short French line in the bubble (« Faites-en une fonctionnalité. » / « C'est un bug. ») and send the precise instruction to the agent without showing it.
- Command: `/impeccable clarify`

**[P2-c] On-screen text explains how the screen works.**
- Why: the project rule allows only titles, labels, short actionable errors and one sentence on an empty screen.
  - The closed-conversation notice « Conversation terminée. Écrivez un message pour la reprendre. » (`panel/app.mjs:2999` and `:3040`) has a second sentence that explains the mechanism.
  - The read-token setup card in the same tab has a paragraph that explains the mechanism and reads like a changelog: « La discussion utilise désormais un jeton qui ne peut que lire vos projets, pour que votre jeton complet ne quitte jamais votre navigateur. » (`panel/index.html`, `#chat-setup`).
  - The wait hint « d'habitude, environ 1 à 2 min » is borderline but is status information, so it can stay.
- Fix: keep only « Conversation terminée. ». Reduce the setup card to its title, the link button and the field.
- Command: `/impeccable clarify`

## Persona red flags

**Pierre on his phone (project persona: answers in seconds, never reads code).** He sends a question from the street. The chat server refuses it. The thread stays on the empty state, and the text he typed is back in the field with no message (P1-a). He does not know whether to wait, resend, or whether something broke. If he taps « En faire une fonctionnalité », his own bubble says « Créez une issue « Nouvelle feature » », words he would never use (P2-b). The answer's « npm run dev » block with « Copier » is meaningless to him; that is a content issue for the agent's instructions, not the UI, but the screen gives it the same weight as the callouts.

**Casey (distracted mobile user).** « Copier » on command blocks and « Copier la réponse » are 32 px tall, below the 44 px PRODUCT.md requires. The three header buttons wrap onto a second row that pushes the thread down by about 50 px. With an answer open, the top of the thread is cut off under that row (« Le formulaire de contact envoie bien les… » starts half hidden), which makes it harder to pick up where you left off after an interruption.

**Sam (accessibility).** The toast is `role="status"`, so a screen reader still hears the phone error even though sighted users do not. The icon buttons have labels. The weak points: the « Terminer » ghost button, grey 13 px at #5f6368, meets contrast but looks disabled. The proposal disclosure uses the browser's default ▶ marker at 13 px, so its 44 px target is invisible as a target. The two filled ink buttons visible at once (« Créer cette demande » and « Envoyer ») make it less clear which one is the main action.

## Minor observations

- The waiting state shows « envoi… » (lowercase, under the bubble) and « Envoi… 0:00 » (under the dots) at the same moment. Keep one.
- The empty-state examples are the same on every project and say « appli ». They could be drawn from the project, or at least say « votre projet ».
- The phone list view: the « Nouvelle conversation » card plus one conversation fill the top 150 px and the rest of the screen is empty paper. That is fine, but the project name is shown as a lone large glyph with a chevron, which reads oddly with a one-letter name (fixture artefact, worth checking with a real name).
- Fullscreen on desktop keeps the « Projets » column, as DESIGN.md says. This is correct, but the 240 px column then takes more space than the conversation list.
- « Lire le texte » uses the browser's default disclosure triangle, the only element on the screen that is not in the house style.
- Dark mode: the soft blue user bubble and callouts read well. The 13 px grey meta text (« Agent · 15:42 ») is close to the lower limit for comfort.

## Questions to consider

- What if the Agent tab dropped the project's action row entirely? The conversation can already create a feature or a bug, so the row duplicates it.
- Should a failed send live in the thread, where the eye already is, instead of in a toast that disappears even when it is visible?
- Does « Terminer » need to be a button at all, given that a conversation ends by itself once its proposals are decided (#516)?
- What would the empty state look like if its three examples came from this project's open requests or recent changes?

## Deterministic scan (Assessment B)

# Assessment B: detector + browser evidence, Agent tab (panel/index.html, chat part)

## 1. CLI scan

`impeccable detect --json panel/index.html` gave exit 2 (findings): 4 findings, all severity "warning". The detector reports every one at `line: 0`. The source lines below were found by grep.

| # | Rule | Category | Snippet | Source location |
|---|------|----------|---------|-----------------|
| 1 | broken-image | quality | `<img> with no src attribute` | panel/index.html:168 `<img id="lightbox-img" alt="Image agrandie">` |
| 2 | overused-font | slop | `Primary font: geist` | panel/style.css:1-2 (@font-face), :19 (body font) |
| 3 | pulsing-dot | slop | `.typing-dot` 7x7px dot, infinite "blink" | panel/style.css:249. Used at panel/app.mjs:2960 (the "thinking" marker in the conversation list) |
| 4 | pulsing-dot | slop | `.bubble.typing span` 7x7px dot, infinite "blink" | panel/style.css:298-301, keyframes :320. Used at panel/app.mjs:2933 and :2995 (the "L'agent réfléchit" bubble) |

Count by rule: broken-image 1, overused-font 1, pulsing-dot 2.

`detect --json panel/chat.mjs` gave exit 0 and `[]`. The chat markup is built in JS through `el(...)` in app.mjs, so the static scanner cannot see it. The browser scan covers that gap.

## 2. Browser evidence (Playwright + e2e fixture, instant mode)

Setup: `withPanel({ etag: true, chatServer: {...} })`, using the cloud Chromium at /opt/pw-browsers/chromium through a11y/browser.mjs. Steps: open the Agent tab and send 2 messages. The answers carry markdown (a bullet list and bold text). Then inject `http://localhost:8400/detect.js`, wait 3 s and read the `[impeccable]` console groups.

- **Desktop 1280x800, conversation view:** 1 anti-pattern: `overused-font` (Primary font: geist, 89% of text). 3 overlay elements were added.
- **Phone 390x844, conversation view:** 1 anti-pattern: `overused-font` (geist, 89%).
- **Phone 390x844, conversation list** (after the back arrow): 1 anti-pattern: `overused-font`.
- **Desktop 1280x800, scanned while the agent is still answering** (server delay 15 s, typing bubble on screen): 2 anti-patterns:
  - `overused-font` (geist, 90%)
  - `pulsing-dot` on `.bubble.typing span` (7x7px dot, infinite "blink"). This confirms CLI finding 4 live.
- `.typing-dot` (CLI finding 3) never showed up in the DOM during these runs: count 0 while thinking in single-conversation view. So it was not confirmed in the browser.
- `broken-image` was not reported by the in-page detector. The lightbox `<img>` is hidden until it is opened.
- **Other console output:** no pageerror. The only `[error]` lines are eight "404 Not Found" lines from the fake GitHub. They are expected from the fixture: missing `settings.json`/`status.json` on factory-runners, STACK.md, `factory.yml` (twice), and `chats/c1.json` before the first save. None is a UI problem.
- **Overlay banner side effect:** on the phone, the impeccable banner sits over the top of the chat header and intercepts clicks on `#chat-back`. This comes from the tool, not the panel.

Screenshots (scratchpad):
- /tmp/claude-0/-home-user-factory/2dd3ff78-e469-5e8a-88d7-e88981558828/scratchpad/agent-desktop.png
- /tmp/claude-0/-home-user-factory/2dd3ff78-e469-5e8a-88d7-e88981558828/scratchpad/agent-desktop-overlay.png
- /tmp/claude-0/-home-user-factory/2dd3ff78-e469-5e8a-88d7-e88981558828/scratchpad/agent-desktop-typing-overlay.png
- /tmp/claude-0/-home-user-factory/2dd3ff78-e469-5e8a-88d7-e88981558828/scratchpad/agent-phone.png
- /tmp/claude-0/-home-user-factory/2dd3ff78-e469-5e8a-88d7-e88981558828/scratchpad/agent-phone-overlay.png
- /tmp/claude-0/-home-user-factory/2dd3ff78-e469-5e8a-88d7-e88981558828/scratchpad/agent-phone-list-overlay.png

## 3. Likely false positives

- **broken-image (index.html:168): false positive.** `#lightbox-img` is the image-zoom lightbox. JS sets its `src` when someone opens an image, and it is hidden until then. The in-page scan did not flag it.
- **pulsing-dot (both): likely false positive in intent.** Both dots show a state that is really live: the agent is producing an answer at that moment. They are not decoration. Further mitigations:
  - The bubble has `role="img"` and `aria-label="L'agent réfléchit"`.
  - `prefers-reduced-motion` turns the animation off (style.css:321).
  - The bubble disappears when the answer arrives.

  The design reviewer can still weigh whether a typing indicator suits the product, but the rule's premise ("simulate liveness decoratively") does not hold.
- **overused-font (Geist): true by the rule, but a deliberate system choice.** Geist and Geist Mono are self-hosted (panel/fonts) and anchor the "Mono Numbers Rule" (style.css:419). It is a matter of taste, not a defect.

Net: there is no detector finding specific to the chat that points to a real defect.

## 4. Deviations, skipped and failed steps

- **Direct injection was blocked by the panel's CSP.** The CSP has `script-src 'self'`, so it refused both the cross-origin `detect.js` and the inline preflight script. With a same-origin proxy, the detector core still failed: "WebAssembly.Module() ... violates CSP (no 'wasm-unsafe-eval')".
- **Workaround:** `Page.setBypassCSP` through a CDP session, on the test side only. After that, the preflight succeeded (title set to "[Human] Factory", inline script ran) and the overlay ran. The repo's CSP was not changed.
- **Phone flow:** an extra click on "Nouvelle conversation" was needed before the input was visible. The back arrow was clicked with a JS `click()` because the overlay banner covered it.
- **No native browser tool in this harness,** so a throwaway Playwright script was used: scratchpad/overlay.mjs and scratchpad/typing.mjs.
- **Cleanup:**
  - The live server (port 8400, pid 24224) was stopped with `live-server stop --keep-inject`. `/health` no longer answers and no process is left.
  - The server had created an untracked `.impeccable/live/` (empty `sessions/` and `annotations/` after stop). I deleted it.
  - `git status` now shows only ` M .factory/journal/2dd3ff78-...jsonl`. That change was there before I started and is not mine.

Questions skipped: run autonome de la factory
