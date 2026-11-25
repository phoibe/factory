# Code review: a problem blocks only when it is proven (issue #604) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking. Two sequential tasks.

**Goal:** In the four code reviews that have the round limit, a finding blocks only when the reviewer proves it with a command it ran (or it is one of three cases seen on reading); everything else is a « simple remarque » that costs no round and no escalation.

**Architecture:** The rule is prose for the agent, not code. It is written **once**, in a new shared guide `agent/stages/code-review.md` (same convention as `readme.md`, `stack.md`, `design-pass.md`: « Ce n'est pas une étape à part »), and the review step of the four stages points to it. `scripts/sync.mjs` copies every file of `agent/stages/` to `.factory/stages/` and renders `{{maxLoops}}`: **no change in `scripts/`**. `foundation.md` (new project) already says « Revue de code … comme dans `build.md` (étapes 5 et 6) » and inherits the rule untouched.

**Tech Stack:** Node 22 ESM, `node --test`. No new dependency, no script, no automated check of the rule (spec: out of scope).

**Spec:** issue #604, last `<!-- factory-spec -->` comment (« Spec (version 1) »). The build stage saves it to `docs/specs/` (step 6 ter), not this plan.

## Global Constraints

- The four reviews, and only them: step 5 of `agent/stages/build.md` (feature, and a new project's scaffold through `foundation.md`), step 3 of `bugfix.md`, step 1 of `skills-fix.md`, the review **of the fixes** at the end of step 3 of `audit.md`.
- Untouched: the part-by-part reviews and their synthesis in `audit.md` (« Fais corriger chaque point… » stays), the security review (step 5 bis of `build.md`: « Corrige ce qu'il trouve avec un test qui échoue d'abord » stays), the light reviews (`acceptance-fix.md`, `visual-fix.md`, `ui-polish.md`, per-task reviews of a large plan), the number of rounds (`{{maxLoops}}`), the reviewer's role (`review`), the panel and its settings.
- Edit sources only: **never edit `.factory/`, `.claude/skills/` nor `packs/`, and do not run `scripts/sync.mjs` on this repo** (the `sync.yml` workflow commits « chore(factory): sync skills and agent instructions » after the merge).
- `GLOSSARY.md` and `docs/adr/` are handled by the open PR #607: do not edit them here. Use its terms as the guide below writes them: « problème bloquant », « simple remarque », « tour », « preuve ».
- Agent-facing text in French, « tu »; quoted owner messages with « vous »; test names, comments and commits in English.
- Existing tests the new text must keep green: `test/model-grid.test.mjs` (in `audit.md`, the sentence « revue neuve des corrections par un sous-agent du rôle `review`, au plus {{maxLoops}} tours » stays contiguous; no stage file other than `audit.md` may contain « rôle `audit` » nor `[role:audit`), `test/stack-neutral.test.mjs` (no product name in a stage file: beware a capitalised « Vite », « Express », « React »), `test/thread.test.mjs` (no `gh api` thread read in backticks), `test/vouvoiement.test.mjs`.
- Baseline before the change: `npm test` → 1740 tests, 0 fail. After: 1752 tests, 0 fail.

## Review Focus

Prose cannot be executed; these are the ways it goes wrong for the owner, each pinned by a test of task 1:

- The reviewer sub-agent never sees the rule (it only gets the skill's Critical / Important / Minor template) → the review step says to put the guide in its instructions, and the guide says it wins over the two skills (test « the reviewer and the fixer are both given the guide »).
- One of the four steps keeps « Corrige ce qu'il trouve »: old and new rule contradict each other → `doesNotMatch` on each review step.
- Scope leak: the guide gets applied to the security review, the first full read of a general review or a light review → test « only the four reviews with rounds follow the guide ».
- Round counting: a review whose findings do not reproduce ends the step without consuming a round, and the escalation comes from the review **after** round `{{maxLoops}}` → test « a round counts only when… ».
- The guide never reaches the projects, or reaches them with a raw `{{maxLoops}}` → sync into a temp project (last test).

---

### Task 1: the failing test

**Files:** Create `test/proven-review.test.mjs`.

- [ ] **Step 1: write the test**, exactly:

```js
// Issue #604: in the four code reviews that have rounds, a problem blocks only when it is proven by a command the
// reviewer ran (or is one of three cases seen on reading). The rule lives in one guide the four stages point to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sync } from '../scripts/sync.mjs';

const read = (f) => readFileSync(new URL(`../agent/${f}`, import.meta.url), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const GUIDE = '.factory/stages/code-review.md';
const guide = () => flat(read('stages/code-review.md'));
const between = (file, from, to) => { const t = flat(read(`stages/${file}`)); const i = t.indexOf(from); return i < 0 ? '' : t.slice(i, t.indexOf(to, i)); };
// The review step of each of the four stages.
const STEPS = {
  'build.md': () => between('build.md', ' 5. **Revue de code**', ' 5 bis.'),
  'bugfix.md': () => between('bugfix.md', ' 3. Revue par', ' 3 bis.'),
  'skills-fix.md': () => between('skills-fix.md', ' 1. **`requesting-code-review`**', ' 2. '),
  'audit.md': () => between('audit.md', 'Puis une revue neuve des corrections', ' 3 bis.'),
};

test('a blocking problem is proven by a command: exact command, what it printed, what it should have printed', () => {
  const g = guide();
  assert.match(g, /prouvé\*\* par une commande que le relecteur a lancée lui-même/);
  assert.match(g, /la commande exacte, ce qu'elle a affiché, et ce qu'elle aurait dû afficher/);
  assert.match(g, /est une lecture, pas une preuve/);
  assert.match(g, /Une simple remarque ne bloque jamais, ne compte pas dans les tours et n'est jamais remontée au propriétaire/);
});

test('three cases block without a command: security or data loss, spec gap, written rule', () => {
  const g = guide();
  assert.match(g, /Trois cas restent bloquants sans commande/);
  assert.match(g, /sécurité ou de perte de données\*\* qu'on ne peut pas démontrer sans toucher à du réel[^.]*scénario/);
  assert.match(g, /écart avec la spec\*\*[^;]*critère d'acceptation/);
  assert.match(g, /écart avec une règle écrite\*\*[^.]*cite la règle et l'endroit/);
});

test('the fixer re-runs the command first; an unconfirmed problem becomes a remark; a failing-test proof is kept', () => {
  const g = guide();
  assert.match(g, /relance lui-même la commande/);
  assert.match(g, /si le résultat attendu par le relecteur est bien ce que demande la spec/);
  assert.match(g, /Sinon il ne corrige rien : le problème devient une simple remarque/);
  assert.match(g, /ce test reste dans le projet/);
  assert.match(g, /qu'il a vérifiées lui-même[^.]*sans nouvelle revue/);
});

test('a round counts only when a blocking problem was confirmed then fixed; the escalation says how it was shown', () => {
  const g = guide();
  assert.match(g, /Un tour ne compte que si au moins un problème bloquant a été confirmé puis corrigé/);
  assert.match(g, /Au plus \{\{maxLoops\}\} tours/);
  assert.match(g, /Une revue sans problème bloquant confirmé termine l'étape, même s'il reste des remarques/);
  assert.match(g, /`factory:blocked`[^.]*\. Ce message dit en plus, en mots simples, comment le problème a été démontré/);
});

test('the technical part of the PR lists the proven problems with their command, and the remarks', () => {
  const g = guide();
  for (const s of ['`Code review`', '`Blocking problems`', '`Remarks`', '`none`']) assert.ok(g.includes(s), s);
  assert.match(flat(read('stages/skills-fix.md')), /4\. [^]*section `Code review`/);
});

for (const [file, step] of Object.entries(STEPS)) {
  test(`${file}: the review step follows the guide and no longer fixes everything the reviewer finds`, () => {
    const s = step();
    assert.ok(s.includes(GUIDE), 'names the guide');
    assert.match(s, /ne bloque que s'il est prouvé/);
    assert.match(s, /\{\{maxLoops\}\} tours/);
    assert.match(s, /rôle `review`/);
    assert.doesNotMatch(s, /Corrige ce qu'il trouve/);
  });
}

test('the reviewer and the fixer are both given the guide; the build escalation says how the problem was shown', () => {
  const b = STEPS['build.md']();
  assert.match(b, /dans sa consigne/);
  assert.match(b, /problèmes bloquants confirmés \(skill `receiving-code-review`/);
  assert.match(b, /en disant comment le problème a été démontré, mets `factory:blocked`/);
});

test('only the four reviews with rounds follow the guide', () => {
  const others = readdirSync(new URL('../agent/stages/', import.meta.url)).filter((f) => !(f in STEPS) && f !== 'code-review.md');
  for (const f of others) assert.ok(!read(`stages/${f}`).includes('code-review.md'), f);
  for (const f of Object.keys(STEPS)) assert.equal(read(`stages/${f}`).split(GUIDE).length - 1, 1, `${f}: named once, in the review step`);
  // A new project's first PR gets it through step 5 of build.md.
  assert.match(read('stages/foundation.md'), /\*\*Revue de code\*\* et \*\*passe design\*\* comme dans `\.factory\/stages\/build\.md` \(étapes 5 et 6/);
  // Out of scope: the security review still fixes everything; the first full read of a general review is untouched.
  assert.match(between('build.md', ' 5 bis.', ' 6. '), /Corrige ce qu'il trouve avec un test qui échoue d'abord/);
  assert.match(between('audit.md', ' 3. **Revue de code générale**', 'Puis une revue neuve des corrections'), /Fais corriger chaque point par des sous-agents du rôle `code`/);
  assert.match(guide(), /Il ne change rien à la première lecture de tout le code d'une review générale, à la revue de sécurité/);
});

test('AGENT.md names the rule, and the sync sends the guide to every project', () => {
  assert.match(read('AGENT.md'), /- Revue de code : un problème ne bloque que s'il est prouvé \(`stages\/code-review\.md`\) ; au plus \{\{maxLoops\}\} tours/);
  const dir = mkdtempSync(join(tmpdir(), 'proj-'));
  sync({ projectDir: dir });
  const sent = readFileSync(join(dir, GUIDE), 'utf8');
  assert.ok(!sent.includes('{{'));
  assert.match(sent, /Au plus 3 tours/);
});
```

- [ ] **Step 2: see it red.** Run `node --test test/proven-review.test.mjs` → `# pass 0`, `# fail 12` (the guide does not exist: `ENOENT … agent/stages/code-review.md`).

### Task 2: the guide, the four stages, AGENT.md

**Files:** Create `agent/stages/code-review.md`. Modify `agent/stages/build.md` (step 5, lines 73-78), `agent/stages/bugfix.md` (step 3, line 25), `agent/stages/skills-fix.md` (steps 1 and 4), `agent/stages/audit.md` (end of step 3, lines 28-29), `agent/AGENT.md` (line 59).

- [ ] **Step 1: create `agent/stages/code-review.md`** with this exact text (the tests pin its sentences; `{{maxLoops}}` is rendered by the sync):

```markdown
# Guide : la revue de code à tours (un problème ne bloque que s'il est prouvé)

Ce n'est pas une étape à part : `build.md` (étape 5, et par elle le socle d'un nouveau projet), `bugfix.md`
(étape 3), `skills-fix.md` (étape 1) et `audit.md` (la revue des corrections, à la fin de l'étape 3) t'envoient ici.
Ce guide ne vaut que pour ces quatre revues, celles qui ont la limite de {{maxLoops}} tours. Il ne change rien à la
première lecture de tout le code d'une review générale, à la revue de sécurité (tout ce qu'elle trouve reste corrigé)
ni aux relectures légères, sans tours ni escalade (correction de recette, retouche des captures, amélioration UI,
relecture de chaque tâche d'un grand plan).

Le relecteur reste un sous-agent neuf du rôle `review`, qui n'a pas écrit le code. Mets dans sa consigne qu'il lit ce
fichier et suit « Ce que rend le relecteur » ; mets dans celle du sous-agent du rôle `code` qui corrige qu'il suit
« Avant de corriger » et « Les simples remarques ». Ce guide prime sur les skills `requesting-code-review` et
`receiving-code-review` là où ils disent autre chose : leurs niveaux (Critical, Important, Minor) ne décident pas de
ce qui bloque.

## Ce que rend le relecteur

Deux listes : les **problèmes bloquants** et les **simples remarques**.

Un problème n'est bloquant que s'il est **prouvé** par une commande que le relecteur a lancée lui-même : un test qui
échoue, un petit script qui reproduit le défaut, ou une commande qui montre le mauvais comportement. Pour chaque
problème bloquant, il donne trois choses : la commande exacte, ce qu'elle a affiché, et ce qu'elle aurait dû afficher.
Une preuve fait tourner le code, les tests ou un contrôle du projet. Afficher un morceau de code (`cat`, `grep`,
`git diff`) est une lecture, pas une preuve.

Trois cas restent bloquants sans commande, parce qu'ils se constatent à la lecture :

- un problème de **sécurité ou de perte de données** qu'on ne peut pas démontrer sans toucher à du réel : le relecteur
  explique précisément le scénario (qui fait quoi, dans quel ordre, ce qui fuit ou se perd) ;
- un **écart avec la spec** qui se voit à la lecture, par exemple un critère d'acceptation qui n'est pas fait : il
  cite le critère ;
- un **écart avec une règle écrite** du projet ou de la factory : il cite la règle et l'endroit qui ne la respecte
  pas. Exemples : un test désactivé ou supprimé pour obtenir du vert, un service ou un compte ajouté sans l'accord du
  propriétaire, une couleur ou une police qui n'est pas dans `DESIGN.md`.

Tout le reste est une **simple remarque** : un problème sans ses trois éléments, un avis sur la qualité du code
(« ce serait plus propre autrement »). Une simple remarque ne bloque jamais, ne compte pas dans les tours et n'est
jamais remontée au propriétaire.

## Avant de corriger

L'agent qui corrige (skill `receiving-code-review`) ne croit pas le relecteur sur parole :

- **problème prouvé** : il relance lui-même la commande. Le problème est **confirmé** s'il se reproduit et si le
  résultat attendu par le relecteur est bien ce que demande la spec. Sinon il ne corrige rien : le problème devient
  une simple remarque ;
- **cas sans commande** : il vérifie à la lecture que le scénario tient, que le critère de la spec manque vraiment, ou
  que la règle citée n'est vraiment pas respectée. Sinon, simple remarque.

Il corrige les problèmes bloquants confirmés, puis relance les tests. Quand la preuve est un test qui échoue, ce test
reste dans le projet, dans le même commit que la correction : le défaut ne pourra pas revenir sans se voir.

## Les simples remarques

L'agent qui corrige les lit toutes. Il corrige tout de suite celles qui sont simples et qu'il a vérifiées lui-même
(un test oublié, un nom trompeur, un doublon), puis relance les tests, sans nouvelle revue. Les autres sont notées
dans la PR, sans suite.

## Les tours

- Un tour ne compte que si au moins un problème bloquant a été confirmé puis corrigé : une revue neuve (un nouveau
  sous-agent du rôle `review`) repart alors. Au plus {{maxLoops}} tours.
- Une revue sans problème bloquant confirmé termine l'étape, même s'il reste des remarques, y compris quand elle ne
  signale que des problèmes qui ne se reproduisent pas : aucun tour n'est compté.
- Si la revue qui suit le tour {{maxLoops}} a encore un problème bloquant confirmé : ne le corrige pas, escalade comme
  le dit l'étape (message simple sur l'issue, `factory:blocked`). Ce message dit en plus, en mots simples, comment le
  problème a été démontré : ce qui a été essayé, ce qu'on a vu, ce qu'on attendait, sans commande ni code.

## Dans la PR

La partie technique (en anglais) a une section `Code review` :

- `Blocking problems` : chaque problème bloquant confirmé, avec sa commande, ce qu'elle a affiché et ce qu'elle
  aurait dû afficher (pour un cas sans commande : le scénario, le critère de la spec, ou la règle citée et l'endroit),
  puis ce qui l'a corrigé ; `none` s'il n'y en avait pas ;
- `Remarks` : chaque simple remarque, avec `fixed` ou `not fixed`, les problèmes non reproduits compris ; `none` s'il
  n'y en avait pas.
```

- [ ] **Step 2: `agent/stages/build.md`, step 5.** Keep its first two lines. Replace from « relit le diff contre la spec… » to « …`factory:blocked` et termine. » with:

```markdown
   relit le diff contre la spec et les standards du dépôt, en suivant `.factory/stages/code-review.md` (mets-le dans
   sa consigne) : un problème ne bloque que s'il est prouvé, le reste est une simple remarque. Fais vérifier puis
   corriger les problèmes bloquants confirmés (skill `receiving-code-review`, même guide dans la consigne), puis
   relance une revue neuve. Au plus {{maxLoops}} tours, comptés comme le dit le guide.
   S'il reste un problème bloquant confirmé après le dernier tour : ouvre quand même la PR en brouillon, explique le
   blocage au propriétaire en langage simple sur l'issue, en disant comment le problème a été démontré, mets
   `factory:blocked` et termine.
```

- [ ] **Step 3: `agent/stages/bugfix.md`, step 3.** Replace `au plus {{maxLoops}} tours). Si l'interface change :` with:

```markdown
au plus {{maxLoops}} tours, en suivant `.factory/stages/code-review.md` : un problème ne bloque que s'il est prouvé). Si l'interface change :
```

- [ ] **Step 4: `agent/stages/skills-fix.md`.** In step 1, replace its last two lines (from « `requesting-code-review`), contre la spec… » to « Au plus {{maxLoops}} tours. ») with:

```markdown
   `requesting-code-review`), contre la spec et les standards du dépôt, en suivant `.factory/stages/code-review.md`
   (mets-le dans sa consigne) : un problème ne bloque que s'il est prouvé. Fais vérifier puis corriger les problèmes
   bloquants confirmés (skill `receiving-code-review`, même guide), puis une revue neuve. Au plus {{maxLoops}} tours.
```

  In step 4, replace its second line (« `design-pass.md`, une ligne par correction de revue). ») with:

```markdown
   `design-pass.md` ; pour la revue, la section `Code review` du guide, dans la partie technique).
```

- [ ] **Step 5: `agent/stages/audit.md`, end of step 3.** Replace the last line of step 3 (« neuve des corrections par un sous-agent du rôle `review`, au plus {{maxLoops}} tours. ») with:

```markdown
   neuve des corrections par un sous-agent du rôle `review`, au plus {{maxLoops}} tours, en suivant
   `.factory/stages/code-review.md` : un problème ne bloque que s'il est prouvé (cette revue des corrections
   seulement, pas les relectures partie par partie ni leur synthèse).
```

- [ ] **Step 6: `agent/AGENT.md`, line 59.** Replace the « Revue de code » bullet with:

```markdown
- Revue de code : un problème ne bloque que s'il est prouvé (`stages/code-review.md`) ; au plus {{maxLoops}} tours
  entre le développeur et le relecteur, ensuite escalade.
```

- [ ] **Step 7: green.** `node --test test/proven-review.test.mjs` → `# pass 12`, `# fail 0`. Then `npm test` → `# tests 1752`, `# fail 0`; `npm run lint` and `npm run typecheck` pass. `git status --short` shows only the six `agent/` files, the test, this plan and `.factory/journal/` (nothing else under `.factory/`, nothing under `.claude/` nor `packs/`).

- [ ] **Step 8: commit.**

```bash
git add test/proven-review.test.mjs docs/plans/issue-604.md agent/AGENT.md agent/stages/code-review.md agent/stages/build.md agent/stages/bugfix.md agent/stages/skills-fix.md agent/stages/audit.md .factory/journal
git commit -m "feat(agent): a code-review problem blocks only when it is proven (#604)"
```

## Spec coverage

| Spec | Where |
| --- | --- |
| Proof = a command the reviewer ran; command, output, expected output; reading code is not a proof | guide « Ce que rend le relecteur » |
| Three cases blocking without a command | same section |
| The fixer re-runs the command; not reproduced, or expectation not in the spec → remark; failing-test proof kept | guide « Avant de corriger » |
| Simple verified remarks fixed right away, tests re-run, no new review; the others noted in the PR | guide « Les simples remarques » |
| A round counts only after a confirmed then fixed blocking problem; a review without one ends the step; the escalation says how the problem was shown | guide « Les tours », `build.md` step 5 |
| PR technical part lists the proven problems with their command, and the remarks | guide « Dans la PR », `skills-fix.md` step 4 |
| Four reviews only; same rule in every project after its usual update | the four stage edits, scope test, sync test |
