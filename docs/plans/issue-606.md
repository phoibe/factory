# Scope check (« vérification de portée ») before the final review of a sensitive change (issue #606) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are sequential (1 → 3).

**Goal:** Before the final review of a change that touches a sensitive subject or stock-market orders, a fresh sub-agent of role `review` looks for what the change can break outside the modified files and proves the fact that makes it safe; the PR summary says « Portée vérifiée : … », or « Portée non prouvée : … » and then waits for the owner's « ok ».

**Architecture:** Instructions only. A new step in `agent/stages/build.md` (4 ter) holds the whole rule; `bugfix.md` (2 bis) and `acceptance-fix.md` (2 bis) point to it; `resume.md` says what the owner's answer does. One on-screen sentence changes (`MODEL_ROLES` help of `review`, read by the panel as-is). No script, no lock, no setting, no relay change: the stop-and-ask reuses `factory:blocked` and the existing `resume` stage.

**Tech Stack:** Markdown instructions (French, « tu »), Node 22 ESM, `node --test`, Playwright e2e. No dependency.

**Spec:** issue #606, last `<!-- factory-spec -->` comment (« Spec (version 1) » ; the pilot saves it to `docs/specs/`, not this plan). Decisions: `docs/adr/0022`, `0023`, `0024`. Terms: `GLOSSARY.md`, « Vérification de portée ».

## Global Constraints

- « Sujet sensible » is exactly the security review's list: `connexion, codes, comptes, données personnelles, argent, partage, suppression de données`. « Toucher aux ordres de bourse »: what sends, modifies or cancels an order, or decides what is sent (quantities, prices, timing, positions, and the data those computations read). Judged on what the change really modifies, not on the title. No per-project setting.
- Sub-agent: role `review`, description `[role:review] Vérification de portée`, fresh, did not write the code. Once per build; never anything real touched.
- Summary lines, verbatim: `« Portée vérifiée : … »`, `« Portée non prouvée : … »`. « Essayé en vrai » / « Pas vérifié en vrai », the security review (step 5 bis, features only) and every other step keep their text.
- Role help, verbatim (typographic `’`): `Relecture finale du code avant chaque PR, vérification de portée, revue de sécurité, synthèse d’une review générale.`
- No automated check may ask for the line: `agent/scripts/*.mjs` (lock, journal) are not touched. `visual-fix.md`, `fix-checks.md`, `audit.md`, `ui-polish.md`, `foundation.md` are not touched.
- Edit sources only (`agent/`, `scripts/`, tests). **Never edit `.factory/` nor `.claude/skills/`, and do not run `scripts/sync.mjs`**: the `sync.yml` workflow regenerates `.factory/` after the merge; no test compares `.factory/` with `agent/`. pstack is not installed.
- Already merged in #609, check only, do not edit: `GLOSSARY.md` (5 terms), ADR 0022 to 0024. Checked, nothing to change: `README.md` (its diagram names no review step), `PRODUCT.md` (« trois moments » stays: ADR 0024 records the rare extra stop), `DESIGN.md`, `docs/design.md`. `docs/specs/544-….md` quotes the old sentence and is never rewritten (the pilot runs `specs.mjs modified 544 606` at step 6 ter).
- TDD: each test below is written and seen red before the wording. Stage wording is copied **verbatim** from this plan (the tests match it after removing `**` and collapsing spaces; re-wrapping lines is free). Agent-facing text French « tu », quoted owner-facing sentences « vous », code/comments/commits English. Every commit also adds `.factory/journal`.

## Review Focus

- A fix pushed during the recette: the relay sends a PR labelled `factory:acceptance` to the checks as soon as code arrives (`scripts/lib/decide.mjs:106`). An unproved scope there must put `factory:blocked` on the PR and remove `factory:acceptance` **before** the push (task 2, relay pin test + `acceptance-fix.md` wording).
- A run that targeted the PR and ends with the PR at no step and not blocked: the relay adds `factory:checks` itself (`decide.mjs:154`). After a « non, regardez X » in recette, `factory:blocked` must be back on the PR before the run ends (task 2, relay pin test + `resume.md` wording).
- Build or bugfix: the PR is opened with no label, so a comment written on the PR is ignored (« PR hors factory »). The question is on the issue, `factory:blocked` on the issue only (two labels would show two cards), and the sentence says « ici » (task 2, « Répondez « ok » ici »).
- A display request that ends up changing an order computation, or a bug with no sheet: the trigger is the real diff / the bug analysis (task 2 tests on both wordings).
- The sub-agent « proves » by starting the app on production settings: forbidden in the wording (task 2 test, « réglages de production »).
- The longer help sentence on a phone: the existing journey « sur téléphone la page tient sur une colonne » (390 px, no horizontal scroll) must stay green unchanged (task 3).

---

### Task 1: the « Revue » role names the scope check

**Files:** Modify `scripts/lib/models.mjs:21`, `test/models.test.mjs`, `e2e/general-settings.e2e.mjs`. No change in `panel/` (it renders `MODEL_ROLES[].help`).

- [ ] **Step 1: failing unit test**, at the end of `test/models.test.mjs`:

```js
test('the help of the review role names the scope check (issue #606)', () => {
  assert.equal(MODEL_ROLES.find((r) => r.id === 'review').help, 'Relecture finale du code avant chaque PR, vérification de portée, revue de sécurité, synthèse d’une review générale.');
});
```

- [ ] **Step 2: failing journey**, at the end of `e2e/general-settings.e2e.mjs` (spec, « Comment vérifier » 1):

```js
// Issue #606: the « Revue » role also does the scope check (the only on-screen change of that request).
test('sous le rôle Revue, je lis qu\'il fait aussi la vérification de portée', async () => {
  await withPanel({}, async ({ page, url }) => {
    await openPage(page, url);
    assert.equal((await page.locator('#model-review-help').textContent()).trim(), 'Relecture finale du code avant chaque PR, vérification de portée, revue de sécurité, synthèse d’une review générale.');
    assert.equal(await page.locator('#model-review').getAttribute('aria-describedby'), 'model-review-help');
  });
});
```

- [ ] **Step 3: red.** `node --test test/models.test.mjs` → 1 fail (old sentence). `node --test --test-name-pattern="vérification de portée" e2e/general-settings.e2e.mjs` → 1 fail (`npm ci` first if `node_modules/playwright` is missing; the cloud Chromium in `/opt/pw-browsers` is found by itself).
- [ ] **Step 4:** in `scripts/lib/models.mjs`, the `review` entry's `help` becomes the verbatim sentence above. Nothing else on the line.
- [ ] **Step 5: green.** Same two commands → 0 fail.
- [ ] **Step 6: commit** `feat(panel): the Revue role help names the scope check (#606)` (`scripts/lib/models.mjs test/models.test.mjs e2e/general-settings.e2e.mjs .factory/journal`).

### Task 2: the scope check in the agent's instructions

**Files:** Create `test/scope-check.test.mjs`. Modify `test/decide.test.mjs`, `agent/stages/build.md`, `agent/stages/bugfix.md`, `agent/stages/acceptance-fix.md`, `agent/stages/resume.md`, `agent/AGENT.md:90`.

- [ ] **Step 1: failing test** `test/scope-check.test.mjs`, verbatim:

```js
// Issue #606: before the final review of a change that touches a sensitive subject or stock-market orders, a fresh
// `review` sub-agent looks for what the change can break outside the modified files and proves the fact that makes it
// safe (« vérification de portée »). An instruction only: no script reads the « Portée vérifiée » line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../agent/${f}`, import.meta.url), 'utf8');
const flat = (f) => read(f).replace(/\*\*/g, '').replace(/\s+/g, ' ');
const between = (text, from, to) => { const a = text.indexOf(from); const b = text.indexOf(to); return a >= 0 && b > a ? text.slice(a, b) : ''; };
const has = (text, list) => { for (const s of list) assert.ok(text.includes(s), s); };
const SENSITIVE = 'connexion, codes, comptes, données personnelles, argent, partage, suppression de données';
const AGENT = 'sous-agent neuf du rôle `review` (description `[role:review] Vérification de portée`)';
const build = flat('stages/build.md');
const step = between(build, '4 ter. Vérification de portée', '5. Revue de code');

test('build: the scope check comes after the code and its journeys, before the final review; the security review stays after', () => {
  const at = (s) => build.indexOf(s);
  assert.ok(step, 'step 4 ter exists');
  assert.ok(at('4 bis. Parcours rejoués') < at('4 ter. Vérification de portée') && at('5. Revue de code') < at('5 bis. Revue de sécurité'));
  has(step, ['avant la relecture finale (étape 5)']);
});

test('build: only for a sensitive subject (the list of the security review) or stock-market orders, judged on the real change', () => {
  assert.equal(build.split(SENSITIVE).length - 1, 2, 'the same list in steps 4 ter and 5 bis');
  has(step, [SENSITIVE, 'ordres de bourse', 'envoie, modifie ou annule un ordre', 'quantités, prix, moment, positions, et les données que ces calculs lisent',
    "d'après ce que le diff modifie réellement, pas d'après le titre de la demande", "une retouche d'affichage ou de texte ne l'est pas",
    'change le design ou la vision', 'Aucun réglage par projet', 'Demande non concernée : saute cette étape']);
});

test('build: a fresh review sub-agent looks outside the modified files and proves one precise fact, touching nothing real', () => {
  has(step, [`${AGENT}, qui n'a pas écrit le code`, 'en dehors des fichiers modifiés', 'les autres endroits qui se servent du code touché',
    'les fichiers et données partagés', 'les écrans qui affichent la même information', 'les tâches planifiées qui lisent ce qui a changé',
    'fait précis', 'une commande qui fait tourner le vrai code ou un test', 'affirmer ne prouve rien', 'reste dans le projet',
    'rien de réel', 'aucun ordre envoyé, aucune vraie donnée modifiée', 'réglages de production',
    "test qui échoue d'abord, avant la relecture finale", "ne se fait qu'une fois"]);
});

test('build: the PR summary says « Portée vérifiée », the technical part gives the fact, the command and its result', () => {
  has(step, ['« Portée vérifiée : … »', 'en français simple', 'Une casse trouvée et corrigée : la ligne le dit', 'elle le dit en une phrase',
    'tout en bas : le fait prouvé, la commande lancée et son résultat', '« Essayé en vrai » et « Pas vérifié en vrai » ne changent pas']);
});

test('build: a fact that cannot be proved opens the PR, asks the owner and never sends it to the checks', () => {
  has(step, ['« Portée non prouvée : … »', 'ce qui reste à regarder', 'ne mets pas `factory:checks` sur la PR', 'Répondez « ok » ici',
    "`factory:blocked` sur l'issue (pas sur la PR)", '`resume.md`']);
  assert.match(between(build, '9. Captures', "10. L'issue garde"), /Portée non prouvée \(étape 4 ter\) : pas de `factory:checks`/);
});

test('bugfix: the same check after the fix and its test, before the review, judged from the analysis', () => {
  const bug = flat('stages/bugfix.md');
  const s = between(bug, '2 bis. Vérification de portée', '3. Revue par un sous-agent neuf');
  assert.ok(s && bug.indexOf('2. Branche') < bug.indexOf('2 bis. Vérification de portée'), 'step 2 bis sits between the fix and the review');
  has(s, ['sujet sensible ou aux ordres de bourse', "d'après l'analyse de l'étape 1", 'ce que la correction modifie réellement', 'étape 4 ter de `build.md`', AGENT,
    '« Portée vérifiée : … »', '« Portée non prouvée : … »', 'sans `factory:checks`', '`factory:blocked`', 'Les autres corrections de bugs ne changent pas']);
  assert.match(bug.slice(bug.indexOf('4. PR avec résumé')), /Portée non prouvée \(étape 2 bis\) : pas de `factory:checks`/);
});

test('acceptance fix: the check is redone on a fix that changes code, before pushing, and the line is updated', () => {
  const fix = flat('stages/acceptance-fix.md');
  const s = between(fix, '2 bis. Vérification de portée', '3. Corrige (TDD si actif)');
  has(s, ['modifie du code', '« Portée vérifiée » ou « Portée non prouvée »', 'étape 4 ter de `build.md`', 'sous-agent neuf du rôle `review`, description `[role:review] Vérification de portée`', 'avant de pousser',
    'mets à jour la ligne « Portée vérifiée : … » de la description de la PR', 'sans toucher au reste de la description',
    'retire `factory:acceptance` de la PR et mets-y `factory:blocked`', '« Portée non prouvée : … »', 'ne mets pas `factory:checks`']);
});

test('resume: « ok » sends the waiting PR to the checks, anything else keeps it blocked', () => {
  const s = between(flat('stages/resume.md'), 'Portée non prouvée (ton message de blocage', 'Si le blocage venait des contrôles automatiques');
  assert.match(s, /il répond « ok » : mets `factory:checks` sur la PR/);
  has(s, ['vérification de portée refaite sur ce changement', "remets `factory:blocked` là où il était (l'issue, ou la PR si la question y était), toujours sans `factory:checks`"]);
});

test('nowhere else: no other stage does the scope check, and no script asks for the line', () => {
  const stages = readdirSync(new URL('../agent/stages/', import.meta.url));
  assert.ok(stages.length > 15);
  for (const f of stages.filter((n) => !['build.md', 'bugfix.md', 'acceptance-fix.md', 'resume.md'].includes(n))) {
    assert.doesNotMatch(read(`stages/${f}`), /vérification de portée|Portée (vérifiée|non prouvée)/i, f);
  }
  for (const f of readdirSync(new URL('../agent/scripts/', import.meta.url))) assert.doesNotMatch(read(`scripts/${f}`), /Portée/, f);
  has(step, ['ni après une retouche des captures, ni après une correction des contrôles automatiques, ni pendant une review générale, une amélioration UI ou le socle',
    'Aucun contrôle automatique ne réclame ces lignes']);
});

test('AGENT.md: the review role lists the scope check', () => {
  const row = read('AGENT.md').split('\n').find((l) => l.startsWith('| `review`'));
  assert.match(row, /relecture finale du code avant la PR, vérification de portée, revue de sécurité, synthèse d'une review générale et relecture de ses corrections/);
});
```

- [ ] **Step 2: relay pin test**, in `test/decide.test.mjs` right after « an agent run that leaves an open PR at no step sends it back to the checks ». It passes at once (no relay change): it pins the rules the wording relies on.

```js
// Issue #606: a PR that waits for the owner's « ok » after an unproved scope check. These are the relay rules the
// wording of build.md, acceptance-fix.md and resume.md relies on: nothing sends such a PR to the checks by itself.
test('a PR waiting for the owner after an unproved scope check is not sent to the checks by itself', () => {
  const type = (e) => decide(e, config, ctx).type;
  assert.equal(type(pr({ event: 'pull_request', action: 'opened', labels: [] })), 'ignore'); // build, bugfix: opened without factory:checks
  assert.equal(type(pr({ event: 'pull_request', action: 'synchronize', labels: [L.running, L.blocked] })), 'ignore'); // recette: blocked before the push
  assert.equal(type(pr({ event: 'pull_request', action: 'synchronize', labels: [L.running, L.acceptance] })), 'checks'); // why factory:acceptance goes first
  assert.equal(type(pr({ event: 'pull_request', action: 'unlabeled', removedLabel: L.running, open: true, labels: [L.blocked] })), 'ignore');
  assert.equal(type(pr({ event: 'pull_request', action: 'unlabeled', removedLabel: L.running, open: true, labels: [] })), 'checks'); // why factory:blocked is put back before the run ends
  for (const e of [pr({ labels: [L.blocked], text: 'ok' }), ev({ labels: [L.feature, L.building, L.blocked], text: 'ok' }), ev({ labels: [L.bug, L.building, L.blocked], text: 'regardez aussi la tâche de nuit' })]) {
    assert.deepEqual([decide(e, config, ctx).type, decide(e, config, ctx).stage], ['fire', 'resume']);
  }
});
```

- [ ] **Step 3: red.** `node --test test/scope-check.test.mjs` → 10 fail. `node --test test/decide.test.mjs` → 0 fail.
- [ ] **Step 4: `agent/stages/build.md`.** Insert this step between step 4 bis and the line `5. **Revue de code** (si active)…`:

```markdown
4 ter. **Vérification de portée**, seulement si le changement touche à un **sujet sensible** (connexion, codes, comptes,
   données personnelles, argent, partage, suppression de données : la liste de l'étape 5 bis) ou aux **ordres de
   bourse** : il modifie ce qui envoie, modifie ou annule un ordre, ou ce qui décide de ce qui est envoyé (quantités,
   prix, moment, positions, et les données que ces calculs lisent). Juges-en d'après la spec et d'après ce que le diff
   modifie réellement, pas d'après le titre de la demande : une demande d'affichage qui finit par modifier un calcul
   d'ordre est concernée ; une retouche d'affichage ou de texte ne l'est pas, ni une spec validée seulement parce
   qu'elle change le design ou la vision. Aucun réglage par projet. Demande non concernée : saute cette étape, sans
   rien ajouter au résumé.
   Une fois le code et ses tests écrits, avant la relecture finale (étape 5), lance un **sous-agent neuf** du rôle
   `review` (description `[role:review] Vérification de portée`), qui n'a pas écrit le code. Sa consigne :
   - chercher ce que le changement peut casser **en dehors des fichiers modifiés** : les autres endroits qui se
     servent du code touché, les fichiers et données partagés, les écrans qui affichent la même information, les
     tâches planifiées qui lisent ce qui a changé ;
   - dire le **fait précis** qui rend le changement sûr (par exemple « aucun autre endroit ne donne une valeur vide à
     ce calcul ») et le **prouver** par une commande qui fait tourner le vrai code ou un test : montrer un morceau de
     code ou affirmer ne prouve rien. Un test qui sert de preuve reste dans le projet, avec les autres tests ;
   - ne toucher à **rien de réel** : aucun ordre envoyé, aucune vraie donnée modifiée, jamais l'appli lancée avec les
     réglages de production ;
   - te rendre le fait, la commande lancée et son résultat, les endroits regardés, et chaque casse trouvée avec la
     commande qui la montre. Il ne corrige rien lui-même.
   **Casse trouvée** : fais-la corriger par un sous-agent du rôle `code`, avec un test qui échoue d'abord, avant la
   relecture finale. La vérification ne se fait qu'une fois : c'est la relecture finale qui relit cette correction.
   **Résumé de la PR** (étape 8) : une ligne en français simple **« Portée vérifiée : … »**, qui dit ce qui a été
   regardé autour du changement et le fait prouvé (ex. « Portée vérifiée : les trois autres endroits qui utilisent le
   calcul de quantité lui donnent toujours un nombre positif (prouvé par un test) ; l'écran Historique et la tâche de
   nuit lisent la même donnée et l'affichent encore correctement. »). Une casse trouvée et corrigée : la ligne le dit.
   Rien d'autre dans le projet ne se sert de ce qui a changé : elle le dit en une phrase. Dans la partie technique, tout
   en bas : le fait prouvé, la commande lancée et son résultat. Les lignes « Essayé en vrai » et « Pas vérifié en
   vrai » ne changent pas.
   **Fait impossible à prouver sans toucher à du réel** (il faudrait, par exemple, envoyer un vrai ordre) : le
   sous-agent va aussi loin que possible sans rien toucher de réel, et la ligne du résumé devient **« Portée non
   prouvée : … »**, avec ce qui reste à regarder. Fais la suite normalement jusqu'à la PR ouverte (étapes 5 à 8, et les
   captures de l'étape 9), puis arrête-toi : ne mets pas `factory:checks` sur la PR. Écris sur l'issue ce qui n'a pas
   pu être prouvé et pourquoi, avec le lien de la PR, et termine par « Répondez « ok » ici pour que la modification
   parte vers les contrôles automatiques, ou dites-moi ce qu'il faut regarder ou changer. » ; mets `factory:blocked`
   sur l'issue (pas sur la PR) et termine. Rien ne part vers les contrôles ni vers l'intégration sans son « ok » ; la
   suite est dans `resume.md`.
   Pas de vérification de portée ailleurs que dans `build.md`, `bugfix.md` et `acceptance-fix.md` : ni après une
   retouche des captures, ni après une correction des contrôles automatiques, ni pendant une review générale, une
   amélioration UI ou le socle d'un projet. Aucun contrôle automatique ne réclame ces lignes.
```

  And at the end of step 9, right after its line « Sinon, mets directement `factory:checks` sur la PR. », add this line (3 spaces of indent):

```markdown
   **Portée non prouvée** (étape 4 ter) : pas de `factory:checks`, arrête-toi comme elle le dit.
```

- [ ] **Step 5: `agent/stages/bugfix.md`.** Insert between step 2 and `3. Revue par un sous-agent neuf…`:

```markdown
2 bis. **Vérification de portée**, seulement si la correction touche à un sujet sensible ou aux ordres de bourse
   (critères de l'étape 4 ter de `build.md`). Un bug n'a pas de fiche : juges-en d'après l'analyse de l'étape 1 et
   d'après ce que la correction modifie réellement. Après la correction et son test, avant la revue de l'étape 3, suis
   l'étape 4 ter de `build.md` : sous-agent neuf du rôle `review` (description `[role:review] Vérification de portée`),
   fait prouvé par une commande, rien de réel touché, casse corrigée avec un test qui échoue d'abord, une seule fois.
   Le résumé de la PR contient la ligne « Portée vérifiée : … » et, tout en bas, le fait prouvé, la commande et son
   résultat. Fait impossible à prouver : « Portée non prouvée : … », PR ouverte sans `factory:checks`, question sur
   l'issue et `factory:blocked`, comme à l'étape 4 ter : une correction de bug est fusionnée sans recette, elle ne part
   donc jamais sans son « ok ». Les autres corrections de bugs ne changent pas.
```

  And at the end of step 4, right after « les contrôles passent : pas de recette pour un bug. », add this line (3 spaces of indent):

```markdown
   **Portée non prouvée** (étape 2 bis) : pas de `factory:checks`.
```

- [ ] **Step 6: `agent/stages/acceptance-fix.md`.** Insert between step 2 and `3. Corrige (TDD si actif)…`:

```markdown
2 bis. **Vérification de portée**, seulement si ta correction modifie du code et que la demande est concernée : la
   description de la PR a une ligne « Portée vérifiée » ou « Portée non prouvée », ou la correction touche elle-même à
   un sujet sensible ou aux ordres de bourse (critères de l'étape 4 ter de `build.md`). Elle se fait pendant l'étape 3,
   après la correction et ses tests, avant la revue et **avant de pousser** : refais-la sur cette correction comme à
   l'étape 4 ter de `build.md` (sous-agent neuf du rôle `review`, description `[role:review] Vérification de portée`),
   puis mets à jour la ligne « Portée vérifiée : … » de la description de la PR et, tout en bas, le fait prouvé, la
   commande et son résultat, sans toucher au reste de la description.
   **Fait impossible à prouver sans toucher à du réel** : avant de pousser, retire `factory:acceptance` de la PR et
   mets-y `factory:blocked` (sinon la factory relance d'elle-même les contrôles dès que du code arrive pendant la
   recette). Pousse, remplace la ligne par « Portée non prouvée : … », demande son accord sur la PR (même message qu'à
   l'étape 4 ter de `build.md`), ne mets pas `factory:checks` et termine : l'étape 4 ne s'applique pas.
```

- [ ] **Step 7: `agent/stages/resume.md`.** Insert this paragraph, followed by an empty line, just before `Si le blocage venait des contrôles automatiques…`:

```markdown
**Portée non prouvée** (ton message de blocage demandait son accord, étape 4 ter de `build.md` : la PR est ouverte,
sans `factory:checks`) :
- il répond « ok » : mets `factory:checks` sur la PR et finis l'étape interrompue (le message de l'étape 10 de
  `build.md` pour une feature). Ne refais ni la vérification ni les relectures : le code n'a pas changé.
- sinon, il dit quoi regarder ou changer : fais-le. Si le code change : test qui échoue d'abord, vérification de portée
  refaite sur ce changement, relecture, push, ligne du résumé mise à jour. Le fait est maintenant prouvé (la ligne
  redevient « Portée vérifiée : … ») : mets `factory:checks` sur la PR. Toujours pas : redemande son accord et, avant
  de terminer, remets `factory:blocked` là où il était (l'issue, ou la PR si la question y était), toujours sans
  `factory:checks`.
```

- [ ] **Step 8: `agent/AGENT.md`**, « Modèles par rôle » table, `review` row: `relecture finale du code avant la PR, revue de sécurité, …` becomes `relecture finale du code avant la PR, vérification de portée, revue de sécurité, synthèse d'une review générale et relecture de ses corrections`. Nothing else in the row.
- [ ] **Step 9: green.** `node --test test/scope-check.test.mjs` → 10 pass. Then the tests that scan the instructions: `node --test test/model-grid.test.mjs test/vouvoiement.test.mjs test/no-empty-review.test.mjs test/real-check.test.mjs test/sync.test.mjs test/stack-neutral.test.mjs test/issue-language.test.mjs test/upstream.test.mjs` → 0 fail.
- [ ] **Step 10: commit** `feat(agent): scope check before the final review of a sensitive change (#606)` (the five `agent/` files, the two tests, `.factory/journal`).

### Task 3: final verification and fixes from the final review

- [ ] `npm test` → 0 fail, 1752 pass (1740 before + 12). `npm run lint`, `npm run typecheck`, `npm run build` → exit 0.
- [ ] `npm run test:e2e` and `npm run test:a11y` → 0 fail, the phone journey of « Réglages généraux » included.
- [ ] `git status --short` → nothing under `.factory/` except `.factory/journal/`, nothing under `.claude/`. `git diff --stat origin/main...HEAD` → only: `agent/AGENT.md`, the four stage files, `scripts/lib/models.mjs`, `test/scope-check.test.mjs`, `test/decide.test.mjs`, `test/models.test.mjs`, `e2e/general-settings.e2e.mjs`, this plan, the journal.
- [ ] For each finding accepted from the final review: failing test first, fix, green; then this whole task again.
