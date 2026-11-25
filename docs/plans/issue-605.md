# Repeated-error hunt in the general review (issue #605) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are sequential (1 → 3).

**Goal:** A general review ends with a « Chasse aux erreurs répétées »: it reads the recent history, groups the errors the agents repeat into families, and delivers a proven protection for at most 5 of them, recorded in a « Pièges connus » list every agent reads.

**Architecture:** Instructions only, plus two owner-facing strings. The hunt is a new section of `agent/stages/audit.md` (step « 3 quater », same branch and PR); it reuses the existing roles (`audit` reads history slices, `review` groups and checks proofs, `code` writes protections). **Storage decision:** the list is a `## Pièges connus` section at the end of the project's root `CLAUDE.md`: Claude Code loads that file into every session and every sub-agent, and `scripts/sync.mjs` only writes `.factory/`, `.claude/skills/<installed>`, `.claude/settings.json` and a migrated `factory.config.json` (`scripts/factory.sh` only creates `CLAUDE.md` or appends the factory pointer). No change to `sync.mjs`, `journal.mjs` (`[role:audit]` is already recorded since #570), `journal-check.mjs`, `fabrication.mjs`, `gate.mjs`.

**Tech Stack:** Node 22 ESM, `node --test`, Playwright e2e, no-build vanilla panel. No new dependency.

**Spec:** `docs/specs/605-review-generale-chasser-les-erreurs-repetees-et-les-rendre-i.md` (issue #605, last `<!-- factory-spec -->` comment). Decisions: `docs/adr/0020-…`, `0021-…`, `0022-…`; words: `GLOSSARY.md` « Erreurs répétées ».

## Global Constraints

- Edit sources only (`agent/`, `scripts/`, `panel/`, tests). **Never edit `.factory/` nor `.claude/skills/`, do not run `scripts/sync.mjs` on this repo**: the `sync.yml` workflow commits « chore(factory): sync skills and agent instructions » after the merge (as for #570, commit `0562f89`).
- Role help, verbatim (typographic `’`, plain spaces inside « »): `Relit le code de chaque partie de l’appli et l’historique du projet pendant une review générale. La synthèse reste faite par « Revue ».` Name, default, effort and the four other roles do not change.
- Issue body line, verbatim: `3. Chasse aux erreurs répétées : relecture de l'historique récent, puis une protection prouvée pour chaque erreur revenue au moins deux fois.`
- Glossary words only: « chasse aux erreurs répétées », « famille d'erreurs », « cas passé », « protection », « consigne seulement », « Pièges connus » (never rétrospective, garde-fou, leçons apprises). No model name in `audit.md` (`test/model-grid.test.mjs` forbids `` `opus` `` etc.); no other stage file may use the `audit` role.
- Out of scope: a separate button, showing the list in the panel, a new model setting, installing pstack, the label description in `scripts/lib/labels.mjs`, `GLOSSARY.md` and the ADRs (already merged: check only).
- TDD: every test below is written and seen red before its implementation. Agent-facing text French « tu », owner-facing French « vous », code/comments/commits English. Add `.factory/journal` to each commit.

## Review Focus

- Public project: a history reader must read threads only through `thread.mjs` (the lock refuses anything else) so outsiders' messages never count (task 3 test).
- A project that already has a « Pièges connus » list elsewhere or in another format keeps it (task 3 test on « garde sa place et sa forme »).
- The next review must pick up the families left « à traiter à la prochaine review » from the previous review's summary (task 3 test).
- Nothing found: one sentence in the summary, no list created; and a factory sync run twice leaves `CLAUDE.md` byte-identical (task 3 tests).
- The lock must not ask a general review for anything new: `test/fabrication.test.mjs` and `test/gate.test.mjs` stay green unchanged (final verification).

---

### Task 1: help text of the `audit` role

**Files:** Modify `scripts/lib/models.mjs:22`, `test/models.test.mjs:26`, `e2e/general-settings.e2e.mjs:223`.

- [ ] **Step 1: failing tests.** Replace the expected help sentence by the new verbatim one in `test/models.test.mjs` (`assert.equal(role.help, …)`) and in `e2e/general-settings.e2e.mjs` (`page.getByText(…)`).
- [ ] **Step 2: red.** `node --test test/models.test.mjs` and `CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 node --test e2e/general-settings.e2e.mjs`.
- [ ] **Step 3:** change only the `help` string of the `audit` entry in `MODEL_ROLES`. **Step 4:** same two commands green. Commit `feat(models): the general-review role also reads the project history (#605)`.

### Task 2: the issue opened by « Review générale »

**Files:** Modify `panel/screen-header.mjs:19-22` (`REVIEW_BODY`). Create `e2e/general-review.e2e.mjs`.

- [ ] **Step 1: failing e2e** (same shape as « après confirmation… » in `e2e/ui-polish.e2e.mjs`: `withPanel`, `page.once('dialog', (d) => d.accept())`, click the button « Review générale », wait for the `POST /repos/o/r/issues` write), test name `la demande créée par « Review générale » annonce la chasse aux erreurs répétées`:

```js
assert.equal(card?.body.title, 'Review générale de l\'appli');
assert.deepEqual(card?.body.labels, ['factory:audit']);
assert.deepEqual(card.body.body.split('\n'), ['Review générale demandée depuis le tableau.', '',
  '1. Passe design : critique impeccable de tous les écrans, puis correction de tout ce qu\'elle trouve.',
  '2. Revue de code générale de toute l\'appli, puis correction.',
  '3. Chasse aux erreurs répétées : relecture de l\'historique récent, puis une protection prouvée pour chaque erreur revenue au moins deux fois.', '',
  'Ce qui demande une vraie nouvelle feature devient une issue à part.']);
```

- [ ] **Step 2: red** (`CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 node --test e2e/general-review.e2e.mjs`: line 3 missing). **Step 3:** add the line to `REVIEW_BODY` after line 2, before the empty line. **Step 4:** green. Commit `feat(panel): the general-review request announces the repeated-error hunt (#605)`.

### Task 3: agent instructions

**Files:** Modify `agent/stages/audit.md`, `agent/AGENT.md`, `test/model-grid.test.mjs`, `test/sync.test.mjs`. Create `test/error-hunt.test.mjs`.

- [ ] **Step 1: failing tests.**
  - `test/error-hunt.test.mjs` (reads `agent/stages/audit.md`, `flat = text.replace(/\s+/g, ' ')`, `hunt = flat.slice(flat.indexOf('## Chasse aux erreurs répétées'))`):
    - order: `flat.indexOf('3 ter.') < flat.indexOf('3 quater. **Chasse aux erreurs répétées**') < flat.indexOf('4. **Hors périmètre**')`; the intro ends `chacune suivie de ses corrections, puis la chasse aux erreurs répétées.`; step « 1 bis » (text between `1 bis.` and `2. **Passe design`) includes `chasse aux erreurs répétées`; step 6 (between `6. **PR**` and `7. **Captures**`) includes `une section « Erreurs répétées »`.
    - `hunt` includes each of: `50 au moins et 100 au plus`, `les 100 dernières`, `moins de 50 modifications : toutes`, `branche \`claude/…\``, `node .factory/scripts/thread.mjs <n>`, `ne comptent pas`, `` `[role:audit] Historique : …` ``, `` `models.audit` ``, `un contrôle automatique existant`, `changement d'avis`, `au moins 2 fois`, `au plus 5 familles`, `« à traiter à la prochaine review »`, `Une famille par commit`, `n'affaiblis jamais`, `accepter le code d'aujourd'hui`, `« non protégée »`, `au moins 2 cas réels`, `« consigne seulement »`, `` `## Pièges connus` ``, `` `CLAUDE.md` ``, ``jamais dans `.factory/` ``, `garde sa place et sa forme`, `seulement à la première famille trouvée`, `retire les règles`, `remets les protections perdues`, `sont reprises, avec leurs cas`, `renforcée et prouvée sur ce nouveau cas`, `review générale de la factory elle-même`, `rien n'est créé`.
    - protection order: `indexOf('(a) changer la structure du code') < indexOf('(b) un contrôle automatique') < indexOf('(c) un test') < indexOf('(d) une consigne écrite')`, all ≥ 0; roles in order: `indexOf('[role:audit]') < indexOf('rôle \`review\`') < indexOf('rôle \`code\`')` inside `hunt`.
  - `test/model-grid.test.mjs`, first test: `assert.match(line('audit'), /lecture de l'historique[^\n]*chasse aux erreurs répétées/);` and `assert.match(line('review'), /familles d'erreurs et vérification des preuves/);`.
  - `test/sync.test.mjs`, new test `a sync keeps the project CLAUDE.md and its « Pièges connus », and the instructions point to it (issue #605)`: write `CLAUDE.md` = `'# Mon projet\n\n## Pièges connus\n\n- **Jamais de date en dur dans un test.** Tenue par : contrôle `lint`. Cas : #12, #34.\n'` in `project()`, call `sync` twice, assert the file is byte-identical, and that the flattened `.factory/AGENT.md` matches `/\*\*Pièges connus\.\*\* Si le `CLAUDE\.md` du projet a une partie « Pièges connus »/` and the flattened `.factory/stages/audit.md` includes ``partie `## Pièges connus` à la fin du `CLAUDE.md` du projet``.
- [ ] **Step 2: red.** `node --test test/error-hunt.test.mjs test/model-grid.test.mjs test/sync.test.mjs`.
- [ ] **Step 3: `agent/stages/audit.md`.** Intro: « …chacune suivie de ses corrections, puis la chasse aux erreurs répétées. Pas de spec à valider. » End of step 1 bis, add: « Compte aussi la chasse aux erreurs répétées (étape 3 quater) : la lecture de l'historique et jusqu'à 5 protections avec leur preuve allongent nettement la review. » After step 3 ter, add: « 3 quater. **Chasse aux erreurs répétées** : une fois les corrections des étapes 3 à 3 ter terminées, suis la partie « Chasse aux erreurs répétées » plus bas, sur cette même branche et dans cette même PR. » Step 6: after « une section « Code » (une ligne simple par problème corrigé) » insert « , une section « Erreurs répétées » (point 9 de la chasse) ». Then append this section at the end of the file (wrap at ≤ 120 characters, continuation lines indented 3 spaces like the steps above):

```markdown
## Chasse aux erreurs répétées

Le but : trouver dans l'historique récent les erreurs que les agents refont, et poser pour chacune une protection prouvée au lieu de simplement la noter. Tu pilotes ; les lectures, le tri et le code sont faits par des sous-agents.

1. **Historique à lire.** Les modifications livrées (PR fusionnées dans `{{base}}`) depuis la review générale précédente (la dernière demande `factory:audit` fermée), 50 au moins et 100 au plus : s'il y en a moins de 50 depuis, remonte plus loin jusqu'à 50 ; s'il y en a plus de 100, garde les 100 plus récentes. Première chasse du projet : les 100 dernières. Projet de moins de 50 modifications : toutes. Seulement les modifications faites par la factory (branche `claude/…`) : `gh api "R/pulls?state=closed&base={{base}}&sort=updated&direction=desc&per_page=100" --jq '.[] | select(.merged_at != null and (.head.ref | startswith("claude/"))) | "#\(.number) \(.merged_at) \(.title)"'`. Relève aussi les bugs (`factory:bug`) ouverts sur la même période et les retours en arrière (`git log --grep='^Revert'`). Relis enfin la partie « Erreurs répétées » du résumé de la review générale précédente : ses familles laissées « à traiter à la prochaine review » sont reprises, avec leurs cas.
2. **Lecture par tranches.** Découpe la liste en tranches d'une dizaine de modifications et fais lire chaque tranche, en même temps, par un sous-agent neuf du rôle `audit` (`model` et `effort` de `models.audit`, description `[role:audit] Historique : …`), avec la même règle d'échec qu'à l'étape 3. Il lit chaque PR et sa demande avec `node .factory/scripts/thread.mjs <n>`, jamais autrement (sur un projet public, les messages des personnes extérieures au projet restent laissés de côté et ne comptent pas), puis le diff de la PR. Il rend chaque erreur trouvée : une phrase simple, la modification où elle est apparue (lien), le commit où on la voit, et d'où elle vient. **Compte comme une erreur** : une correction demandée par la relecture, une remarque du propriétaire sur les captures ou en recette, un bug ouvert après une livraison, un retour en arrière. **Ne compte pas** : une erreur déjà arrêtée par un contrôle automatique existant, un simple changement d'avis du propriétaire.
3. **Familles.** Un sous-agent du rôle `review` regroupe ces erreurs en familles (la même erreur revenue au moins 2 fois) et vérifie chaque cas passé à sa source. Protège au plus 5 familles par review : les plus fréquentes d'abord ; à égalité, celles qui viennent d'une remarque du propriétaire en recette ou d'un bug passent avant celles qui viennent de la relecture. Une règle déjà dans les « Pièges connus » dont l'erreur est revenue passe en premier et compte parmi les 5 : sa protection est renforcée et prouvée sur ce nouveau cas ; une famille qui ne reçoit qu'une consigne écrite compte aussi parmi les 5. Les autres sont listées dans le résumé, « à traiter à la prochaine review ».
4. **Protection.** Confie chaque famille à un sous-agent du rôle `code`, qui pose la protection la plus solide possible, dans cet ordre : (a) changer la structure du code pour que l'erreur ne puisse plus s'écrire ; (b) un contrôle automatique (lint, typecheck, script lancé par les contrôles) dont le message dit quoi faire à la place ; (c) un test ; (d) une consigne écrite, en dernier recours et seulement pour ce qui relève du jugement. Si le changement de structure est un trop gros chantier, pose maintenant la protection du niveau suivant, prouvée de la même façon, et ouvre une idée (point 4 plus haut, pas de `factory:kept`). Une famille par commit : la protection, sa ligne dans les « Pièges connus » et la correction de la même erreur là où elle existe encore dans le code d'aujourd'hui. Ne désactive et n'affaiblis jamais un test ou un contrôle existant.
5. **Preuve.** Une protection n'est livrée que si elle aurait refusé un cas passé : rejoue-la sur le code tel qu'il était au moment de l'erreur (le commit ou la PR du cas, dans un `git worktree` à part) ; elle doit le refuser, et accepter le code d'aujourd'hui. Un sous-agent du rôle `review` vérifie chaque preuve. Aucun cas rejouable : la protection n'est pas livrée et la famille est listée « non protégée », avec la raison. Seule exception, la consigne écrite : sa preuve est la liste d'au moins 2 cas réels, avec leurs liens ; elle est livrée et marquée « consigne seulement ».
6. **Liste « Pièges connus ».** Une ligne par règle : `- **<la règle en une phrase>** Tenue par : <la protection, ou « consigne seulement »>. Cas : #12, #34.` Elle vit dans une partie `## Pièges connus` à la fin du `CLAUDE.md` du projet (crée le fichier s'il manque), jamais dans `.factory/` : tous les agents et leurs sous-agents lisent ce fichier à chaque run, et la synchro de la factory n'y touche pas. Crée cette partie seulement à la première famille trouvée. Si le projet a déjà une liste « Pièges connus », garde sa place et sa forme, et complète-la.
7. **Entretien de la liste**, à chaque review générale, même sans nouvelle famille : retire les règles dont l'erreur ne peut plus arriver ; remets les protections perdues (un contrôle ou un test cité par la liste qui n'existe plus ou ne tourne plus) ; regarde si chaque règle « consigne seulement » peut devenir un contrôle ou un test.
8. **Erreurs venues de la factory.** Une famille dont la cause est dans les consignes ou les outils de la factory (`.factory/`, skills installés) ne se corrige pas ici : ne touche pas à ces fichiers, signale-la dans le résumé ; elle sera traitée par une review générale de la factory elle-même.
9. **Résumé « Erreurs répétées »** (dans la PR, étape 6), en français simple. Pour chaque famille protégée : l'erreur en une phrase, les modifications où elle est apparue (liens), la protection posée, le cas passé qu'elle aurait refusé (ou « consigne seulement » et ses cas). Puis les familles laissées de côté avec leur raison (« à traiter à la prochaine review », « non protégée », venue de la factory), ce qui a été retiré ou remis dans la liste, et le lien vers la liste « Pièges connus ». Rien trouvé : une seule phrase (« Aucune erreur répétée dans les N dernières modifications. ») et rien n'est créé.
```

- [ ] **Step 4: `agent/AGENT.md`** (lines ≤ 120 outside the table). After the paragraph « Si une étape est désactivée ci-dessus… », add: « **Pièges connus.** Si le `CLAUDE.md` du projet a une partie « Pièges connus », ce sont les erreurs que les agents ont déjà faites plusieurs fois ici : respecte chaque règle et rappelle aux sous-agents celles qui touchent leur tâche. Seule une review générale modifie cette liste (`stages/audit.md`). » Models table: `review` row ends « …synthèse d'une review générale et relecture de ses corrections, familles d'erreurs et vérification des preuves de sa chasse aux erreurs répétées »; `audit` row tasks become « relectures partie par partie d'une review générale (étape 3 de `stages/audit.md`), même quand une petite appli est relue d'un seul bloc, et lecture de l'historique tranche par tranche pendant sa chasse aux erreurs répétées ; rien d'autre ».
- [ ] **Step 5: green.** Same command as step 2, plus `node --test test/design-rule.test.mjs test/design-score.test.mjs test/issue-language.test.mjs test/no-empty-review.test.mjs test/real-check.test.mjs`. Commit `feat(agent): repeated-error hunt at the end of a general review (#605)`.

### Final verification (all must pass; paste the tails in the hand-back)

```bash
npm run typecheck && npm run lint && npm test 2>&1 | tail -8 && npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 npm run test:a11y 2>&1 | tail -8
CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 npm run test:e2e 2>&1 | tail -8
git status --short   # nothing under .factory/ (except .factory/journal/) nor .claude/skills/
grep -n "Pièges connus\|Chasse aux erreurs répétées" GLOSSARY.md && ls docs/adr/0020-* docs/adr/0021-* docs/adr/0022-*   # already merged: check only
```

The spec check « le journal montre les lectures d'historique sur le moteur des relectures » can only be seen at the next general review of a project after its sync (the journal already records every `[role:audit]` sub-agent with its model): say so in the PR (« Pas vérifié en vrai »).
