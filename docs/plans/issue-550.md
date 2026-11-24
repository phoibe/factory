# Upstream thinking done by the « Plans et organisation » model (issue #550) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The analysis of a request, its questions, alerts and spec, the project framing and the analysis of a bug are done by a sub-agent of role `plan`; the pilot only publishes; the « Fabrication » journal of each PR proves it and the lock refuses the PR otherwise.

**Architecture:** Instructions: one rule « Phase amont » in `agent/AGENT.md`, a short reminder in each upstream stage. Proof, measured by the tool: (1) before publishing a round, a spec or a project sheet, the pilot runs `node .factory/scripts/upstream.mjs <n>`, which reads the run's journal and prints a hidden line `<!-- factory-upstream stage=… model=… role=… -->` (nothing when no `plan` sub-agent ran) that ends the comment; (2) at build time `journal-check.mjs` reads the issue's comments and writes what it found as a journal entry `{kind:'upstream'}`; the journal is committed, so the lock (`problems`) and the relay's « Fabrication » comment (`summarize`) read it like any other step, with no network and **no relay change**. A bug's proof is in the bugfix run's own journal (a `plan`-role sub-agent launched before the fix).

**Tech Stack:** Node 22 ESM, `node --test`, no dependency.

**Spec:** issue #550, last `<!-- factory-spec -->` comment (the build saves it to `docs/specs/`, not this plan).

## Global Constraints

- No new setting: roles come from the payload's `models` (`plan`, `review`), defaults `fable` / `fable`.
- The pilot still publishes, labels, opens the slice issues and the documents PR, closes; the `plan` sub-agent writes nothing on GitHub (comment, label, issue, PR) and pushes nothing. The chat (`stage: question`) is untouched.
- Failure of the `plan` sub-agent → retry on role `review`, owner not disturbed. A `review`-role model counts as proof.
- In-flight requests are never blocked: nothing is expected from a run journaled by the older scripts (its `run` entry has no `models`), nor from a spec published before the upstream instruction reached the project's `.factory/AGENT.md` (its latest delivery: after a factory rollback and a new delivery, the new one; unknown → every spec counts as « old ») (+ 3 h, longer than any run).
- Never edit `.factory/` nor `.claude/skills/`. Owner-facing text French, vouvoiement, no jargon; agent-facing text French « tu »; code and comments English. Tests first (red), `npm test` green at the end.
- The marker is printed by the tool only; the instructions forbid writing it by hand (same trust as the journal files).

## Review Focus

- Default settings give `plan` and `review` the same family: the final reviewer of a bugfix must not count as the bug's analysis (task 1, cases B and C).
- A spec published before the delivery, or by a run that started just before the sync, has no marker → « old », no lock (task 2, grace cases); only the **latest** spec version decides.
- A comment from an untrusted author carrying the markers (public project) is ignored (task 2).
- GitHub unreachable when `journal-check` reads the issue → status `unread`: a line « non mesuré », no lock, no crash (task 2).
- Hooks not loaded (routine serving several projects) or a stale journal of another request: `upstream.mjs <n>` rebuilds the journal from the transcript and only reads a run of issue `<n>`; otherwise it prints no marker and exits 1 (task 2, CLI test).

---

### Task 1: the journal knows the roles; proof rules, Fabrication lines and lock

**Files:** Modify `agent/scripts/journal.mjs`, `agent/scripts/fabrication.mjs`, `agent/scripts/journal-check.mjs`; Create `test/upstream.test.mjs`; Modify `test/journal.test.mjs`, `test/gate.test.mjs`.

**Interfaces — Produces:**
- `journal.mjs`: `ROLE_DEFAULTS = { plan: 'fable', review: 'fable' }`; `runFromPrompt` adds `models: { plan, review }` (the payload's `models.<role>.model`, or `models.<role>` when it is a string, else the default) to every run.
- `fabrication.mjs` `parseJournal`: each run also carries `issue`, `models` (null for an older journal) and `upstream` (its last `kind:'upstream'` entry, else null).
- `roleOf(model, models)` → `'plan' | 'review' | null`: same family (`modelFamily`, case-insensitive) as `models.plan`, else as `models.review`; null without model or models.
- `upstreamAgent(run)` → `{ model: <family, lower case>, role } | null`: the run's **latest** agent with a role (after an escalation to `review`, the model that succeeded).
- `bugAnalysed(run)` → boolean: an agent with a role launched before the run's **last** red test (`String(a.t) < String(red.t)`); no red test → any agent with a role. (Launched after a green fix it is the reviewer; redoing analysis → red test → fix satisfies the lock.)
- `upstreamCheck(runs)` → `{ lines: string[], missing: [{ alert, how }] }`:
  - bugfix runs **with `models`**: one is `bugAnalysed` → line `**Analyse du bug** : faite par Fable (rôle « Plans et organisation »)`; none → `alert` « Correction du bug : l'outil n'a pas pu vérifier quel modèle a analysé le bug avant sa correction. », `how` « analyse du bug : fais analyser le bug par un sous-agent du rôle \`plan\` (« Phase amont » dans AGENT.md), lancé avec \`model\` = \`models.plan.model\`, puis reproduis-le par un test rouge et corrige à partir de son analyse ».
  - build / foundation runs **with `models` and `issue`**, their latest `upstream` entry `{ doc: 'spec'|'brief', status, by: [{ model, role }] }`; label = `Questions et fiche` (`spec`) or `Questions et fiche projet` (`brief`):
    - no entry (not read back yet) → line `**<label>** : non mesuré (l'outil n'a pas pu vérifier quel modèle les a faites)`, no alert (`alert: null`), `how` « questions et fiche : lance \`node .factory/scripts/journal-check.mjs\` depuis le dossier du projet (il relit la demande) » ;
    - `proved` → line `**<label>** : faites par Fable (rôle « Plans et organisation »)` (each `by`, joined by `, `; `review` → « Revue ») ;
    - `unproved` → `alert` « <label> : l'outil n'a pas pu vérifier quel modèle les a faites (la dernière version publiée ne porte pas la preuve). », `how` « questions et fiche : la fiche publiée ne porte pas la ligne de preuve. Fais-la réécrire par un sous-agent du rôle \`plan\` à partir du fil de la demande, sans rien changer à ce qui est décidé ni redemander de validation, publie-la comme nouvelle version terminée par la ligne de \`node .factory/scripts/upstream.mjs <issue>\`, puis relance \`node .factory/scripts/journal-check.mjs\` ; si \`upstream.mjs\` refuse encore, ne republie rien (aucune nouvelle version pour le propriétaire) et continue : le bilan le signalera » ;
    - `old` → line `**<label>** : publiées avant la mise en place de cette preuve (non mesuré)` ; `unread` → `**<label>** : non mesuré (l'outil n'a pas pu vérifier quel modèle les a faites : la demande n'a pas pu être relue)` ; `none` → nothing.
- `summarize`: `lines` added after the « Sous-agents » line, each `alert` pushed to the alerts (the returned `missing` skills list is unchanged).
- `journal-check.mjs` `problems`: appends each `how`, except for a `skills-fix` run and non-gated stages (existing early return).

- [ ] Tests first, red (`node --test test/upstream.test.mjs test/journal.test.mjs test/gate.test.mjs`):
  - `runFromPrompt` with `"models":{"plan":{"model":"opus"},"review":{"model":"fable"}}` → `models: { plan: 'opus', review: 'fable' }`; without → `{ plan: 'fable', review: 'fable' }` (update the two existing `deepEqual`); `ROLE_DEFAULTS` equals the `plan` and `review` defaults of `MODEL_ROLES` (`scripts/lib/models.mjs`).
  - `roleOf('claude-fable-5-2', { plan: 'fable', review: 'fable' }) === 'plan'`; `roleOf('fable', { plan: 'opus', review: 'fable' }) === 'review'`; `roleOf('sonnet', …)`, `roleOf(null, …)`, `roleOf('fable', null)` → null.
  - `bugAnalysed`, bugfix run with models fable/fable — A: agent fable, agent opus, red, green, agent fable → true; B: agent opus, red, green, agent fable → false; C: B then agent fable, agent opus, red, green → true; D: agent fable, no test → true.
  - `upstreamCheck`: every case above with its exact text (`unproved` with `issue: 42` → `how` contains `upstream.mjs 42`); `by` = opus/plan + fable/review → `Opus (rôle « Plans et organisation »), Fable (rôle « Revue »)`; two `upstream` entries → the last wins; a bugfix or build run **without `models`** → `{ lines: [], missing: [] }`.
  - `summarize` on a proved build: body contains the line after `**Sous-agents**`, no alert; on `unproved`: one alert matching `/Questions et fiche/`.
  - `report(…, { stage: 'build', current })` on a complete build journal whose entry is `unproved` → matches `/questions et fiche/`; same with `stage: 'skills-fix'` → not listed; `gate.test.mjs`: `decide(bash('gh pr create …'))` on that journal is denied with that reason.
- [ ] Implement; run the whole `npm test` (the existing journals of the tests have no `models`: none may change).

### Task 2: `upstream.mjs` (marker, proof read from the comments) and its recording by `journal-check`

**Files:** Create `agent/scripts/upstream.mjs`; Modify `agent/scripts/journal-check.mjs` (command line, `runOptions`), `agent/scripts/specs.mjs` (export `trusted` and `defaultGh`), `scripts/sync.mjs:113` (ship `upstream.mjs`); Tests `test/upstream.test.mjs`, `test/sync.test.mjs`, `test/specs.test.mjs`.

**Interfaces — Consumes:** `parseJournal`, `upstreamAgent` (task 1); `trusted`, `defaultGh`, `repoFromRemote` (`specs.mjs`); `importTranscript`. **Produces:**
- `upstreamMarker(run)` → `'<!-- factory-upstream stage=spec model=fable role=plan -->'`, or null without `upstreamAgent(run)`.
- `readUpstream(body)` → `{ stage, model, role } | null` (role `plan` or `review` only).
- `UPSTREAM_GRACE_MS = 3 * 3600_000`; `upstreamProof(comments, { doc = 'spec', since = null, owner = null })` → `{ kind: 'upstream', doc, status, by }`: the doc comment is the latest **trusted** comment with the line `<!-- factory-spec -->` (`brief`: `<!-- factory-brief -->`); none → `none`; it carries a readable marker → `proved`; else `since` known and `created_at` later than `since` + grace → `unproved`; else `old`. `by` = distinct `{ model, role }` of the markers of every trusted comment, oldest first.
- `latestRun(files, readFile, { issue = null, notBefore = null, keep = null })` → `{ file, run, text } | null`: the journal whose last `run` entry is the most recent (and is on `issue` when given; with `notBefore`, a run that started earlier is skipped unless its journal is `keep`, the current session's); `runOptions` is rewritten on top of it, same result.
- `upstreamEntry(run, comments, { since, owner })` → the entry for a `build` (`spec`) or `foundation` (`brief`) run that has an `issue`, else null; `comments === null` → `status: 'unread'`, `by: []`.
- Command line `node .factory/scripts/upstream.mjs <n>`, from the project's folder: rebuilds the journal from the transcript when needed (as `journal-check` does), takes `latestRun` over `.factory/journal/*.jsonl` for issue `<n>`, only a run of the last 12 hours (or this session's), prints the marker of its last run and exits 0; otherwise prints « Phase amont : aucun sous-agent du rôle \`plan\` n'a été vu dans ce run pour la demande #<n>. », the probable cause (no \`model\`, or another one than \`models.plan.model\`), « Lance-le avec \`model\` = \`models.plan.model\` (« Phase amont » dans AGENT.md), puis relance cette commande. Ne publie rien avant. » and the way out: at \`build\` or \`foundation\` « Si elle refuse encore, ne republie rien : la version déjà publiée reste celle du propriétaire, le bilan le signalera. », else « Si elle refuse encore après un sous-agent \`plan\` puis un sous-agent \`review\`, chacun lancé avec son \`model\`, publie sans la ligne : le contrôle à la construction le signalera. »; when no run is found (stage unknown), both: « si tu es à une construction (build ou foundation), ne republie rien et continue, le bilan le signalera ; sinon, … publie sans la ligne »; exits 1.
- `upstreamSince(git)` (`journal-check.mjs`) → the date (`%cI`) of the latest commit that brought `upstream.mjs` into `.factory/AGENT.md` (it has it, its parent does not; `git log -S'upstream.mjs' -- .factory/AGENT.md`), null when unknown or when `AGENT.md` does not have it now.
- `upstreamUpdate(files, readFile, { repo, comments, since })` (`journal-check.mjs`, command line before `report`): targets the branch's latest `build` / `foundation` run (the last run of its journal, so a later `fix-checks` or `update-branch` run does not hide it), `upstreamEntry` with the comments from `defaultGh('repos/<repo>/issues/<n>/comments')` (null when it throws), `owner` = the repo's owner, `since` = `upstreamSince`; appended to that run's journal file with `t`, unless equal to the newest `upstream` entry of the branch's build / foundation runs of that issue, and never `unread` over a measured one (`proved`, `unproved`, `old`).
- `importTranscript` (`transcript.mjs`): a journal written from the transcript is rebuilt as the session goes on, keeping the entries other scripts added (each after the transcript entries older than it), never twice the same `id`.

- [ ] Tests first, red:
  - `upstreamMarker`: spec run, models fable/fable, agent `fable` → the exact line above; models opus/fable, agent `claude-opus-5-5` → `model=opus role=plan`; only a `sonnet` agent, or no agent → null. `readUpstream(marker)` round-trips; `role=code`, or a body without marker → null.
  - `upstreamProof` (owner `o`, comments by `o`): marked spec → `proved`, `by: [{ model: 'fable', role: 'plan' }]`; v1 marked then v2 unmarked created 4 h after `since` → `unproved`, `by` still lists v1; unmarked spec created before `since`, 2 h after it, or with `since: null` → `old`; a marked spec by `{ login: 'x', author_association: 'NONE' }` posted after the owner's unmarked one → ignored; `doc: 'brief'` reads `<!-- factory-brief -->`; no spec but two marked rounds → `none` with `by` filled.
  - `latestRun` with `issue: 12` ignores a more recent journal of issue 13; `upstreamEntry` → null for a bugfix run, `doc: 'brief'` for foundation, `unread` for `comments: null`.
  - Command line (`spawnSync(process.execPath, [script, '12'], { cwd: tmp })`, journal written in `tmp/.factory/journal/s.jsonl`): grilling run of issue 12 with a `fable` agent → stdout is the marker, status 0; same without agent → status 1, output matches ``/aucun sous-agent du rôle `plan`/`` and has no `factory-upstream`; argument `13` → status 1.
  - `sync` installs `.factory/scripts/upstream.mjs`; `cleanSpec` of a spec ending with the marker contains no `factory-upstream`.
- [ ] Implement; `npm test`.

### Task 3: instructions (pilot delegates, publishes with the proof line)

**Files:** Modify `agent/AGENT.md` (« Journal de fabrication », « Modèles par rôle »), `agent/stages/grilling.md`, `spec.md`, `framing.md`, `bugfix.md`, `docs.md`; Tests `test/model-grid.test.mjs`. `agent/stages/question.md` unchanged.

- [ ] Tests first, red: the `plan` line of the table matches `/phase amont[^\n]*cadrage[^\n]*analyse d'un bug/`; the grid has `**Phase amont**`, `**Preuve de la phase amont.**`, `upstream.mjs`, `factory-upstream`, `sans le réécrire`, ``relance-le sur le rôle `review` ``, `Seul le chat`, and still `tâches simples → code → revue` and `même pour une petite`; `grilling.md`, `spec.md`, `framing.md` each contain `` `plan` `` and `upstream.mjs`; `bugfix.md` contains `` `plan` `` before `` `code` ``; `docs.md` contains `` `plan` ``; `question.md` contains neither `upstream.mjs` nor `` `plan` ``; add these five stages to the « names a role, not a fixed model » test.
- [ ] `agent/AGENT.md`:
  - `plan` row, « Tâches »: `phase amont d'une demande (analyse, questions, alertes, spec), cadrage d'un projet, analyse d'un bug, écrire les plans, tâches d'architecture, débogage d'un problème qui résiste`.
  - « Tu ne fais que piloter » : « tu délègues toujours la phase amont et l'écriture d'un plan à un sous-agent du rôle `plan`, et l'écriture du code… » (rest unchanged), then two new bullets:

```
- **Phase amont** (étapes `grilling`, `spec` et `framing`, analyse d'un bug dans `bugfix`). Toute la réflexion revient à
  un sous-agent du rôle `plan`, jamais à toi : analyser la demande et chercher les faits dans le code, classer sa taille,
  repérer les alertes (demande sensible, en double, déjà réglée, obsolète, trop grosse), choisir les questions et leurs
  recommandations, décider qu'une demande est petite et claire, rédiger la spec ou la fiche projet, écrire le glossaire
  et les décisions, trouver la cause d'un bug. Donne-lui le payload, le fil complet de l'issue (description,
  commentaires, chemins des captures) et le fichier d'étape à suivre ; il charge lui-même les skills que l'étape nomme.
  Dis-lui qu'il n'écrit rien sur GitHub (commentaire, label, issue, PR) et ne pousse rien : là où le fichier d'étape
  dit « publie », « mets le label » ou « ouvre une issue », il écrit le texte dans un fichier et te le rend. Il te rend,
  dans un fichier, le texte exact du commentaire à publier, puis en quelques lignes les labels à poser, le texte des
  issues à ouvrir et, s'il y en a une, l'alerte avec sa preuve. Toi, tu publies ce texte sans le réécrire, tu poses
  les labels, tu ouvres toi-même les issues des tranches, tu ouvres la petite PR de documents et tu fermes une
  demande inutile. Une petite demande claire, qui saute les questions, a aussi sa spec écrite par lui. Des variantes
  à montrer (étape 3 bis de `grilling.md`) : il dit lesquelles, un sous-agent du rôle `code` les construit. S'il
  échoue (pas de réponse, ou texte inutilisable deux fois), relance-le sur le rôle `review`, sans déranger le
  propriétaire. Seul le chat (`stage` `question`) reste chez toi.
- **Preuve de la phase amont.** Avant de publier un round de questions, une spec ou une fiche projet, lance
  `node .factory/scripts/upstream.mjs <numéro de l'issue>` depuis le dossier du projet : il lit le journal de ton run et
  affiche une ligne invisible `<!-- factory-upstream … -->` qui dit quel modèle a fait la réflexion. Colle-la telle
  quelle à la fin du commentaire, juste avant la signature ; ne l'écris jamais toi-même. Aucun round de questions,
  aucune spec ni fiche projet ne se publie sans cette ligne (une estimation, une alerte ou la question d'un bug n'en
  ont pas besoin). S'il répond qu'aucun sous-agent du rôle `plan` n'a été vu, lance-le d'abord, avec le paramètre
  `model` = `models.plan.model` du payload (sans `model`, l'outil ne le reconnaît pas), puis relance la commande.
  S'il refuse encore après un sous-agent `plan` puis un sous-agent `review`, chacun lancé avec son `model`, publie
  sans la ligne : le contrôle à la construction le signalera. À la construction, `journal-check.mjs` relit la
  demande : si la spec n'a pas cette ligne, le verrou refuse d'ouvrir la PR. Pour un bug, la preuve est dans le
  journal du run : le sous-agent d'analyse est lancé avant le dernier test rouge.
```

  - « Journal de fabrication » : after « te dit ce qu'il ne montre pas encore », add « (pour une construction, il relit aussi la demande pour relever quel modèle a fait les questions et la fiche) ».
- [ ] Stages:
  - `grilling.md`, `spec.md`, `framing.md`, right under « But » : « **Qui fait quoi.** Tout ce que cette étape demande de réfléchir ou de rédiger est fait par un sous-agent du rôle `plan` (« Phase amont » dans AGENT.md) : donne-lui ce fichier à suivre et dis-lui de ne rien publier ni poser aucun label (…). Toi, tu publies son texte, terminé par la ligne de `node .factory/scripts/upstream.mjs <n>`, et tu poses les labels. »
  - `spec.md` step 3 and `framing.md` « La fiche projet » : the comment « se termine, juste avant la signature, par la ligne de preuve (`upstream.mjs`) ».
  - `bugfix.md` : step 1 becomes « **Analyse** par un sous-agent du rôle `plan` (« Phase amont » dans AGENT.md), avant tout autre travail : il lit l'issue, cherche dans le code (skill `systematic-debugging`) et te rend soit la question à poser quand le comportement attendu n'est pas clair, soit la cause probable, les fichiers concernés et le test qui reproduira le bug. S'il rend une question : pose-la (**une** question simple) sur l'issue, mets `factory:blocked` et termine. » ; step 2, after the branch : « Un sous-agent du rôle `code` part de cette analyse : skill `systematic-debugging`, reproduis le bug… » (rest unchanged).
  - `spec.md` step 4 bis : the sub-agent writes the text of each slice in its file and the pilot opens those issues.
  - `docs.md` : the journal (`.factory/journal/`) never goes on the `claude/docs-<n>` branch.
  - `docs.md`, after the first paragraph : « Pendant la phase amont, c'est le sous-agent du rôle `plan` qui charge ces skills et écrit ces documents (« Phase amont » dans AGENT.md) : place-toi d'abord sur la branche de documents, demande-lui de les écrire, puis fais toi-même le commit et la petite PR. »
- [ ] `npm test` (also `test/vouvoiement.test.mjs`, `test/sync.test.mjs`, `test/question-stage.test.mjs`).

### Task 4: check in real conditions (read-only)

- [ ] Feed `upstreamProof` with the real comments of issue #550 (`gh api repos/phoibe/factory/issues/550/comments --paginate`, `since: null`) → `old`; with `since` one day before its spec → `unproved`. Feed `upstreamCheck(parseJournal(…))` with a real merged journal of `.factory/journal/` (bugfix and build) → no line, no alert (older runs). Report both in the PR's « Essayé en vrai ». Not checkable read-only: a real grilling run publishing a marked round (needs the sync to reach a project) → « Pas vérifié en vrai ».
