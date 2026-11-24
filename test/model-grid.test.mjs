import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../agent/${f}`, import.meta.url), 'utf8');
const agent = read('AGENT.md');
const grid = agent.slice(agent.indexOf('**Modèles par rôle.**'));
const line = (role) => grid.split('\n').find((l) => l.startsWith('|') && l.includes(`\`${role}\``)) || '';

test('AGENT.md holds one table: the model and effort of each of the 5 roles', () => {
  assert.ok(agent.includes('**Modèles par rôle.**'));
  assert.ok(!agent.includes('**Modèle et effort des sous-agents.**'));
  assert.match(grid, /`models`/);
  assert.match(line('plan'), /`fable`[^\n]*`high`/);
  assert.match(line('code'), /`opus`[^\n]*`medium`/);
  assert.match(line('review'), /`fable`[^\n]*`high`/);
  assert.match(line('simple'), /`sonnet`[^\n]*`low`/);
  assert.match(grid, /jamais `xhigh` ni `max`/i);
  assert.match(grid, /tâches simples → code → revue/);
  assert.match(grid, /même pour une petite/);
  assert.match(grid, /chacun de 5 rôles/);
  assert.match(grid, /"review": …, "audit": …, "simple": …/);
  assert.match(line('audit'), /Relectures d'une review générale[^\n]*`opus`[^\n]*`high`[^\n]*partie par partie/);
  assert.ok(grid.indexOf('| `review`') < grid.indexOf('| `audit`') && grid.indexOf('| `audit`') < grid.indexOf('| `simple`'));
  assert.ok(!/générale/.test(line('code')), 'the code role no longer reviews the parts of a general review');
  assert.match(line('review'), /synthèse d'une review générale et relecture de ses corrections/);
  assert.match(grid, /tâches simples → code → revue ; `audit` → revue/);
  assert.match(grid.replace(/\s+/g, ' '), /Sans ce champ, ou si un rôle y manque, prends les valeurs par défaut du tableau/);
});

test('each stage that dispatches a sub-agent names a role, not a fixed model', () => {
  const expected = {
    'stages/build.md': ['`code`', '`review`', '`plan`'], 'stages/bugfix.md': ['`review`', '`plan`', '`code`'], 'stages/audit.md': ['`audit`', '`code`', '`review`'], 'stages/ui-polish.md': ['`code`'],
    'stages/grilling.md': ['`plan`'], 'stages/spec.md': ['`plan`'], 'stages/framing.md': ['`plan`'], 'stages/docs.md': ['`plan`'],
    'stages/design-pass.md': ['`code`'], 'stages/visual-fix.md': ['`code`'], 'stages/acceptance-fix.md': ['`code`'], 'stages/skills-fix.md': ['`review`'],
  };
  for (const [file, roles] of Object.entries(expected)) {
    const text = read(file);
    for (const r of roles) assert.ok(text.includes(r), `${file} should name ${r}`);
    for (const m of ['haiku', 'sonnet', 'opus']) assert.ok(!text.includes(`\`${m}\``), `${file} should not name \`${m}\``);
  }
});

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

// Issue #550: the upstream thinking goes to a sub-agent of role `plan`; the pilot only publishes, with the proof line.
test('the upstream phase is delegated to the plan role, with its proof line', () => {
  assert.match(line('plan'), /phase amont[^\n]*cadrage[^\n]*analyse d'un bug/);
  for (const s of ['**Phase amont**', '**Preuve de la phase amont.**', 'upstream.mjs', 'factory-upstream', 'sans le réécrire', 'relance-le sur le rôle `review`', 'Seul le chat']) {
    assert.ok(grid.includes(s), s);
  }
  assert.match(grid, /tâches simples → code → revue/);
  assert.match(grid, /même pour une petite/);
  for (const f of ['grilling.md', 'spec.md', 'framing.md']) {
    const text = read(`stages/${f}`);
    assert.ok(text.includes('`plan`') && text.includes('upstream.mjs'), f);
  }
  const bug = read('stages/bugfix.md');
  assert.ok(bug.indexOf('`plan`') >= 0 && bug.indexOf('`plan`') < bug.indexOf('`code`'), 'bugfix: analysis by `plan` before the fix by `code`');
  assert.ok(read('stages/docs.md').includes('`plan`'));
  const question = read('stages/question.md');
  assert.ok(!question.includes('upstream.mjs') && !question.includes('`plan`'), 'the chat stays with the pilot');
});

// Review of #550: the plan sub-agent never publishes; a way out when the proof keeps being refused; words match the code.
test('the plan sub-agent hands its text back, and the proof line has a way out', () => {
  const flat = (s) => s.replace(/\s+/g, ' ');
  const g = flat(grid);
  assert.match(g, /n'écrit rien sur GitHub \(commentaire, label, issue, PR\) et ne pousse rien/);
  assert.match(g, /tu ouvres toi-même les issues des tranches/);
  assert.match(g, /`model` = `models\.plan\.model`/);
  assert.match(g, /après un sous-agent `plan` puis un sous-agent `review`, chacun lancé avec son `model`, publie sans la ligne/);
  assert.match(g, /Aucun round de questions, aucune spec ni fiche projet ne se publie sans cette ligne/);
  assert.match(g, /avant le dernier test rouge/);
  for (const f of ['grilling.md', 'spec.md', 'framing.md']) assert.match(flat(read(`stages/${f}`)), /n'écrit rien sur GitHub \(commentaire, label, issue, PR\) et ne pousse rien : là où ce fichier dit « publie », « mets le label » ou « ouvre une issue »/, f);
  assert.match(read('stages/framing.md'), /tu poses les labels\.\n\nCette étape a lieu/);
  assert.match(flat(read('stages/bugfix.md')), /après le rattrapage éventuel et avant tout autre travail/);
  assert.match(flat(read('stages/grilling.md')), /factory-split[^]*sous-agent du rôle `plan` la relit[^]*upstream\.mjs <n>/);
});

// Second review of #550: who opens the slice issues, where the journal never goes, and lines that fit.
test('the pilot opens the slice issues, the journal stays off the documents branch, lines are wrapped', () => {
  const flat = (s) => s.replace(/\s+/g, ' ');
  assert.match(flat(read('stages/spec.md')), /4 bis\.[^]*Le sous-agent écrit le texte de chaque tranche dans son fichier et c'est toi qui ouvres ces issues/);
  assert.match(flat(read('stages/docs.md')), /Le journal \(`\.factory\/journal\/`\) ne va jamais sur la branche `claude\/docs-<n>`/);
  assert.match(flat(read('stages/docs.md')), /ne l'ajoute pas au commit de cette branche/);
  const wrapped = { 'AGENT.md': ['il relit aussi la demande', 'Il te rend, dans un fichier', "n'écrit rien sur GitHub"], 'stages/spec.md': ['ligne de preuve (`upstream.mjs`)', 'Ouvre une issue par autre tranche'] };
  assert.ok(!/il lit\n/.test(read('stages/bugfix.md')), 'bugfix: the analysis paragraph is wrapped');
  for (const [f, words] of Object.entries(wrapped)) {
    for (const w of words) assert.ok(read(f).split('\n').filter((l) => l.includes(w)).every((l) => l.length <= 120), `${f}: ${w}`);
  }
});

// Issue #559: the role is announced at launch, and the proof comes from the thinking sub-agent's own record.
test('every sub-agent announces its role; the proof comes from its own record', () => {
  const flat = (s) => s.replace(/\s+/g, ' ');
  const g = flat(grid);
  for (const s of ['`[role:<rôle>]`', '`[role:plan:amont]`', '`[role:review:amont]`', "`node .factory/scripts/upstream.mjs <numéro de l'issue> <fichier>`", 'outil Write', 'annule la preuve']) {
    assert.ok(g.includes(s), s);
  }
  for (const f of ['grilling.md', 'spec.md', 'framing.md']) {
    const text = read(`stages/${f}`);
    assert.ok(flat(text).includes('[role:plan:amont]'), f);
    assert.ok(text.includes('upstream.mjs <n> <fichier>'), f);
    assert.doesNotMatch(text, /upstream\.mjs <n>(?! <fichier>)/, f);
  }
  const bug = read('stages/bugfix.md');
  assert.ok(bug.includes('[role:plan:amont]') && bug.indexOf('[role:plan:amont]') < bug.indexOf('[role:code]'), 'bugfix: analysis announced before the fix');
  const step1 = bug.slice(bug.indexOf('1. **Analyse**'), bug.indexOf('2. Branche'));
  assert.ok(step1.includes('node .factory/scripts/journal-check.mjs'), 'bugfix: the analysis proof is recorded as soon as it is handed back');
  assert.match(flat(step1), /ne committe rien à ce moment : le journal partira avec la branche de l'étape 2/,
    'bugfix: committing the journal before the step-2 branch would drop it from the PR');
  assert.ok(!read('stages/question.md').includes('[role:'), 'the chat stays with the pilot');
});
