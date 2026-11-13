# Read-only token for the chat server — Implementation Plan

> For agentic workers: executed inline (medium request), see `.factory/stages/build.md`.

**Goal:** the chat server (Modal) only ever receives a second, read-only GitHub token; the panel does every write
(conversation save, issue creation) with the full token, which never leaves the browser.

**Architecture:** the server keeps streaming the answer but stops writing: its final `answer` event carries the
wanted issues (`{kind, title, body}`) and the conversation id/title. The panel then creates the issues and saves the
conversation on `factory-chat` (same JSON shapes and retry-on-conflict rules as the server had). A setup card in the
« Agent » tab asks for the read token once; the panel checks it can read but not write before keeping it.

**Spec:** issue #395, spec version 1 (saved to `docs/specs/` by this PR).

## Global Constraints
- The full token is never sent to the chat server, even when the read token is missing or refused (no fallback).
- A pasted token that can write is refused: « Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus ».
- Read token lives in `localStorage['factory.chatToken']`, travels in the phone link (`#jeton=…&lecture=…`), is forgotten on logout.
- If saving or creating an issue fails, the answer stays shown with a mention; the message is never resent automatically.

## Review Focus
- Old phone link with only `#jeton=` still signs in (read token absent → setup card).
- Server answering 401 (read token expired) → read token forgotten, card shown again with a message.
- Two saves crossing (other device): conversation file and index rewritten from the latest version (sha retries).
- A write-capable token sent to the server anyway (old cached panel) → server refuses it (write probe).
- Issue-mode chat (no chat server) is unchanged: no card.

### Task 1: server stops writing (`server/chat/service.py`, `core.py`, tests)
- `answer` event: `{type:"answer", text, issues:[{kind,title,body}], conversation:{id,title}}`; `done` has no `saved`.
- Remove `save`, `ensure_branch`, `write_json`, issue POST. `/chat` refuses a token that can write: probe
  `PUT /repos/{repo}/contents/.factory-write-probe` with `{}`; any answer other than 403/404 means writable → 403
  `{error, code:"writable"}`.
- Tests in `test_service.py` updated first (no POST/PUT ever reaches the fake GitHub; writable token refused).

### Task 2: pure panel helpers (`panel/chat.mjs`, `panel/lib.mjs`, tests)
- `chat.mjs`: `newConversation(id, firstText, now)`, `addExchange(conv, mine, answer, now, issues)`, `upsertIndex(index, conv)`,
  `issueRequest({kind,title,body})` → `{title, labels, body}`, `notCreatedNote(n)`, `readTokenProblem({same, login, owner, readable, probes})`,
  `READ_TOKEN_URL` (prefilled contents=read link).
- `lib.mjs`: `tokensFromHash(hash)` → `{token, read}`; `phoneLink(url, token, read)`.

### Task 3: panel wiring (`panel/app.mjs`, `panel/index.html`, `panel/style.css`)
- Setup card `#chat-setup` shown in server mode without read token; form validates and stores.
- `sendToServer` uses the read token; on `answer`, creates issues then saves (`saveExchange`), with mentions on failure.
- Logout / session reset forget both tokens; phone link carries both.

### Task 4: journeys and docs
- `e2e/read-token.e2e.mjs`: one test per acceptance criterion 1–5; fixture stores panel writes on `factory-chat`.
- `PRODUCT.md`: the chat server only receives a read-only token.
