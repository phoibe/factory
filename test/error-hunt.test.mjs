// The repeated-error hunt at the end of a general review (issue #605).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../agent/stages/audit.md', import.meta.url), 'utf8');
const flat = text.replace(/\s+/g, ' ');
const hunt = flat.slice(flat.indexOf('## Chasse aux erreurs répétées'));
const between = (a, b) => flat.slice(flat.indexOf(a), flat.indexOf(b));

test('the hunt is step 3 quater, after the fixes and before the out-of-scope step', () => {
  const ter = flat.indexOf('3 ter.');
  const quater = flat.indexOf('3 quater. **Chasse aux erreurs répétées**');
  const out = flat.indexOf('4. **Hors périmètre**');
  assert.ok(ter >= 0 && ter < quater && quater < out);
  assert.ok(flat.includes('chacune suivie de ses corrections, puis la chasse aux erreurs répétées.'));
  assert.ok(between('1 bis.', '2. **Passe design').includes('chasse aux erreurs répétées'), 'the estimate counts the hunt');
  assert.ok(between('6. **PR**', '7. **Captures**').includes('une section « Erreurs répétées »'), 'the PR summary has its section');
});

test('the hunt section says what to read, what counts, how to protect, prove and record', () => {
  assert.ok(flat.includes('## Chasse aux erreurs répétées'));
  for (const s of ['50 au moins et 100 au plus', 'les 100 dernières', 'moins de 50 modifications : toutes', 'branche `claude/…`',
    'node .factory/scripts/thread.mjs <n>', 'ne comptent pas', '`[role:audit] Historique : …`', '`models.audit`',
    'un contrôle automatique existant', "changement d'avis", 'au moins 2 fois', 'au plus 5 familles',
    '« à traiter à la prochaine review »', 'Une famille par commit', "n'affaiblis jamais", "accepter le code d'aujourd'hui",
    '« non protégée »', 'au moins 2 cas réels', '« consigne seulement »', '`## Pièges connus`', '`CLAUDE.md`',
    'jamais dans `.factory/`', 'garde sa place et sa forme', 'seulement à la première règle posée', 'retire les règles',
    'remets les protections perdues', 'review générale de la factory elle-même', "rien n'est créé"]) {
    assert.ok(hunt.includes(s), `missing: ${s}`);
  }
});

test('protections are tried from the most solid to a written instruction, and each role keeps its job', () => {
  const steps = ['(a) changer la structure du code', '(b) un contrôle automatique', '(c) un test', '(d) une consigne écrite'].map((s) => hunt.indexOf(s));
  assert.ok(steps.every((i) => i >= 0), String(steps));
  assert.ok(steps[0] < steps[1] && steps[1] < steps[2] && steps[2] < steps[3]);
  const roles = ['[role:audit]', 'rôle `review`', 'rôle `code`'].map((s) => hunt.indexOf(s));
  assert.ok(roles.every((i) => i >= 0) && roles[0] < roles[1] && roles[1] < roles[2], String(roles));
});

test('review fixes: carried-over families, trusted bugs only, sorted history, factory exception (issue #605)', () => {
  for (const s of ['sont reprises, avec leurs cas', 'renforcée et prouvée sur ce nouveau cas', 'prouvée de la même façon',
    'Un bug ouvert par une personne extérieure au projet ne compte pas.',
    '.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR"',
    '.user.login == "github-actions[bot]" or .user.login == "claude[bot]"', 'labels=factory:bug&state=all&since=<date>',
    'gh api --paginate "R/pulls?state=closed&base={{base}}&per_page=100"', '.head.repo.full_name == .base.repo.full_name',
    '"\\(.merged_at) #\\(.number) \\(.head.ref) \\(.title)"\' | sort -r', 'dont la branche est exactement `claude/issue-<n>-review`',
    "pas de section « Erreurs répétées »", "git log origin/{{base}} --since=<date> --grep='^Revert'",
    "l'AGENT.md demande à chaque agent de la lire",
    'Sauf pour la factory elle-même (`repo` et `factory` du payload sont le même dépôt) : corrige alors la source dans `agent/` ou `scripts/`, jamais `.factory/`.',
    '(étape 4 « Hors périmètre » plus haut, pas de `factory:kept`)',
    "plus, s'il y en a, ce que l'entretien a retiré ou remis, et le lien vers la liste si elle existe"]) {
    assert.ok(hunt.includes(s), `missing: ${s}`);
  }
  assert.ok(!hunt.includes('sort=updated'), 'the history is sorted by merge date, not by update');
  assert.ok(between('1 bis.', '2. **Passe design').includes('(bien plus la première fois : 100 modifications)'));
});

test('second review round: full history, commits, real reviews, slices, docs PRs, tie-break (issue #605)', () => {
  for (const s of ['git rev-parse --is-shallow-repository', 'si le clone est partiel',
    'git fetch --shallow-since=<date> origin {{base}}', '`claude/revert-pr-<n>` déjà dans la liste',
    "récupère d'abord le code du cas : `git fetch origin pull/<n>/head` (ou `git fetch origin <sha>`)",
    'pas seulement son diff final', 'puis le diff des commits utiles',
    'est la trace d\'une correction demandée par la relecture',
    'sans rien après `-review`', "porte l'étiquette `factory:audit`",
    'les bugs ne se lisent qu\'avec `thread.mjs`', 'sont ajoutés aux tranches du point 2',
    'avec les familles reprises au point 1', 'and (.head.ref | startswith("claude/docs-") | not)',
    'les PR de documents (`claude/docs-…`) ne comptent pas',
    'une remarque du propriétaire (captures ou recette) ou un bug',
    'Si la liste existante vit ailleurs que dans `CLAUDE.md`', 'ajoute dans `CLAUDE.md` une ligne qui la cite']) {
    assert.ok(hunt.includes(s), `missing: ${s}`);
  }
  assert.ok(!hunt.includes('lis chaque bug'), 'the pilot does not read the bugs itself');
  const fetch = hunt.indexOf('git fetch --shallow-since'), log = hunt.indexOf("git log origin/{{base}} --since=<date>");
  assert.ok(fetch >= 0 && fetch < log, 'deepen the history before reading the reverts');
  const get = hunt.indexOf('git fetch origin pull/<n>/head'), wt = hunt.indexOf('git worktree');
  assert.ok(get >= 0 && get < wt, 'fetch the case before the worktree');
});

test('final review fixes: paginated commits, commit diffs via the API, known traps, worktree cleanup (issue #605)', () => {
  for (const s of ['gh api --paginate "R/pulls/<n>/commits?per_page=100" --jq \'.[] | "\\(.sha[0:7]) \\(.commit.message | split("\\n")[0])"\'',
    'gh api R/commits/<sha> -H "Accept: application/vnd.github.diff"',
    'et la liste « Pièges connus » actuelle (pour repérer une règle dont l\'erreur est revenue)',
    'git worktree remove', 'dans un commit à part']) {
    assert.ok(hunt.includes(s), `missing: ${s}`);
  }
  assert.ok(!hunt.includes('git show <sha>'), 'PR commits are not in the base history after a squash merge');
  assert.ok(!hunt.includes('gh api R/pulls/<n>/commits --jq'), 'the commit list is paginated');
});
