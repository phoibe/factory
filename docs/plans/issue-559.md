# Upstream proof left by the thinking sub-agent itself (issue #559) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are **sequential** (1 → 5): each one consumes the previous one's interfaces.

**Goal:** « Fabrication » no longer guesses who did the questions, the sheet or a bug's analysis from the model of the last sub-agent: the role is announced at launch, and the proof is granted only when the sub-agent's own session record shows it ran on its role's model and wrote the published text.

**Architecture:** (1) The pilot starts every Agent `description` with `[role:<rôle>]`, and `[role:plan:amont]` / `[role:review:amont]` for the upstream thinking; `journal.mjs` records `role` and `up` on each `agent` entry. (2) Claude Code keeps one record per sub-agent, `~/.claude/projects/<folder>/<session>/subagents/agent-<id>.jsonl` + `agent-<id>.meta.json` (`toolUseId` = the `id` of the journal's `agent` entry; `<session>` = the journal's file name; each `assistant` line has `message.model`, the model that really answered, and its `tool_use` blocks). `upstream.mjs <n> <fichier>` reads it and prints the marker, now ending with `text=<hash of the text>`; at build time `upstreamProof` recomputes the hash on the published comment (proof line and signature left out), so a rewrite by the pilot loses the proof. (3) A bug has no published text: `journal-check.mjs` reads the record of the analysis sub-agent and appends `{kind:'upstream', doc:'bug', status:'proved', by}` to the bugfix journal; `upstreamCheck` reads it. The relay and the lock still only read the committed journal: **no change in `scripts/relay/` nor in `gate.mjs`**.

**Tech Stack:** Node 22 ESM, `node --test`, `node:crypto` (sha256), no dependency.

**Spec:** issue #559, last `<!-- factory-spec -->` comment (the build saves it to `docs/specs/`, not this plan).

## Global Constraints

- Same sentences in « Fabrication » as today; only the role named may differ (« Revue » when the `review` sub-agent took over, even on the same model). The other lines (sous-agents, parcours, tests) and the other proofs (plan, revue de code, passe design) do not change: the tag is removed from the label shown in « Sous-agents ».
- At the slightest doubt: no proof (« l'outil n'a pas pu vérifier »). Never a claim for a sub-agent of another role, an unannounced one, one whose record is missing, one that answered on another model, or one that returned nothing.
- The proof line and the signature the pilot adds at the end are not a rewrite; any other change to the text is.
- Missing proof: as today (the agent has the work redone by the right sub-agent; the lock holds the PR). No new alert text for the owner.
- In-flight requests keep their proof: a marker without `text=` (printed before this delivery) stays valid; a bugfix journal whose `agent` entries have no `role` key keeps the old rule; `upstream` journal entries already written are read as before.
- Same rule on the factory and every project: everything lives in `agent/` (shipped by `scripts/sync.mjs`). Never edit `.factory/` nor `.claude/skills/` by hand. No new setting, nothing in « Réglages généraux ».
- Owner-facing text French, vouvoiement; agent-facing text French « tu »; code and comments English. Tests first (red), `npm test` green at the end.

## Review Focus

- The record cannot be found (no `subagents/` folder, no `meta.json`, unreadable HOME, another machine): `upstream.mjs` refuses with the cause and exits 1, `journal-check` goes on without the entry; never a crash, never a claim (tasks 2 and 3).
- The sub-agent wrote its file, then corrected it (a second Write, or an Edit): the final content is its text (task 2, `writtenTexts`).
- Differences that are not a rewrite: CRLF, trailing spaces or newline, a signature already in the sub-agent's file, a second signature added by the publishing tool after the pilot's (task 2, `proofText`).
- Open PRs: a pre-#559 bugfix journal and a marker without `text=` give exactly the lines they gave before, no new alert, no lock (tasks 2 and 3).
- A later run on another session (fix-checks, skills-fix) has no record: it must never remove or replace a `proved` bug entry (task 3, `bugUpdate`).

---

### Task 1: the journal records the announced role

**Files:** Modify `agent/scripts/journal.mjs` (`agentEntry`); Tests `test/subagents.test.mjs`.

**Interfaces — Produces:** `agentEntry(input)` → `{ kind: 'agent', model, effort, role, label[, up][, copy] }`:
- tag = first match of `/\[\s*role\s*:\s*(plan|code|review|simple)\s*(?::\s*(amont)\s*)?\]/i` in `tool_input.description`;
- `role`: the tag's role, lower case, else `null` (the key is **always** written: its presence tells a journal written since #559);
- `up: true` only with `:amont`; `label`: the description without the tag (then the existing cleaning and 80 characters).
- `transcript.mjs` (`fromTranscript`) calls `agentEntry`: it gets `role` / `up` with no change.

- [ ] Tests first, red (`node --test test/subagents.test.mjs`):
  - description `'[role:plan:amont] Questions de la demande 12'`, model `fable` → `{ kind: 'agent', model: 'fable', effort: null, role: 'plan', up: true, label: 'Questions de la demande 12' }`;
  - `'[role:code] Tâche 2'` + `isolation: 'worktree'` → `role: 'code'`, no `up` key, `label: 'Tâche 2'`, `copy: true`; `'[Role: Review : amont] x'` → `role: 'review'`, `up: true`; `'[role:chef] x'` and no tag → `role: null`, label unchanged;
  - the 5 existing `deepEqual` on agent entries (lines 11, 13, 22, 67, 109) gain `role: null`; `fromTranscript` on an Agent `tool_use` with `description: '[role:review:amont] Relais'` → `role: 'review'`, `up: true`, `id` kept;
  - `agentsLine` on a journal whose agent has `label: 'Tâche 2'`, `role: 'code'` → same text as without `role`.
- [ ] Implement; `node --test test/subagents.test.mjs test/transcript.test.mjs test/journal.test.mjs` green.

### Task 2: questions and sheets — the proof comes from the sub-agent's record

**Files:** Modify `agent/scripts/upstream.mjs`, `agent/scripts/fabrication.mjs` (remove `upstreamAgent`; the `unproved` `how`); Tests `test/upstream.test.mjs`.

**Interfaces — Consumes:** `role`, `up`, `id` on `run.agents` (task 1); `modelFamily`, `parseJournal`. **Produces (all in `upstream.mjs`):**
- `proofText(body)` → string, and `textHash(body)` → the first 16 hex characters of sha256(`proofText(body)`):

  ```js
  const SIGNATURE = /(?:\n+---[ \t]*\n_[^\n]*\[Claude Code\]\([^)\n]*\)[^\n]*_)+$/;
  export const proofText = (body) => String(body || '').replace(/\r\n?/g, '\n').split(/^<!-- factory-upstream .*$/m)[0]
    .replace(/[ \t]+$/gm, '').trimEnd().replace(SIGNATURE, '').trim();
  ```
- `subagentRecord(session, toolUseId, { projectsDir = join(homedir(), '.claude/projects') } = {})` → the parsed lines (objects) of `agent-<x>.jsonl`, for the `<projectsDir>/*/<session>/subagents/agent-<x>.meta.json` whose `toolUseId` equals `toolUseId`; `null` when nothing matches or anything cannot be read (never throws).
- `writtenTexts(lines)` → string[]: the final content of each file the sub-agent wrote, replaying its `assistant` `tool_use` blocks in order: `Write` `{ file_path, content }` sets the file; `Edit` `{ file_path, old_string, new_string, replace_all }` on a file already set replaces (first occurrence, or all); an `Edit` whose `old_string` is not found, or on a file not set, drops that file. Any other tool (Bash…) writes nothing that counts.
- `ranOn(lines, model)` → boolean: at least one `assistant` line has a `message.model`, and every one of them is of the same family as `model` (`modelFamily`, case-insensitive); `<synthetic>` (Claude Code's own error lines) is ignored.
- `upstreamVerdict(run, { text, record })` → `{ ok: true, model, role, hash }` or `{ ok: false, why: 'none' | 'record' | 'model' | 'text' }`. Candidates: `run.agents` with `up === true`, `role` `plan` or `review`, an `id`; **latest first** (after a failed `plan`, the `review` one that took over wrote the text). For each, `lines = record(agent)`: null → `record`; `!ranOn(lines, run.models[role])` → `model`; no `writtenTexts(lines)` whose `proofText` equals `proofText(text)` (or `proofText(text)` empty) → `text`. The first candidate that passes wins (`model` = lower-case family of `run.models[role]`, `hash` = `textHash(text)`); none passes → the `why` of the latest candidate; no candidate → `none`. Model inference (`roleOf`) is no longer used here.
- `upstreamMarker(run, verdict)` → `'<!-- factory-upstream stage=grilling model=fable role=review text=0123456789abcdef -->'`, or `null` when `!verdict?.ok`.
- `readUpstream(body)` → `{ stage, model, role, text }` (`text`: the 16 hex, or `null` for a marker printed before #559) or `null`; role `plan` or `review` only.
- `upstreamProof`: a marked comment is **valid** when its marker has no `text`, or `text === textHash(comment.body)`. `by` only lists valid ones. Latest document: valid marker → `proved`; a marker whose hash differs → `unproved` (whatever its date); no marker → `unproved` / `old` as today.
- Command line `node .factory/scripts/upstream.mjs <n> <fichier>` (same run lookup as today; session = file name of the run's journal; `record = (a) => subagentRecord(session, a.id)`): prints the marker, exit 0. Otherwise exit 1, nothing on stdout, first line by cause, then the existing ways out (`repair` / `publish`, unchanged):
  - no `<fichier>` or unreadable: « Phase amont : donne le numéro de la demande et le fichier du texte à publier, par exemple \`node .factory/scripts/upstream.mjs 12 /tmp/commentaire.md\`. » (no way out lines);
  - `none`: « Phase amont : aucun sous-agent du rôle \`plan\` annoncé (\`[role:plan:amont]\`) n'a été vu dans ce run pour la demande #<n>. » then « Lance-le avec une \`description\` qui commence par \`[role:plan:amont]\` et \`model\` = \`models.plan.model\` (« Phase amont » dans AGENT.md), puis relance cette commande. Ne publie rien avant. » ;
  - `record`: « Phase amont : le relevé du sous-agent de réflexion est introuvable sur cette machine, l'outil ne peut rien vérifier. » ;
  - `model`: « Phase amont : le sous-agent de réflexion n'a pas répondu sur le modèle choisi pour son rôle. Relance-le avec \`model\` = \`models.<rôle>.model\`. » ;
  - `text`: « Phase amont : le texte de <fichier> n'est pas celui que le sous-agent a écrit avec l'outil Write. Publie son fichier tel quel, sans le réécrire (seules la ligne de preuve et la signature s'ajoutent à la fin). ».
- `fabrication.mjs`: `upstreamAgent` is deleted. The `unproved` `how` keeps its first and last sentences and now says « …par un sous-agent du rôle \`plan\` (description \`[role:plan:amont]\`)… terminée par la ligne de \`node .factory/scripts/upstream.mjs ${run.issue} <fichier>\`… ».

- [ ] Tests first, red (`node --test test/upstream.test.mjs`). Helpers: `agent(model, extra = {})` spreads `extra` (`role`, `up`, `id`; no `role` key unless given, which is the pre-#559 shape the existing tests keep); `rec({ model = 'claude-fable-5-2', writes = [[path, content]], edits = [], final = 'Rendu.' })` → record lines (`assistant` lines with `timestamp`, `message.model`, one `tool_use` or `text` block each); `home(session, [{ id, lines }])` → a temp HOME holding `.claude/projects/p/<session>/subagents/agent-<i>.jsonl` and `.meta.json` (`{ toolUseId: id }`). `TEXT = '<!-- factory-agent -->\n<!-- factory-spec -->\n## Spec (version 1)\n\nLe texte.'`, `SIGN = '\n\n---\n_Généré par [Claude Code](https://claude.ai/code) · software factory_\n'`.
  - `proofText`: `TEXT + '\n\n' + marker + SIGN`, `TEXT + SIGN`, `TEXT` with CRLF and trailing spaces, and `TEXT + '\n\n' + marker + SIGN + '\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_\n'` all equal `TEXT`; one changed word → another `textHash`; `textHash(TEXT)` matches `/^[0-9a-f]{16}$/`.
  - `subagentRecord`: found by `toolUseId` among two records; unknown id, unknown session, `projectsDir` that does not exist, a `meta.json` that is not JSON → `null`.
  - `writtenTexts`: Write A then Write B on the same path → `[B]`; Write then Edit (`old_string` found) → the edited content; Edit whose `old_string` is missing → `[]`; a Bash heredoc → `[]`.
  - `ranOn`: `claude-fable-5-2` vs `'fable'` → true; one line on `claude-opus-5-5` → false; only `<synthetic>` lines or no assistant line → false; fable lines plus one `<synthetic>` → true.
  - **Spec case « un seul sous-agent d'un autre rôle »** — models `{ plan: 'fable', review: 'fable' }`, one agent `fable` with `role: 'code'` (and one with `role: null`), whose record wrote `TEXT` on fable → `{ ok: false, why: 'none' }`; `upstreamMarker` → `null`.
  - **Spec case « le vrai sous-agent de réflexion »** — agent `role: 'plan', up: true`, record on fable that wrote `TEXT` → `{ ok: true, model: 'fable', role: 'plan', hash: textHash(TEXT) }`; marker `<!-- factory-upstream stage=spec model=fable role=plan text=<hash> -->`; `readUpstream` reads it back with `text`; `upstreamProof([comment(TEXT + '\n\n' + marker + SIGN)])` → `proved`, `by: [{ model: 'fable', role: 'plan' }]`.
  - **Spec case « relais par le rôle Revue »** — same models; `plan`/`up` agent whose record wrote nothing, then `review`/`up` agent whose record wrote `TEXT` → `role: 'review'`; `upstreamCheck` on a build whose entry is `proved` with `by: [{ model: 'fable', role: 'review' }]` → `['**Questions et fiche** : faites par Fable (rôle « Revue »)']`.
  - **Spec case « texte réécrit par l'agent qui pilote »** — `upstreamVerdict` with `text: TEXT.replace('Le texte.', 'Un autre texte.')` → `why: 'text'`; `upstreamProof` on a comment whose text differs from its marker's hash, published before `since` as well as after → `unproved`, `by: []`.
  - Other refusals: record `null` → `why: 'record'`; record on `claude-opus-5-5` while `models.plan` is `fable` → `why: 'model'`; agent without `id` → not a candidate.
  - Backward compatibility: the existing `MARK` (no `text=`) cases of « upstreamProof reads the latest trusted spec » pass unchanged; `readUpstream(MARK)` → `{ stage: 'spec', model: 'fable', role: 'plan', text: null }`.
  - Command line (rewrite the 5 existing CLI tests on the new arguments, `HOME` = a `home(…)`): journal `s.jsonl` with `runE('grilling', { issue: 12 })` + a `plan`/`up` agent `id: 'tu1'`, record that wrote the file's text → exit 0, stdout = the marker with `text=`; same with a file whose text differs → exit 1, stderr matches `/n'est pas celui que le sous-agent a écrit/`, stdout empty; agent `role: 'code'` → exit 1, `/aucun sous-agent du rôle `plan`/` and `` /`model`[^\n]*models\.plan\.model/ ``; empty HOME → `/relevé du sous-agent de réflexion est introuvable/`; no file argument and `abc` → `/numéro de la demande/`; the transcript test (hooks not loaded) launches `description: '[role:plan:amont] phase amont'` and adds the sub-agent's record under `.claude/projects/p/sess-1/subagents/`.
  - Delete the test of `upstreamAgent`; `upstreamCheck` `unproved`: the three existing regexes on `how` still pass, plus `/\[role:plan:amont\]/` and `/upstream\.mjs 42 <fichier>/`.
- [ ] Implement; `node --test test/upstream.test.mjs test/gate.test.mjs test/journal-check.test.mjs` green.

### Task 3: bug analysis — proved by the record, written to the journal

**Files:** Modify `agent/scripts/upstream.mjs` (`returned`, `bugProof`), `agent/scripts/journal-check.mjs` (`bugUpdate`, command line), `agent/scripts/fabrication.mjs` (`upstreamCheck`, bug part); Tests `test/upstream.test.mjs`.

**Interfaces — Consumes:** `ranOn`, `subagentRecord` (task 2). **Produces:**
- `returned(lines)` → boolean: the record's **last** `assistant` line has a non-blank `text` block, or the record has a `tool_use` named `SubagentHandback` whose `input.message` is non-blank (how a sub-agent hands its report back in the cloud sessions).
- `bugProof(run, record)` → `{ kind: 'upstream', doc: 'bug', status: 'proved', by: [{ model, role }] }` or `null`. `red` = the run's last failing test. Candidates: `up === true`, role `plan` or `review`, an `id`, launched before `red` (when there is one), latest first. One passes when `lines = record(agent)` exists, `ranOn(lines, run.models[role])`, `returned(lines)`, and the record's last `timestamp` is before `red.t` (`Date.parse`; no `red` → no time condition): the analysis was handed back before the fix began.
- `bugUpdate(files, readFile, { record })` (`journal-check.mjs`; `record(session, agent)`) → `{ file, entry }` or `null`: for a journal whose **last** run is a `bugfix` with `models` and without a `proved` `bug` entry, `bugProof(run, (a) => record(<file name without .jsonl>, a))`. It only ever adds a `proved` entry. Command line: after `upstreamUpdate`, appends it with `t` (same message « Journal : preuve relevée : committe \`.factory/journal/\`. »), `record = (s, a) => subagentRecord(s, a.id)`, inside the existing `try`.
- `upstreamCheck`, bugfix runs with `models`: a run whose agents carry the `role` key (`Object.hasOwn`) is proved only by its `upstream` entry `{ doc: 'bug', status: 'proved' }` (line from `makers(by)[0]`); a run without any `role` key keeps the old rule (`analyst`, `roleOf`: unchanged, as `bugAnalysed`). Line and alert texts unchanged; `how` becomes « analyse du bug : lance \`node .factory/scripts/journal-check.mjs\` depuis le dossier du projet (il lit le relevé du sous-agent d'analyse) ; s'il la demande encore, fais analyser le bug par un sous-agent du rôle \`plan\` (« Phase amont » dans AGENT.md), lancé avec la description \`[role:plan:amont]\` et \`model\` = \`models.plan.model\`, puis reproduis-le par un test rouge et corrige à partir de son analyse ».

- [ ] Tests first, red (`node --test test/upstream.test.mjs`), models `{ plan: 'fable', review: 'fable' }`:
  - **other role, same model**: bugfix run, agent `fable` `role: 'code'` (record on fable, returned), red, green → `bugProof` null; `upstreamCheck` → no line, the alert « Correction du bug : l'outil n'a pas pu vérifier quel modèle a analysé le bug avant sa correction. », the new `how`;
  - **the analysis sub-agent**: agent `plan`/`up` whose record ends before the red test, red, green → entry `by: [{ model: 'fable', role: 'plan' }]`; with that entry in the journal, `upstreamCheck` → `['**Analyse du bug** : faite par Fable (rôle « Plans et organisation »)']`, `missing: []`;
  - **relay**: `plan`/`up` record with `final: ''` (returned nothing), then `review`/`up` record returned, red, green → `role: 'review'` → line « …faite par Fable (rôle « Revue ») »;
  - refused: record null; record on opus; record whose last `timestamp` is after the red test; `review`/`up` agent launched after the last red test (the final reviewer); `returned`: a last line that is a `tool_use` other than `SubagentHandback` → false, `SubagentHandback` with a message → true;
  - `bugUpdate`: returns `{ file, entry }` once, `null` when the run already has its `proved` entry, `null` (never an `unproved` entry) when `record` gives nothing, `null` when the journal's last run is not a bugfix;
  - backward compatibility: the existing tests « bugAnalysed » and « upstreamCheck on a bugfix » (agents without `role`) keep their results, only the expected `how` changes; a new-format bugfix (`role: null` on its agents) with a fable agent before the red test and no entry → alert, no line;
  - `report(…, { stage: 'bugfix', current })` lists `/analyse du bug/` without the entry, not with it.
- [ ] Implement; `node --test test/upstream.test.mjs test/gate.test.mjs test/journal-check.test.mjs test/fabrication.test.mjs` green.

### Task 4: instructions — announce the role, publish the sub-agent's file

**Files:** Modify `agent/AGENT.md` (« Modèles par rôle », « Phase amont », « Preuve de la phase amont »), `agent/stages/grilling.md`, `agent/stages/spec.md`, `agent/stages/framing.md`, `agent/stages/bugfix.md`; Tests `test/model-grid.test.mjs`. Lines wrapped at 120 characters; every sentence the existing tests of `model-grid.test.mjs` match stays.

- [ ] Tests first, red (`node --test test/model-grid.test.mjs`), a new test « every sub-agent announces its role; the proof comes from its own record »: the grid includes `` `[role:<rôle>]` ``, `` `[role:plan:amont]` ``, `` `[role:review:amont]` ``, `` `node .factory/scripts/upstream.mjs <numéro de l'issue> <fichier>` ``, `outil Write`, `annule la preuve`; `grilling.md`, `spec.md` and `framing.md` include `[role:plan:amont]` and `upstream.mjs <n> <fichier>` (and no `upstream.mjs <n>` not followed by ` <fichier>`); in `bugfix.md`, `[role:plan:amont]` comes before `[role:code]`; `question.md` has no `[role:`.
- [ ] `agent/AGENT.md`:
  - « Modèles par rôle », after « …jamais rien d'autre. » : « Sa `description` commence **toujours** par son rôle entre crochets : `[role:<rôle>]` (par exemple `[role:code] Tâche 2`), et `[role:plan:amont]` pour la phase amont (`[role:review:amont]` quand le rôle `review` prend le relais). » ; the last sentence becomes « Le journal note chaque sous-agent, son rôle et son modèle. »
  - « Phase amont » : « Il te rend, dans un fichier… » becomes « Il écrit avec l'outil Write, dans un fichier, le texte exact et complet du commentaire à publier (de `<!-- factory-agent -->` à la dernière phrase, sans ligne de preuve ni signature), puis te rend en quelques lignes… » (the rest of the sentence unchanged) ; « relance-le sur le rôle `review` » gains « (description `[role:review:amont]`) ».
  - « Preuve de la phase amont. » : the command is `node .factory/scripts/upstream.mjs <numéro de l'issue> <fichier>` (the sub-agent's file) ; replace « il lit le journal de ton run et affiche… » by « il lit le journal de ton run et le relevé que Claude Code garde du sous-agent : la ligne invisible `<!-- factory-upstream … -->` n'est donnée que si un sous-agent annoncé `[role:plan:amont]` (ou `[role:review:amont]`) a réellement répondu sur le modèle de son rôle et a écrit lui-même ce fichier. » ; after « ne l'écris jamais toi-même. » add « N'ajoute rien d'autre au texte : tout changement, même après la publication, annule la preuve ; pour corriger, fais corriger le fichier par le sous-agent et redemande la ligne. » ; « avec le paramètre `model` = `models.plan.model` du payload (sans `model`, l'outil ne le reconnaît pas) » becomes « avec la description `[role:plan:amont]` et le paramètre `model` = `models.plan.model` du payload (sans eux, l'outil ne le reconnaît pas) » ; the last sentence becomes « Pour un bug, la preuve est relevée par `journal-check.mjs` dans le relevé du sous-agent d'analyse : il est lancé avec `[role:plan:amont]` et rend son analyse avant le dernier test rouge. »
- [ ] Stages: in the « Qui fait quoi » paragraph of `grilling.md`, `spec.md`, `framing.md`, « …un sous-agent du rôle `plan` » gains « , lancé avec la description `[role:plan:amont]` » and every `node .factory/scripts/upstream.mjs <n>` of the three files becomes `node .factory/scripts/upstream.mjs <n> <fichier>` ; `bugfix.md` step 1 : « **Analyse** par un sous-agent du rôle `plan`, lancé avec la description `[role:plan:amont]` (« Phase amont » dans AGENT.md)… », step 2 : « Un sous-agent du rôle `code` (description `[role:code]`) part de cette analyse ».
- [ ] `npm test` green (whole suite; `test/sync.test.mjs` checks the generated copy has no `{{`).

### Task 5: check in real conditions (read-only)

- [ ] On this machine, with the real records of this run (`~/.claude/projects/*/<session>/subagents/`, session = the file name of this run's journal in `.factory/journal/`), in a scratch script outside the repository: `subagentRecord(session, <id of the journal's agent entry « Write plan for issue 559 »>)` is found; `ranOn(lines, 'fable')` is true and `ranOn(lines, 'opus')` false; `writtenTexts(lines)` contains the content of `docs/plans/issue-559.md` as that sub-agent left it; `returned(lines)` is true; `upstreamVerdict` on a hand-made run `{ stage: 'build', models: { plan: 'fable', review: 'fable' }, agents: [{ id, role: 'plan', up: true }] }` with `text` = that content → `ok`, and with one word changed → `why: 'text'`. Nothing is written, published or pushed.
- [ ] Read the real spec comment of issue #559 (`gh api repos/phoibe/factory/issues/559/comments`, read-only): `upstreamProof` gives `proved` with its marker without `text=` (in-flight requests keep their proof).
- [ ] PR summary: « Essayé en vrai : … » with what was seen; « Pas vérifié en vrai : une demande de test avec le même modèle pour « Plans et organisation » et « Écriture du code » (il faut la livraison et changer les Réglages généraux). »
