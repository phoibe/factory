# A model role for the part-by-part reviews of a general review (issue #570) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one go. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are sequential (1 → 3).

**Goal:** A fifth row « Relectures d'une review générale » in « Réglages généraux » → « Modèles » picks the engine of the part-by-part reviewers of a general review (stage `audit`), on Opus by default, without touching the engine that writes code.

**Architecture:** One new entry `audit` in `MODEL_ROLES` (`scripts/lib/models.mjs`), between `review` and `simple`. Everything that enumerates roles derives from that array: the panel page (`renderGeneral`/`saveGeneral` in `panel/app.mjs` map over `MODEL_ROLES`) and the relay payload (`resolveModels` in `scripts/relay/launches.mjs`) — **no code change expected in `panel/` nor `scripts/relay/`**, only tests. The two hand-written enumerations are the journal's `ROLE_TAG` regex (`agent/scripts/journal.mjs`) and the agent instructions (`agent/AGENT.md` table, `agent/stages/audit.md` step 3).

**Tech Stack:** Node 22 ESM, `node --test`, no-build vanilla panel, Playwright e2e. No new dependency.

**Spec:** issue #570, last `<!-- factory-spec -->` comment (« Spec (version 1) »; the build saves it to `docs/specs/`, not this plan). Decision: `docs/adr/0017-…md`.

## Global Constraints

- Role key: `audit` (payload `models.audit`, tag `[role:audit]`, DOM id `model-audit`). Name: `Relectures d’une review générale`. Help, verbatim: `Relit le code de chaque partie de l’appli pendant une review générale. La synthèse reste faite par « Revue ».` (typographic `’` as in the other strings of `models.mjs`, plain spaces inside « »). Default `opus`, effort `high` (fixed, no effort selector). Order of the page: plan, code, review, **audit**, simple.
- The names, help texts, defaults and efforts of the four other roles do not change, nor the grey « L’agent qui pilote… » paragraph.
- `audit` drives ONLY the part-by-part reviewers of step 3 of `agent/stages/audit.md`, including the single reviewer of a small app reviewed in one block. Synthesis and review of the fixes: `review`. Fixes: `code`. Task reviews of a build, design critique, ui-polish: still `code`. Final review, security review: still `review`.
- A part reviewer that fails twice is relaunched on `review`. The chain « tâches simples → code → revue » is otherwise unchanged.
- A saved engine that is no longer offered → Opus. Nothing saved → Opus. A role left on its default is not written to `settings.json` (existing rule).
- `ROLE_DEFAULTS` (journal), `upstream.mjs`, `fabrication.mjs`, `gate.mjs`: unchanged (the upstream proof stays `plan`/`review`; « Sous-agents » counts per engine from `model`, whatever the role).
- Edit sources only (`agent/`, `scripts/`, tests). **Never edit `.factory/` nor `.claude/skills/`, and do not run `scripts/sync.mjs`**: the `sync.yml` workflow commits « chore(factory): sync skills and agent instructions » after the merge (as for #559, whose PR touched only `agent/`).
- `GLOSSARY.md` (« Review générale », « Relecture partie par partie », « cinq types ») and ADR 0017 are already merged: check, do not edit.
- TDD: every test below is written and seen red before its implementation. Owner-facing text French (vouvoiement), agent-facing text French « tu », code/comments/commits English.

## Review Focus

- `settings.json` saved before this delivery (no `models.audit`): the new row shows Opus, the four others keep their saved engine, and saving another row does not add `audit` (task 1: unit + the existing e2e « un modèle changé est enregistré… » must stay green unchanged).
- `models.audit` saved with an engine no longer in the list (`'gpt'`, or `fable` removed from the families) → `opus` (task 1 unit test).
- A run whose payload has `models` but no `audit` entry (in-flight launch, `extra` override): AGENT.md must say to take the table's default for a missing role (task 3 test).
- The owner's journal: a reviewer launched `[role:audit] …` must be recorded with `role: 'audit'` and its label without the tag, else « Sous-agents » shows the raw tag (task 2 test).
- Scope creep: no other stage file may send work to the `audit` role (task 3 test over every `agent/stages/*.md`).

---

### Task 1: the role in the catalog, the payload and the settings page

**Files:** Modify `scripts/lib/models.mjs` (line 16 comment, `MODEL_ROLES`, `resolveModels` comment), `test/models.test.mjs`, `test/relay-models.test.mjs`, `e2e/general-settings.e2e.mjs`, `DESIGN.md` (« Réglages généraux (page à part) »).

**Interfaces — Produces:** `MODEL_ROLES[3] = { id: 'audit', name: 'Relectures d’une review générale', help: <verbatim above>, effort: 'high', default: 'opus' }`; `resolveModels(raw)` → `{ plan, code, review, audit, simple }`, `audit` = `{ model: 'opus', effort: 'high' }` by default.

- [ ] **Step 1: failing unit tests.** In `test/models.test.mjs`: add `audit: { model: 'opus', effort: 'high' }` to `defaults`; rename the role test to « five roles in order… » and expect ids `['plan', 'code', 'review', 'audit', 'simple']` and names `[…, 'Revue', 'Relectures d’une review générale', 'Tâches simples']`; add:

```js
test('the general-review role: Opus and high effort by default, its own saved engine, Opus when it is gone (issue #570)', () => {
  const role = MODEL_ROLES.find((r) => r.id === 'audit');
  assert.equal(role.help, 'Relit le code de chaque partie de l’appli pendant une review générale. La synthèse reste faite par « Revue ».');
  assert.deepEqual(resolveModels({ models: { code: 'sonnet' } }).audit, { model: 'opus', effort: 'high' }, 'does not follow the code role');
  assert.deepEqual(resolveModels({ models: { review: 'haiku' } }).audit, { model: 'opus', effort: 'high' }, 'does not follow the review role');
  const r = resolveModels({ models: { audit: 'fable' } });
  assert.deepEqual(r.audit, { model: 'fable', effort: 'high' });
  assert.deepEqual({ ...r, audit: defaults.audit }, defaults, 'the other roles keep their default');
  assert.equal(resolveModels({ models: { audit: 'gpt' } }).audit.model, 'opus');
  assert.equal(roleModel({ models: { audit: 'fable' } }, 'audit', MODEL_FAMILIES.filter((f) => f.id !== 'fable')), 'opus');
});
```

  In `test/relay-models.test.mjs`, inside the `for (const runner …)` loop: in the first test add `assert.deepEqual(models.audit, { model: 'opus', effort: 'high' });`, and add a test `${runner}: the payload carries the engine saved for the general-review reviews` with settings `b64({ models: { audit: 'fable' } })` asserting `models.audit` deep-equals `{ model: 'fable', effort: 'high' }` and `Object.keys(models)` deep-equals `['plan', 'code', 'review', 'audit', 'simple']`.

- [ ] **Step 2: failing e2e tests** in `e2e/general-settings.e2e.mjs` (one per check of the spec):
  - `roles` = the five names in order; the defaults test becomes « …Fable, Opus, Fable, Opus, Sonnet par défaut… » with `['fable', 'opus', 'fable', 'opus', 'sonnet']`; « les choix enregistrés… » saves `{ plan: 'opus', code: 'haiku', review: 'sonnet', audit: 'haiku', simple: 'fable' }` and expects those five; the phone test expects `m.selects.length === 5`.
  - New « la ligne Relectures d'une review générale est juste sous Revue, sur Opus, avec les mêmes moteurs »: `page.getByRole('group', { name: 'Modèles' }).locator('label').allTextContents()` deep-equals `roles`; the combobox `Relectures d’une review générale` has `inputValue() === 'opus'`; its options' texts deep-equal `MODEL_FAMILIES.map(familyLabel)` and those of the combobox « Revue »; the help sentence (verbatim) is visible; `#model-audit` has `aria-describedby="model-audit-help"`.
  - New « Fable choisi pour les relectures est enregistré seul, gardé après rechargement, et les autres lignes ne bougent pas »: start from `{ machine: 'dev-server', models: { code: 'sonnet' } }` served by a stateful route (extract the `page.route(…settings.json**)` handler of « deux enregistrements de suite… » into a helper `statefulSettings(page, initial)` returning `{ file, puts }`, and reuse it in both tests); select `fable` on the new row, « Enregistrer », wait for the toast; the stored JSON deep-equals `{ machine: 'dev-server', models: { code: 'sonnet', audit: 'fable' } }`; no `runners.yml` dispatch; then `page.goto(url)` again + `openPage`: `chosen(page)` deep-equals `['fable', 'sonnet', 'fable', 'fable', 'sonnet'].map(labelOf)`. Then select `opus` again, save: stored `models` deep-equals `{ code: 'sonnet' }`.
- [ ] **Step 3: see them fail.** `npm test 2>&1 | tail -30` (models and relay-models red) and `CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 node --test e2e/general-settings.e2e.mjs` (red on the five-row expectations).
- [ ] **Step 4: implement.** Add the `audit` entry to `MODEL_ROLES` after `review`; update the two comments (« The five roles… », `{ plan, code, review, audit, simple }`; escalation « simple → code → review; audit → review »). Do not touch `panel/app.mjs` unless an e2e test proves a row-specific bug.
- [ ] **Step 5: `DESIGN.md`**, section « Réglages généraux (page à part) »: in « Disposition générale », « Modèles » has five rows, in this order: Plans et organisation, Écriture du code, Revue, Relectures d'une review générale, Tâches simples; in « Libellés et explications », « sous les quatre rôles » → « sous les cinq rôles ». Nothing else (check `npm test` keeps `design-layouts`/`design-rule` green).
- [ ] **Step 6: green.** Same two commands as step 3, all passing. Commit: `feat(models): a role for the part-by-part reviews of a general review (#570)`.

### Task 2: the journal recognises `[role:audit]`

**Files:** Modify `agent/scripts/journal.mjs:59` (`ROLE_TAG`), `test/subagents.test.mjs`.

- [ ] **Step 1: failing test** in `test/subagents.test.mjs`, next to « the journal records the role announced… »:

```js
// Issue #570: the part-by-part reviewers of a general review announce their own role.
test('the journal records the general-review role, and the « Sous-agents » line still counts per engine', () => {
  assert.deepEqual(agentEntry({ tool_name: 'Agent', tool_input: { description: '[role:audit] Relecture : le panneau', model: 'opus', effort: 'high' } }),
    { kind: 'agent', model: 'opus', effort: 'high', role: 'audit', label: 'Relecture : le panneau' });
  assert.equal(agentEntry({ tool_name: 'Agent', tool_input: { description: ' [ Role : Audit ] x' } }).role, 'audit');
  assert.equal(agentEntry({ tool_name: 'Agent', tool_input: { description: '[role:auditor] x' } }).role, null);
  const agents = [{ model: 'opus', label: 'Partie 1', role: 'audit' }, { model: 'opus', label: 'Partie 2', role: 'audit' }, { model: 'fable', label: 'Synthèse', role: 'review' }];
  assert.equal(agentsLine(parseJournal([journal(agents)])), agentsLine(parseJournal([journal(agents.map(({ role, ...a }) => a))])));
});
```

- [ ] **Step 2:** `node --test test/subagents.test.mjs` → red on `role: 'audit'`.
- [ ] **Step 3:** `ROLE_TAG` alternation becomes `(plan|code|review|audit|simple)`; nothing else in the file (`ROLE_DEFAULTS` stays `{ plan, review }`).
- [ ] **Step 4:** `node --test test/subagents.test.mjs test/journal.test.mjs test/upstream.test.mjs` green. Commit: `feat(journal): record the general-review role of a sub-agent (#570)`.

### Task 3: agent instructions

**Files:** Modify `agent/AGENT.md` (« **Modèles par rôle.** », lines 61-78 and the « Monter d'un cran » bullet), `agent/stages/audit.md` (step 3), `test/model-grid.test.mjs`.

- [ ] **Step 1: failing tests** in `test/model-grid.test.mjs`. Rename the first test « …each of the 5 roles » and add to it:

```js
  assert.match(grid, /chacun de 5 rôles/);
  assert.match(grid, /"review": …, "audit": …, "simple": …/);
  assert.match(line('audit'), /Relectures d'une review générale[^\n]*`opus`[^\n]*`high`[^\n]*partie par partie/);
  assert.ok(grid.indexOf('| `review`') < grid.indexOf('| `audit`') && grid.indexOf('| `audit`') < grid.indexOf('| `simple`'));
  assert.ok(!/générale/.test(line('code')), 'the code role no longer reviews the parts of a general review');
  assert.match(line('review'), /synthèse d'une review générale et relecture de ses corrections/);
  assert.match(grid, /tâches simples → code → revue ; `audit` → revue/);
  assert.match(grid.replace(/\s+/g, ' '), /Sans ce champ, ou si un rôle y manque, prends les valeurs par défaut du tableau/);
```

  In « each stage… names a role », the entry `'stages/audit.md'` expects three roles, each between backticks: audit, code, review. Add:

```js
// Issue #570: only the part-by-part reviewers of a general review run on the `audit` role.
test('the general review sends its part-by-part reviews to the audit role, and nothing else', async () => {
  const { readdirSync } = await import('node:fs');
  const step = read('stages/audit.md').replace(/\s+/g, ' ').match(/3\. \*\*Revue de code générale\*\*.*?(?= 3 bis\.)/)[0];
  assert.match(step, /sous-agents neufs du rôle `audit` \(`model` et `effort` de `models\.audit`, description `\[role:audit\] …`\)/);
  assert.match(step, /un seul pour une petite appli relue d'un bloc, lui aussi sur le rôle `audit`/);
  assert.match(step, /échoue deux fois repart sur le rôle `review`/);
  assert.match(step, /sous-agent du rôle `review` fait la synthèse/);
  assert.match(step, /corriger chaque point par des sous-agents du rôle `code`/);
  assert.match(step, /revue neuve des corrections par un sous-agent du rôle `review`, au plus \{\{maxLoops\}\} tours/);
  for (const f of readdirSync(new URL('../agent/stages/', import.meta.url)).filter((n) => n !== 'audit.md')) {
    assert.ok(!/rôle `audit`|\[role:audit/.test(read(`stages/${f}`)), `${f} must not use the audit role`);
  }
});
```

- [ ] **Step 2:** `node --test test/model-grid.test.mjs` → red.
- [ ] **Step 3: `agent/AGENT.md`.** « chacun de 5 rôles »; payload example `…, "review": …, "audit": …, "simple": …}`; « Sans ce champ, ou si un rôle y manque, prends les valeurs par défaut du tableau. » Table: remove « , chaque partie d'une revue générale » from the `code` row; `review` row ends « …revue de sécurité, synthèse d'une review générale et relecture de ses corrections »; new row right under it:
  `` | `audit` (Relectures d'une review générale) | `opus` | `high` | relectures partie par partie d'une review générale (étape 3 de `stages/audit.md`), même quand une petite appli est relue d'un seul bloc ; rien d'autre | ``
  « Monter d'un cran » bullet: « (tâches simples → code → revue ; `audit` → revue) ». Keep lines ≤ 120 characters outside the table.
- [ ] **Step 4: `agent/stages/audit.md`, step 3**, replaced by (re-wrapped at the file's width, same indentation):

  > 3. **Revue de code générale** : charge le skill `requesting-code-review` (outil Skill), puis fais relire **tout le code** (pas un diff) par des sous-agents neufs du rôle `audit` (`model` et `effort` de `models.audit`, description `[role:audit] …`), un par grande partie de l'appli si elle est grosse, un seul pour une petite appli relue d'un bloc, lui aussi sur le rôle `audit`. Ils cherchent : bugs, failles de sécurité et données personnelles, erreurs mal gérées, tests manquants sur ce qui compte, accessibilité, performances, code mort ou dupliqué, écarts avec `PRODUCT.md`. Un relecteur qui échoue deux fois repart sur le rôle `review` (description `[role:review] …`). Puis un sous-agent du rôle `review` fait la synthèse de leurs rapports (doublons, priorités, ce qui manque). Fais corriger chaque point par des sous-agents du rôle `code` (skill `receiving-code-review`) ; pour un bug, le test qui échoue s'écrit d'abord. Puis une revue neuve des corrections par un sous-agent du rôle `review`, au plus {{maxLoops}} tours.

- [ ] **Step 5:** `node --test test/model-grid.test.mjs` green. Commit: `feat(agent): general-review part reviewers run on the audit role (#570)`.

### Final verification (all must pass; paste the tails in the hand-back)

```bash
npm run typecheck && npm run lint && npm test 2>&1 | tail -8 && npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 npm run test:a11y 2>&1 | tail -8
CHROMIUM_PATH=/opt/pw-browsers/chromium timeout 300 npm run test:e2e 2>&1 | tail -8
git status --short   # nothing under .factory/ (except .factory/journal/) nor .claude/skills/
grep -n "cinq types\|Relecture partie par partie" GLOSSARY.md && ls docs/adr/0017-*   # already merged: check only
```

Spec check 6 (« le journal de la PR montre les relectures sur le moteur de cette ligne ») can only be seen at the next general review of a project after its sync: say so in the PR (« Pas vérifié en vrai »).
