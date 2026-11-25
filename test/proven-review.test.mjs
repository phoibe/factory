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

test('the PR steps of build.md and bugfix.md point to the `Code review` section of the guide', () => {
  for (const s of [between('build.md', ' 8. **PR**', ' 9. '), between('bugfix.md', ' 4. PR', 'pas de recette')]) {
    assert.match(s, /section `Code review` décrite dans `code-review\.md`/);
  }
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
