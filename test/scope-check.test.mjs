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
const AGENT = 'sous-agent neuf du rôle `review` (description `[role:review] [kind:scope-check] Vérification de portée`)';
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
    'tu le commites avec le reste',
    'rien de réel', 'aucun ordre envoyé, aucune vraie donnée modifiée', 'réglages de production',
    "test qui échoue d'abord, avant la relecture finale", "ne se fait qu'une fois"]);
});

test('build: the PR summary says « Portée vérifiée », the technical part gives the fact, the command and its result', () => {
  has(step, ['« Portée vérifiée : … »', 'en français simple', 'Une casse trouvée et corrigée : la ligne le dit', 'elle le dit en une phrase',
    'tout en bas : le fait prouvé, la commande lancée et son résultat', '« Essayé en vrai » et « Pas vérifié en vrai » ne changent pas']);
});

test('build: a fact that cannot be proved opens the PR, asks the owner and never sends it to the checks', () => {
  has(step, ['« Portée non prouvée : … »', 'ce qui reste à regarder', 'ne mets pas `factory:checks` sur la PR', 'Répondez « ok » ici',
    "`factory:blocked` sur l'issue (pas sur la PR)", '`resume.md`', "sa réponse doit être écrite sur l'issue (sur la PR, sans label, elle serait ignorée)",
    "le message de l'étape 10 n'est pas posté : cette question le remplace",
    "Pour une correction de bug, ajoute : « Votre « ok » la met aussi en ligne directement dès que les contrôles sont verts, sans passer par la recette. »"]);
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
  has(s, ['modifie du code', '« Portée vérifiée » ou « Portée non prouvée »', 'étape 4 ter de `build.md`', 'sous-agent neuf du rôle `review`, description `[role:review] [kind:scope-check] Vérification de portée`', 'avant de pousser',
    'ajoute ou mets à jour la ligne « Portée vérifiée : … » de la description de la PR', 'sans toucher au reste de la description',
    "une fois l'étape 3 finie (revue par un sous-agent neuf, passe design si besoin, vérifications locales)",
    "mets d'abord `factory:blocked` sur la PR, puis retire tous ses labels d'étape présents (`factory:acceptance`, `factory:checks`, `factory:visual-review`)",
    '« Portée non prouvée : … »', 'ne mets pas `factory:checks`', 'son message est posté sur la PR', '« Répondez « ok » ici, sur la PR,']);
  assert.doesNotMatch(s, /retire son label d'étape/);
});

test('resume: « ok » sends the waiting PR to the checks, anything else keeps it blocked', () => {
  const s = between(flat('stages/resume.md'), 'Portée non prouvée (ton message de blocage', 'Si le blocage venait des contrôles automatiques');
  assert.match(s, /il répond « ok » : mets `factory:checks` sur la PR/);
  has(s, ["question posée pendant une correction en recette (`acceptance-fix.md`) : refais plutôt son étape 4, même sans nouveau push (captures si l'apparence a changé, puis `factory:checks`)",
    "Le fait est maintenant prouvé (la ligne redevient « Portée vérifiée : … ») : refais les captures si l'apparence a changé (comme à l'étape 9 de `build.md` ou à l'étape 4 de `acceptance-fix.md`), puis mets `factory:checks` sur la PR",
    'vérification de portée refaite sur ce changement', "remets `factory:blocked` là où il était (l'issue, ou la PR si la question y était), toujours sans `factory:checks`"]);
});

test('nowhere else: no other stage mentions the scope check, and no script asks for the line', () => {
  const stages = readdirSync(new URL('../agent/stages/', import.meta.url));
  assert.ok(stages.length > 15);
  for (const f of stages.filter((n) => !['build.md', 'bugfix.md', 'acceptance-fix.md', 'resume.md'].includes(n))) {
    assert.doesNotMatch(read(`stages/${f}`), /vérification de portée|Portée (vérifiée|non prouvée)/i, f);
  }
  for (const f of readdirSync(new URL('../agent/scripts/', import.meta.url))) assert.doesNotMatch(read(`scripts/${f}`), /Portée/, f);
});

test('AGENT.md: the review role lists the scope check', () => {
  const row = read('AGENT.md').split('\n').find((l) => l.startsWith('| `review`'));
  assert.match(row, /relecture finale du code avant la PR, vérification de portée, revue de sécurité, synthèse d'une review générale et relecture de ses corrections/);
});
