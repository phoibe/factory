# Chat: refuse tokens that can launch tasks or change settings, and any non fine-grained token (issue #558) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** built on `claude/issue-558-read-token-probes`: commit `2b544ad`, plus a follow-up still in the working tree (an empty `X-OAuth-Scopes` is not an old-type token, see Review Focus). Ticked boxes describe that work as it is.

**Goal:** The chat's read token is accepted only when it is a fine-grained one (`github_pat_`) that can neither write files/issues/PRs nor launch Actions, change settings, secrets, variables, webhooks, Pages, deployments, commit statuses, or add an SSH key to the account.

**Architecture:** Same two checkpoints as today: the panel when the token is pasted (`checkReadToken`), the chat server at every message (`POST /chat`). Both check the token's type first (prefix, then the `X-OAuth-Scopes` header of `GET /user` as a backup), then send one shared list of 13 empty-body write probes in parallel. The server answers a distinct code `classic`, which the panel maps to its own message and to « ask for the token again ».

**Tech Stack:** Node 22 ESM + `node --test` (panel: unit and Playwright e2e); Python 3.12, FastAPI, httpx, `unittest` (chat server). No new dependency.

**Spec:** `docs/specs/558-discussion-refuser-aussi-les-jetons-qui-peuvent-lancer-des-t.md`

## Global Constraints

- Exact copy. Old type: « Ce type de jeton n'est pas accepté : créez-en un avec le bouton ci-dessus. » New rights: unchanged « Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus. » GitHub unclear: unchanged « GitHub ne répond pas, réessayez dans un instant. »
- Only `github_pat_` is accepted (`ghp_`, `gho_`, `ghu_`, `ghs_`, anything else refused), in the panel and on the server, before any call to GitHub. The full token pasted by mistake keeps the « peut modifier » message, whatever its type.
- Every probe has the body `{}`; answers are read as today: 401/403/404/410 = cannot write, anything else = writable; busy (5xx, 429, rate-limit 403) = token not accepted. Nothing is ever written.
- Never `POST pages/builds` (an empty body really starts a build). Dependabot and Codespaces secrets are not probed (`encrypted_value` is optional).
- The panel's and the server's `WRITE_PROBES` are the same list, same order, one entry per line; a test compares them.
- Owner-facing text French (vouvoiement, no jargon); code and comments English. Never edit `.factory/` nor `.claude/skills/`. Tests first (red), then green.

## Review Focus

- GitHub sends `X-OAuth-Scopes` with an empty value to a fine-grained token: only a non-blank value means « old type ». `2b544ad` tested presence (`headers.has(…)` / `in r.headers`), which would refuse the button's own token; the follow-up pins it in the three layers (tasks 1 to 3, last step of each).
- A token of the old type stored before this change (or carried by the phone link): refused by the server at the next message, card shown again, typed message kept (task 3, second journey).
- GitHub throttling one of the 13 probes reads as « GitHub ne répond pas », never as « read-only » (task 2: existing `test_a_rate_limited_write_probe_is_github_down_not_a_read_only_token` stays green).
- A project without a published site: the `github-pages` and `pages/deployments` probes answer 404 = not writable, the token passes, as the spec announces (existing `probeSaysWritable(404) === false`).
- An empty project (no `commits/HEAD`) probes statuses on `NO_SHA`: **no test pins this fallback** nor a throttled `commits/HEAD` read, to judge by reading. What GitHub really answers (422 expected) to each right was never tried: the owner's check with real tokens is the proof.

---

### Task 1: panel pure helpers (token type, shared probe list)

- **Files:** Modify `panel/chat.mjs`; Test `test/panel-read-token.test.mjs`.
- **Produces:** `CLASSIC_TOKEN` (the old-type copy); `fineGrained(value) → boolean` = `String(value).startsWith('github_pat_')` (case-sensitive, no trim); `hasScopes(headers: Headers) → boolean`, true only when `x-oauth-scopes` has a non-blank value; `NO_SHA = '0'.repeat(40)`; `probeUrl(repo, path, sha) → string` (`path` itself when it starts with `/`, else `/repos/${repo}/${path}` with `{sha}` replaced).
- **Produces:** `WRITE_PROBES` = the 3 existing entries, then `['PUT','actions/oidc/customization/sub']`, `['POST','keys']`, `['PUT','actions/secrets/FACTORY_WRITE_PROBE']`, `['POST','actions/variables']`, `['POST','environments/github-pages/variables']`, `['POST','hooks']`, `['POST','pages/deployments']`, `['POST','deployments']`, `['POST','statuses/{sha}']`, `['POST','/user/keys']`. `readTokenProblem({ same, classic, status, login, owner, readable, writable })`: `same` → `WRITABLE_TOKEN`, then `classic` → `CLASSIC_TOKEN`, then `writable` → `WRITABLE_TOKEN`, rest unchanged.
- [x] Failing tests: `WRITE_PROBES.slice(0, 3)` unchanged, `.slice(3)` deep-equals the 10 entries above, none contains `pages/builds`; `probeUrl('o/r', …)` for `hooks`, `statuses/{sha}`, `/user/keys`; `fineGrained` true for `github_pat_11ABC`, false for `ghp_abc`, `gho_abc`, `ghu_abc`, `ghs_abc`, `lecture`, `''`, `GITHUB_PAT_x`, `' github_pat_x'`; `readTokenProblem` with `classic` (alone; with `writable`; with `same` → `WRITABLE_TOKEN`).
- [x] Failing test « the panel and the chat server send exactly the same write probes »: regex-parse the `WRITE_PROBES = ( … )` block of `server/chat/service.py`, `deepEqual` to the panel's list (red until task 2).
- [x] `node --test test/panel-read-token.test.mjs` → red on the missing exports; implement; only the comparison test stays red.
- [x] Follow-up: failing asserts `hasScopes(new Headers({ 'x-oauth-scopes': 'repo, workflow' })) === true`, false for `''`, `'  '` and no header; implement; same command → green.

### Task 2: chat server (type check, `classic` code, extended probes)

- **Files:** Modify `server/chat/service.py`; Test `server/chat/test_service.py`.
- **Produces:** `WRITE_PROBES` (tuple of `(method, path)`, the 13 entries of task 1, one per line), `NO_SHA = "0" * 40`, `FINE_GRAINED = "github_pat_"`, `CLASSIC` (the old-type copy). `GitHub.head() → str`: `GET /repos/{repo}/commits/HEAD` with `accept: application/vnd.github.sha`; busy → `httpx.TransportError`; a 40-hex answer, else `NO_SHA`. `GitHub.probe(method, path)`: `{sha}` resolved through `head()`, an absolute path kept, else under `/repos/{repo}/`, `json={}`. `can_write()` gathers `probe` over `WRITE_PROBES`, answers read as before.
- **Produces:** `POST /chat`: a token not starting with `FINE_GRAINED` → `403 {"error": CLASSIC, "code": "classic"}`, right after « Jeton manquant », before any GitHub call. `GET /user` read as a raw response: busy → 503, 401 unchanged, non-blank `x-oauth-scopes` → the same `classic` 403; then owner check and `can_write()` → `code: "writable"` as today.
- [x] `FakeGitHub`: `requests` and `probes` (lists of `(method, path)`), `writable` (paths answering 422 to a « good » token), `head = "c0ffee" * 6 + "c0ff"`, `user_headers` sent on a 200 `/user`, the `commits/HEAD` read. Every test token renamed `github_pat_…`.
- [x] Failing tests: `test_a_token_that_can_launch_automated_tasks_or_change_settings_is_refused` (each of the 10 new paths alone → 403 `writable`, agent never run); `test_every_write_probe_is_sent_with_an_empty_body_and_never_a_pages_build`; `test_a_token_of_the_old_type_is_refused_before_asking_github` (`ghp_good`, `gho_good`, `ghu_good`, `ghs_good`, `good` → exact 403 body, `gh.requests == []`); `test_a_token_github_gives_scopes_to_is_of_the_old_type` (`{"x-oauth-scopes": "repo"}` → 403 `classic`).
- [x] `cd server/chat && python -m unittest -v` (once: `pip install -q "fastapi[standard]==0.115.12" httpx==0.28.1`) → red; implement; green. `node --test test/panel-read-token.test.mjs` → the comparison test is green.
- [x] Follow-up: failing `test_an_empty_scopes_header_is_not_a_classic_token` (`{"x-oauth-scopes": "  "}` → 200, last event `done`); refuse on a non-blank value only; unittest command → green.

### Task 3: panel wiring and the owner's journeys

- **Files:** Modify `panel/app.mjs` (`checkReadToken`, `sendToServer`, import `chat.mjs?v=26`), `panel/index.html` (`app.mjs?v=87`), `e2e/fixture.mjs`; Test `e2e/read-token.e2e.mjs`.
- **Consumes:** task 1 exports; the server's `code: 'classic'` (task 2).
- [x] Fixture: tokens renamed `github_pat_lecture`, `github_pat_ecriture`, `github_pat_autre`; new `github_pat_actions` (422 only on `PUT /repos/o/r/actions/oidc/customization/sub`) and `github_pat_scopes` (`/user` with `x-oauth-scopes: repo`, exposed by `access-control-expose-headers`); `GET /repos/o/r/commits/HEAD` answers `'c0ffee'.repeat(6) + 'c0ff'`; every empty-body write recorded in `probes` (`{ method, path, token }`, handed to the journey); `chatServer.code` added to a `refuse` body.
- [x] Failing journeys: « un jeton de l'ancien type est refusé avec un message clair » (`ghp_ancien`: old-type copy, zero request to `api.github.com` with it; then `github_pat_scopes`: same copy; nothing stored, no chat call); « un jeton de l'ancien type déjà enregistré est refusé par le serveur… » (`refuse: 403, code: 'classic'`: card back, copy in `#read-token-error`, `factory.chatToken` removed, `#chat-input` keeps the message); « un jeton qui peut lancer des tâches automatiques est refusé » (`github_pat_actions`: « peut modifier » copy); « un jeton créé avec le bouton est accepté » (stored; the 13 probes all tried, statuses on the fixture's commit). `node --test e2e/read-token.e2e.mjs` → red.
- [x] `checkReadToken(value)`: after the « same as the full token » check, `!fineGrained(value)` → `readTokenProblem({ classic: true })` before any fetch; once `/user` is OK, `hasScopes(user.headers)` → the same; read `commits/HEAD` (busy → throw `'github'`; not 40-hex → `NO_SHA`) without delaying the other probes; send `WRITE_PROBES` through `probeUrl`. `call` accepts extra `init.headers`. `sendToServer`: `body.code === 'classic'` → `saidError(CLASSIC_TOKEN)` with `{ readToken: true }`, next to `writable`. Bump both cache-busting versions.
- [x] `node --test e2e/read-token.e2e.mjs` → green; `npm run test:e2e` → the other chat journeys pass with the renamed tokens.
- [ ] Follow-up: the fixture answers `github_pat_lecture` with an empty exposed `x-oauth-scopes`, as the real GitHub (done, with `hasScopes` in `checkReadToken`); `panel/chat.mjs` changed again, so bump `chat.mjs?v=` and `app.mjs?v=` once more; `node --test e2e/read-token.e2e.mjs` → green.

### Task 4: product sheet

- **Files:** Modify `PRODUCT.md` (the « Le jeton GitHub du panneau… » line); Test `test/panel-read-token.test.mjs`.
- [x] Extend « la fiche produit dit… »: also matches `/lancer des tâches automatiques/`, `/ajouter une clé SSH au compte/`, `/tout jeton qui n'est pas du nouveau type/` → red; rewrite the sentence (write, launch automated tasks, change settings, secrets, variables, webhooks, deployments, Pages, commit statuses, add an SSH key to the account, any token not « fine-grained ») → green.
- [ ] Final check on the committed tree: `npm test`, `npm run test:e2e`, `npm run test:a11y`, `npm run lint`, `cd server/chat && python -m unittest -v` → all green.
