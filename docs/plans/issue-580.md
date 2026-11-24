# Unsent messages stay in the conversation, toasts visible on phone (issue #580) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the panel's « Agent » tab, toasts show over the open conversation on a phone, just above the composer, and a message that could not be sent stays in the conversation with its reason, « Renvoyer » and « Modifier », on phone and computer, in both chat modes.

**Architecture:** The pure rules (which failure it is, the in-memory box of unsent messages per conversation, merging a message back into the draft, where the toast sits) go into `panel/chat.mjs`, tested in node. `panel/app.mjs` keeps a `chat.unsent` box, fills it in the two `catch` blocks that today restore the text and toast, draws its entries last in the thread, and measures the composer to place the toast. `panel/style.css` lifts the toast over the phone's full-screen thread.

**Tech Stack:** Browser ES modules without dependency, `node --test`, Playwright 1.56 (`e2e/fixture.mjs`), axe-core. `STACK.md` needs no change.

**Spec:** issue #580, last `<!-- factory-spec -->` comment (`node .factory/scripts/thread.mjs 580`); `GLOSSARY.md` « Message non envoyé » (already merged, do not edit); `DESIGN.md`.

## Global Constraints

- Exact copy: « Non envoyé » (the message never left), « L'agent n'a pas pu répondre » (it left, no answer came back), each followed by a full stop and the reason in one sentence; buttons « Renvoyer » and « Modifier ». Owner-facing French, vouvoiement; code, comments and commits in English; e2e test names in French.
- No toast any more for a failed send seen on screen; no automatic retry; the composer is never refilled by itself.
- Every other toast keeps its text and duration. « Réponse reçue, mais conversation non enregistrée. Ne renvoyez pas votre message. » and the note under an unsaved answer are unchanged and never get « Renvoyer ». The notice « Pas encore de réponse. Renvoyez votre message un peu plus tard. » is unchanged.
- Unsent messages live in memory only: kept across conversation switches, forgotten on reload and on project switch (`resetChat`). Nothing in `localStorage`.
- 4 images at most per message (`MAX_IMAGES`).
- Design: tokens of `panel/style.css` only (`--danger` for the mention, always with its words; no red background, no coloured side border), mention at `.8125rem`, buttons `secondary small-btn` (44 px under the finger), light and dark. DOM built with `el()`, never `innerHTML`.
- Never edit `.factory/` nor `.claude/skills/`. Each test written first and seen red. At the end `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:a11y` and `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` are green (`npm ci` first: Playwright is a dev dependency).

## Decisions taken while planning (say them in the PR summary)

- **Which mention.** Fallback mode (a conversation is an issue): always « Non envoyé ». Instant mode: « L'agent n'a pas pu répondre » once the chat server has answered the request (an HTTP error, an `error` event, a cut stream); « Non envoyé » before that (image upload, network) and for a refused read token.
- **Reason of a refused read token** under the message: the fixed sentence « Le jeton de lecture a été refusé. » (the token screen keeps its own full explanation; « le bouton ci-dessus » would point at nothing in the conversation).
- **Fallback mode now empties the composer at once** and shows the message being sent, in a new conversation too (today it waits for GitHub): otherwise a failure would have to put the text back.
- **A failure nobody is looking at** (the owner went to another tab, to the list on a phone, or to another conversation in fallback mode) still gets one toast: « Message non envoyé. Retrouvez-le dans sa conversation. » The message waits there.
- **Messages left unsent in a new conversation follow it** when one of them finally creates the conversation.
- **Toast placement is measured**, 12 px above the composer (attached images included), on computer too: today a 96 px offset covers a text of several lines. With a one-line composer the computer position moves by 1 px.
- **Found while planning (probe in Chromium, 390 px):** when the read token is refused during an open conversation, the full-screen thread hides the token screen (`#chat.viewing .chat-thread` wins over `#chat.needs-token > .chat-thread`). Fixed here, the spec relies on that screen.
- An unsent message counts as « something a reload would lose » (`hasUnsaved`): the panel does not reload itself on a new version while one waits.

## Review Focus

- A message fails before the conversation list has arrived (offline at opening): when the list comes, the tab must not jump to the latest conversation and leave the unsent one out of sight (task 3).
- Read token refused on a phone: the token screen must be visible, not the thread (task 3).
- The send fails while the owner is on « Suivi »: one toast, and the message waits in its conversation (task 3).
- The owner types several lines or attaches images while a toast shows: the toast moves up, never over the text (task 2).
- A new panel version comes online while an unsent message waits: no silent reload (task 4).

---

### Task 1: the rules (`panel/chat.mjs`)

**Files:** Modify `panel/chat.mjs` (new section at the end, « Messages that could not be sent (issue #580) »). Create `test/panel-unsent.test.mjs`.

**Interfaces — Produces:**
- `MAX_IMAGES = 4` (moved from `panel/app.mjs`, which imports it).
- `UNSENT_TITLE = { unsent: 'Non envoyé', unanswered: 'L\'agent n\'a pas pu répondre' }`, `TOKEN_REFUSED = 'Le jeton de lecture a été refusé.'`, `UNSENT_AWAY = 'Message non envoyé. Retrouvez-le dans sa conversation.'`.
- `unsentKey(open)` → `'new'` for `null`, `undefined` and `'new'`, else `open` (issue number or conversation id).
- `failureKind({ reached, readToken })` → `'unanswered'` when `reached && !readToken`, else `'unsent'`.
- `unsentBox()` → `{ add(key, { text, files = [], withImages = true }, { kind, reason }) → id, shown(key) → entries not being resent, in the order added, get(key, id) → entry | null, retry(key, id) → entry | null (hides it from shown), fail(key, id, { kind, reason }) (shown again, same place, new mention), remove(key, id) → entry | null, rekey(from, to) (appends `from`'s entries after `to`'s), size (every entry, resent ones included) }`. An entry is `{ id, text, files, withImages, kind, reason }`; `files` are the composer's `{ file, url }` objects, kept by reference.
- `mergeDraft({ text, files }, unsent, max = MAX_IMAGES)` → `{ text, files, dropped }`: the draft's text with its trailing spaces removed, then `\n`, then the unsent text (no separator when either is empty); the draft's files first, then the unsent ones, cut at `max`; `dropped` = how many were left out.
- `toastBottom(viewportHeight, composerTop)` → `Math.max(24, Math.round(viewportHeight - composerTop) + 12)`.

- [ ] **Step 1: failing tests** in `test/panel-unsent.test.mjs` (`f1`…`f5` = `{ file: {}, url: 'blob:n' }`):
  - `a conversation not created yet is « new »` : `unsentKey(null)`, `unsentKey(undefined)`, `unsentKey('new')` → `'new'`; `unsentKey(7) === 7`; `unsentKey('c1') === 'c1'`.
  - `the mention depends on how far the message went` : `failureKind({ reached: false }) === 'unsent'`, `failureKind({ reached: true }) === 'unanswered'`, `failureKind({ reached: true, readToken: true }) === 'unsent'`; `assert.deepEqual(UNSENT_TITLE, { unsent: 'Non envoyé', unanswered: "L'agent n'a pas pu répondre" })`.
  - `each conversation keeps its unsent messages in the order written` : add `A`, `B` (with `[f1]`) to `7` and `C` to `'new'` → `shown(7).map((m) => m.text)` is `['A', 'B']`, `shown(8)` is `[]`, `size === 3`, `get(7, b).files[0] === f1`, `shown(7)[0]` has `kind`, `reason`, `withImages: true`.
  - `a message being resent is hidden, then comes back at its place with the new reason` : `retry(7, a).text === 'A'`; `shown(7).map(text)` is `['B']`, `size` still 3; `fail(7, a, { kind: 'unanswered', reason: 'Panne.' })` → `shown(7).map((m) => [m.text, m.kind, m.reason])` starts with `['A', 'unanswered', 'Panne.']`; `retry(7, 999) === null`.
  - `a message taken back is forgotten, and a new conversation's messages follow it` : `remove(7, a).text === 'A'`, again → `null`; `rekey('new', 'c1')` → `shown('new')` is `[]`, `shown('c1').map(text)` is `['C']`; with `D` already under `'c1'` before the rekey, the order is `['D', 'C']`.
  - `taking a message back never erases the draft` : `mergeDraft({ text: '', files: [] }, { text: 'Bonjour', files: [f1] })` → `{ text: 'Bonjour', files: [f1], dropped: 0 }`; `mergeDraft({ text: 'Déjà écrit  \n', files: [f1, f2, f3] }, { text: 'Repris', files: [f4, f5] })` → `{ text: 'Déjà écrit\nRepris', files: [f1, f2, f3, f4], dropped: 1 }`; an image-only message leaves `'Déjà écrit'` untouched; a draft of spaces gives `'Repris'`; `MAX_IMAGES === 4`.
  - `the toast sits 12 px above the composer, never lower than 24 px` : `toastBottom(844, 780) === 76`, `toastBottom(800, 559) === 253`, `toastBottom(800, 715.4) === 97`, `toastBottom(800, 790) === 24`.
- [ ] **Step 2:** `node --test test/panel-unsent.test.mjs` → FAIL (exports missing).
- [ ] **Step 3:** implement; in `panel/app.mjs` drop `const MAX_IMAGES = 4` (line ~2395) and add the new names to the `./chat.mjs` import (line 3, same specifier: `test/panel-imports.test.mjs`).
- [ ] **Step 4:** `npm test` → PASS. Commit `feat(panel): rules for unsent chat messages and toast placement (#580)`.

### Task 2: toasts over the conversation, above the composer

**Files:** Modify `panel/app.mjs` (`toast` ~l.100, `autosize` ~l.3501, `drawPendingImages` ~l.3225), `panel/style.css` (l.75-78 and the phone block l.332-343). Create `e2e/phone-toast.e2e.mjs`.

**Interfaces — Consumes:** `toastBottom`. **Produces:** `placeToast()` in `app.mjs`: when `threadShown()`, sets `--toast-bottom` on `#toast` to `toastBottom(innerHeight, top)` px, `top` being the top of `#chat-pending` when it is visible, else of `#chat-form`; otherwise removes the property.

- [ ] **Step 1: failing e2e tests.** Helpers: `PHONE = { width: 390, height: 844 }`, `DESK = { width: 1280, height: 800 }`; a fallback conversation `issue(7, 'Comment publier ?', ['factory:question'], { body: 'Comment publier ?', comments: 1 })` with one agent comment (as `e2e/agent-comfort.e2e.mjs`), opened by itself on the Agent tab; `pics(n)` = n one-pixel PNG `{ name, mimeType: 'image/png', buffer }` for `page.locator('#chat-file').setInputFiles(...)`; and (the toast has `pointer-events: none`, so it is switched on for the measure):
  ```js
  const toastState = (page) => page.evaluate(() => {
    const t = document.getElementById('toast'), r = t.getBoundingClientRect();
    t.style.pointerEvents = 'auto';
    const onTop = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === t;
    t.style.pointerEvents = '';
    const strip = document.getElementById('chat-pending');
    const composerTop = (strip.hidden ? document.getElementById('chat-form') : strip).getBoundingClientRect().top;
    return { shown: t.classList.contains('show'), text: t.textContent, onTop, top: r.top, bottom: r.bottom, composerTop };
  });
  ```
  - `sur téléphone, joindre 5 images affiche « 4 images au plus par message » par-dessus la conversation, au-dessus de la zone de saisie, puis il disparaît` : `shown`, `onTop`, `bottom <= composerTop`, `top >= 0`; 4 thumbnails; then `#toast.show` count 0 within 6 s.
  - `sur téléphone, « Terminer » affiche « Conversation rangée dans « Terminées » »` : click « Terminer » → `shown`, `onTop`, exact text.
  - `sur téléphone, une demande créée depuis la conversation affiche son petit message par-dessus la conversation restée ouverte` : instant mode (`chatServer: { answer: 'Voici.', issues: [{ kind: 'feature', title: 'Un export', body: 'x' }] }`, as `e2e/finish-conversation.e2e.mjs`), « Créer cette demande » → toast « Demande créée, conversation rangée dans « Terminées » » with `onTop` and `bottom <= composerTop`.
  - `le petit message ne recouvre jamais ce que j'écris, même sur plusieurs lignes` : PHONE and DESK; 5 images, then fill 12 lines while the toast shows → `bottom <= composerTop` after the fill.
  - `sur ordinateur, les petits messages s'affichent comme avant` : DESK, one-line composer, 5 images → `shown`, `onTop`, `bottom <= composerTop`; on « Paramètres », the out-of-range toast « Entre 1 et 10. » (raised as in `a11y/panel.a11y.mjs` l.99-104) keeps its `bottom` at `innerHeight - 24`.
- [ ] **Step 2:** `CHROMIUM_PATH=/opt/pw-browsers/chromium node --test e2e/phone-toast.e2e.mjs` → FAIL (`onTop` false on phone, toast over the text).
- [ ] **Step 3:** implement. `toast()` calls `placeToast()` before showing; `autosize()` and `drawPendingImages()` call it when `#toast` has `show`. CSS: `body:has(#chat:not([hidden])) #toast { bottom: var(--toast-bottom, calc(96px + env(safe-area-inset-bottom))); }` and, in the `max-width: 700px` block, `body:has(#chat.viewing:not([hidden])) #toast { z-index: 6; }` (the thread is `z-index: 5`; dialogs stay above, in the top layer).
- [ ] **Step 4:** the file passes; `e2e/finish-conversation.e2e.mjs` and `e2e/ideas.e2e.mjs` still pass. Commit `fix(panel): toasts show over the phone conversation, above the composer (#580)`.

### Task 3: a failed send stays in the conversation

**Files:** Modify `panel/app.mjs` (`chat` ~l.2394, `resetChat`, `hasUnsaved` l.255, `pickDefaultConversation` l.2591, `bubble` l.2816, `drawChat` l.3087, `announceAnswers` l.3121, `drawServerChat` l.3135, `sendChat` l.3233, `sendToServer` l.3289), `panel/style.css`, `e2e/read-token.e2e.mjs` (l.66-76 and l.211-222), `e2e/finish-conversation.e2e.mjs` (l.235), `a11y/panel.a11y.mjs`. Create `e2e/unsent-message.e2e.mjs`.

**Interfaces — Consumes:** task 1. **Produces (used by task 4):**
- `chat.unsent = unsentBox()`, made new in `resetChat()`; never touched by `selectConversation`.
- `sendChat(text, withImages = true, again = null)` and `sendToServer(text, files, withImages, again)`: `again` is the unsent entry being resent; then `files = again.files`, the composer is not touched, `chat.unsent.retry(key, again.id)` runs before the first `await`, a failure calls `chat.unsent.fail(key, again.id, failure)` and a success `chat.unsent.remove(key, again.id)`.
- DOM of an unsent message, drawn by `unsentBubble(key, m)`: `li.msg.me.unsent` > the usual `.shots` and `.bubble`, then `p.unsent-note` (`<strong>Non envoyé.</strong> ` + reason) and `div.unsent-actions` with the buttons « Renvoyer » (`disabled` while `answering()`) and « Modifier », both `secondary small-btn`. `bubble(m, foot)` takes the nodes that replace `.msg-foot`.
- `sayInChat(text)`: the three lines of `announceAnswers` that fill `#chat-announce`, reused.

**Behaviour to implement:**
- Both modes: `key = unsentKey(chat.open)` read before the first `await`. On failure (after `if (gone()) return`): `failure = { kind, reason }`, added to the box (or `fail` for a resend), `sayInChat(\`${UNSENT_TITLE[kind]}. ${reason}\`)`, redraw; no text restored, no toast, unless the failure is out of sight (`!threadShown() || unsentKey(chat.open) !== key`): `toast(UNSENT_AWAY)`. On success from `key === 'new'`: `chat.unsent.rekey('new', <new number or id>)`.
- `sendChat` (fallback): `kind: 'unsent'`, `reason: errorText(e)`. The composer is emptied and `chat.pending` set before the first `await`, for a new conversation too; once the issue is created `chat.pending = null` (its description is the message). The success branch no longer empties the composer.
- `sendToServer` (instant): `let reached = false`, set to `true` as soon as `fetch` gives a response; `kind: failureKind({ reached, readToken: e.readToken })`, `reason: e.readToken ? TOKEN_REFUSED : errorText(e)`. `readTokenRefused(e.message)` stays. The « answer not saved » path is a success: untouched.
- `uploadImages`: a file already uploaded keeps its `path` on its `{ file, url }` object and is not uploaded again.
- `drawChat` / `drawServerChat`: `chat.unsent.shown(unsentKey(chat.open)).map(...)` is appended after everything else (messages, message being sent, typing bubble or notice). A new conversation shows the intro and its examples only when it has neither a message being sent nor an unsent one; in fallback mode a message being sent in a new conversation gets the same « Réfléchit… » tail as elsewhere.
- `pickDefaultConversation`: `chat.unsent.shown('new').length` counts as drafting. `hasUnsaved`: `|| chat.unsent.size > 0`.
- CSS: `.unsent-note` (`--danger`, `.8125rem`, right-aligned, no margin), `.unsent-actions` (row, right-aligned, 8 px gap); in the phone block, after the full-screen rule, `#chat.viewing.needs-token .chat-thread { display: none; }`.

- [ ] **Step 1: failing e2e tests** in `e2e/unsent-message.e2e.mjs`. Helpers: the fallback conversation of task 2 with `offline = new Set(['/repos/o/r/issues/7/comments'])` (the fixture reads it at each request: `offline.clear()` brings the connection back); instant mode `chatServer = { answer: 'Bonjour.', delay: 0 }`, cut with `page.route('http://localhost:7777/chat', (r) => (r.request().method() === 'OPTIONS' ? r.fallback() : r.abort('internetdisconnected')))` and restored with `page.unroute`; a breakdown = the same route fulfilling `500 { error: 'Panne.' }` with CORS headers (as `e2e/finish-conversation.e2e.mjs` l.222); `send(page, text)` fills `#chat-input` and clicks `#chat-send`; `unsent = page.locator('#chat-messages .msg.unsent')`.
  - `sur téléphone, un message envoyé sans connexion reste dans la conversation avec « Non envoyé », la raison et ses deux boutons, et la zone de saisie est vide` (fallback, PHONE) : one `unsent` containing the text, `.unsent-note` text `Non envoyé. Connexion perdue, réessayez.`, buttons « Renvoyer » and « Modifier » each at least 44 px high, `#chat-input` empty, `#toast.show` count 0; after `waitForTimeout(6000)` the mention is still there.
  - `sur ordinateur, même affichage, et plus de petit message pour ce cas` (fallback, DESK) : same assertions, `#toast.show` count 0 during 1 s.
  - `en réponse instantanée, un message auquel l'agent n'a pas pu répondre garde sa place avec « L'agent n'a pas pu répondre » et la raison` : breakdown → `.unsent-note` is `L'agent n'a pas pu répondre. Panne.`; network cut → `Non envoyé. Connexion perdue, réessayez.`
  - `l'échec et sa raison sont annoncés aux lecteurs d'écran` : `#chat-announce` text is `Non envoyé. Connexion perdue, réessayez.`; `.unsent-note` carries no `role`.
  - `plusieurs messages non envoyés restent en bas, dans l'ordre où je les ai écrits, chacun avec ses boutons` : two failed sends → `unsent` texts in order, both are the last two `li` of `#chat-messages`, 2 « Renvoyer », 2 « Modifier ».
  - `le premier message d'une nouvelle conversation qui ne part pas reste dans cette conversation, absente de la liste` (instant, network cut) : title « Nouvelle conversation », one `unsent`, no `.chat-intro`, `.conv` count 0.
  - `un message non envoyé est toujours là quand je reviens d'une autre conversation, et a disparu après un rechargement` (fallback, two conversations).
  - `en changeant de projet, les messages non envoyés sont oubliés` (two projects, as `e2e/chat-switch.e2e.mjs`).
  - `une réponse reçue mais non enregistrée garde sa note, sans bouton « Renvoyer »` (instant, `failing = new Set(['/repos/o/r/contents/index.json'])`) : the note « Cette réponse n'a pas pu être enregistrée. », the toast « …Ne renvoyez pas votre message. », `unsent` count 0, no « Renvoyer ».
  - Review Focus: `un message non envoyé avant l'arrivée de mes conversations reste à l'écran quand elles arrivent` (fallback, the conversation of task 2 in `issues`, `slowReads: [[/labels=factory/, 2500]]`, `offline` on `/repos/o/r/issues`, send at once → after 3.5 s still one `unsent` and the title « Nouvelle conversation »).
  - Review Focus: `si l'envoi échoue pendant que je suis sur « Suivi », un petit message me le dit et le message m'attend dans sa conversation` (instant, breakdown after 1500 ms, click « Suivi » → toast `Message non envoyé. Retrouvez-le dans sa conversation.`, back on « Agent » → one `unsent`).
- [ ] **Step 2:** rewrite the three older tests that assert the old behaviour: `e2e/read-token.e2e.mjs` l.211 becomes `si GitHub refuse le jeton de lecture (expiré), l'écran du jeton s'affiche, puis je retrouve mon message « Non envoyé » avec « Renvoyer »` (PHONE: the card heading is visible and `.chat-thread` is not; `#chat-input` empty; then `chatServer.refuse = 0`, paste `github_pat_lecture` → `.unsent-note` is `Non envoyé. Le jeton de lecture a été refusé.` with a « Renvoyer » button; task 4 adds the click); l.74 asserts an empty composer; `e2e/finish-conversation.e2e.mjs` l.235 asserts an empty composer and the text inside `.msg.unsent`.
- [ ] **Step 3:** run both files → FAIL. **Step 4:** implement. **Step 5:** `e2e/unsent-message.e2e.mjs`, `e2e/read-token.e2e.mjs`, `e2e/finish-conversation.e2e.mjs`, `e2e/chat-switch.e2e.mjs`, `e2e/agent-focus.e2e.mjs`, `e2e/project-memory.e2e.mjs` → PASS (« Renvoyer » and « Modifier » do nothing yet).
- [ ] **Step 6: contrast, light and dark.** In `a11y/panel.a11y.mjs`, after the « Agent » scan: make `fakeGithub` abort the next `POST …/issues/12/comments`, send a message, wait for `.msg.unsent`, run axe again and push violations as `Agent, message non envoyé (${scheme})`. `npm run test:a11y` → PASS. Commit `feat(panel): a failed chat message stays in the conversation with its reason (#580)`.

### Task 4: « Renvoyer » and « Modifier »

**Files:** Modify `panel/app.mjs`, `e2e/unsent-message.e2e.mjs`, `e2e/read-token.e2e.mjs`, `e2e/new-version.e2e.mjs`.

**Interfaces — Consumes:** `chat.unsent`, `sendChat(text, withImages, again)`, `mergeDraft`, `MAX_IMAGES`. **Produces:** `resend(key, id)` (does nothing while `answering()` or when the entry is gone; else `sendChat(m.text, m.withImages, m)`) and `editUnsent(key, id)` (removes the entry, writes `mergeDraft({ text: input.value, files: chat.files }, m)` into the composer, `drawPendingImages()`, `autosize()`, toasts `${MAX_IMAGES} images au plus par message.` when `dropped > 0`, redraws, focuses `#chat-input` with the caret at the end, on a phone too).

- [ ] **Step 1: failing e2e tests** appended to `e2e/unsent-message.e2e.mjs`:
  - `« Renvoyer » fait repartir le message tel quel une fois la connexion revenue, et l'agent répond` (instant, PHONE, `delay: 800`, a message with one image, network cut then restored) : after the click `unsent` count 0 and the live bubble (« Réfléchit… » or its status) shows; then « Bonjour. »; `chatCalls.length === 1` with the same text; the image is in the saved conversation; exactly one `PUT …/contents/attachments/chat/…` in `writes` over the two tries (the image was already uploaded).
  - `en mode de secours aussi, « Renvoyer » envoie le message` : `offline.clear()`, click → one `POST /repos/o/r/issues/7/comments` in `writes` with the text, `unsent` count 0.
  - `si « Renvoyer » échoue encore, le message reprend son état avec la nouvelle raison` (instant: network cut, then breakdown) : `.unsent-note` goes from `Non envoyé. Connexion perdue, réessayez.` to `L'agent n'a pas pu répondre. Panne.`, still one `unsent`, at the same place among two.
  - `pendant qu'une réponse de l'agent est en cours, « Renvoyer » est grisé, puis redevient actif` (instant, one unsent message, then a second message answered after `delay: 1500`) : disabled while `#live-bubble` exists, enabled after; « Modifier » stays enabled.
  - `le premier message d'une nouvelle conversation, une fois renvoyé, fait apparaître la conversation dans la liste` (instant) : `.conv` count goes from 0 to 1, a second message left unsent in it is still shown under the answer.
  - `« Modifier » remet le texte et l'image dans la zone de saisie, avec le curseur dedans, et retire le message de la conversation` : `#chat-input` value, one `.pending-image`, `document.activeElement.id === 'chat-input'`, `unsent` count 0; sending it then works.
  - `« Modifier » garde ce que j'ai commencé à écrire et ajoute le message repris à la suite, 4 images au plus` : draft `Autre chose` with 3 images, unsent `Bonjour` with 2 → value `Autre chose\nBonjour`, 4 `.pending-image`, toast `4 images au plus par message.`
  - In `e2e/read-token.e2e.mjs`, the refused-token test rewritten in task 3 ends with: click « Renvoyer » → « Bonjour. » and `unsent` count 0.
  - Review Focus, in `e2e/new-version.e2e.mjs`: `une nouvelle version est en ligne et un message non envoyé attend : la page ne se recharge pas` (same set-up as the first test of the file, with a failed send instead of a draft: the toast « nouvelle version » shows and `.msg.unsent` is still there).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `resend`, `editUnsent` and wire the two buttons. **Step 4:** the three files → PASS. Commit `feat(panel): resend or take back an unsent chat message (#580)`.

### Task 5: design document, checks, hand-over

**Files:** Modify `DESIGN.md`.

- [ ] In « Issue 460 additions (onglet Agent) », add two bullets: **Message non envoyé** (the owner's bubble keeps its place at the bottom of the conversation; under it, right-aligned, a line in failure red at 0.8125rem, « Non envoyé. » or « L'agent n'a pas pu répondre. » in bold then the reason in one sentence; then two small quiet buttons « Renvoyer » and « Modifier », 44 px under the finger; no red background, no coloured border; « Renvoyer » greyed while an answer is on its way; the line stays until the owner acts) and **Petit message temporaire** (ink background, paper text, 10 px corners, centred, 24 px from the bottom; on « Agent », 12 px above the composer, attached images included, never over what is being typed). In « Mises en page » → « Discussion », complete « Sur téléphone » : the small messages show over the open conversation, just above the composer. `node --test test/design-layouts.test.mjs test/design-rule.test.mjs` → PASS.
- [ ] `npm test && npm run lint && npm run typecheck && npm run build && npm run test:a11y && CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` → all green. Commit `docs(design): unsent message state and toast placement on phone (#580)`.
- [ ] Follow `.factory/stages/build.md` for the rest (design pass and captures of the unsent state on phone and computer, light and dark; `node .factory/scripts/specs.mjs save 580`; README re-read: nothing there describes this; journal). Under « Pas vérifié en vrai » : a real phone with its on-screen keyboard open (the toast is placed from the composer's measured position, seen only in Chromium at 390 px), and plane mode on a real network. The PR summary lists each e2e test name next to the step of « Comment vérifier sur la preview » it proves, and the decisions above.
