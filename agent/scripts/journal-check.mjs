#!/usr/bin/env node
// Run by the agent before it opens or updates a PR: lists the steps its journal does not show yet, so it can
// do them now instead of the owner seeing an alert. Usage: node .factory/scripts/journal-check.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATCH_UP, expectations, missingSkills, parseJournal, redThenGreen, uiChanged } from './fabrication.mjs';

const HOW = {
  'writing-plans': 'charge le skill `writing-plans` (outil Skill) et écris le plan',
  'test-driven-development': "charge le skill `test-driven-development` et fais échouer un test avec la commande de test du projet avant de coder",
  'systematic-debugging': 'charge le skill `systematic-debugging` pour trouver la cause',
  'requesting-code-review': 'charge le skill `requesting-code-review` et fais relire le diff par un sous-agent neuf',
  impeccable: 'suis `.factory/stages/design-pass.md` (skill `impeccable`, commande `critique`, sur chaque écran modifié)',
};

// Files of this branch compared to main, committed or not.
export function branchFiles(git) {
  const base = git(['merge-base', 'HEAD', 'origin/main']).trim();
  const lines = (out) => out.split('\n').map((l) => l.trim()).filter(Boolean);
  return [...new Set([...lines(git(['diff', '--name-only', base])), ...lines(git(['ls-files', '--others', '--exclude-standard']))])];
}

const JOURNAL = /^\.factory\/journal\/[^/]+\.jsonl$/;
const GATED = ['build', 'bugfix', 'foundation', 'audit'];

// What this branch still lacks, as lines « étape : comment la faire ». `stage` is the current run's stage:
// a build, bugfix or foundation run must show every step; a catch-up run only the ones it is there for;
// any other run is not checked (null). `current` is the journal text of the current run, for its TDD proof.
export function problems(files, readFile, stages, { stage = null, current = null } = {}) {
  const runs = parseJournal(files.filter((f) => JOURNAL.test(f)).map(readFile).filter(Boolean));
  const ui = uiChanged(files);
  let missing = missingSkills(runs, { stages, ui });
  if (stage === 'skills-fix') missing = missing.filter((m) => CATCH_UP.includes(m.skill));
  else if (stage && !GATED.includes(stage)) return [];
  const out = missing.map((m) => `${m.label} : ${HOW[m.skill] || `charge le skill \`${m.skill}\``}`);
  const run = current ? parseJournal([current]).at(-1) : null;
  if (run && GATED.includes(stage) && expectations(stage, stages, ui).some((e) => e.tdd && !missing.some((m) => m.skill === e.skill)) && !redThenGreen(run)) {
    out.push('preuve TDD : lance un test qui échoue avec la commande de test du projet, puis fais-le passer');
  }
  return out;
}

export function report(files, readFile, stages, opts) {
  const list = problems(files, readFile, stages, opts);
  if (!list.length) return 'Journal : rien ne manque ✅';
  return ['Journal : ces étapes ne sont pas encore faites, fais-les maintenant puis relance ce contrôle :', ...list.map((l) => `- ${l}`)].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Run from the project's folder (node .factory/scripts/journal-check.mjs), which is the right clone even
  // when the routine serves several projects.
  const root = process.cwd();
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  try {
    const cfg = join(root, '.factory/config.resolved.json');
    const stages = existsSync(cfg) ? JSON.parse(readFileSync(cfg, 'utf8')).stages || {} : {};
    const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return null; } };
    // Hooks are not loaded when the routine serves several projects: rebuild the journal from the transcript.
    const remote = (() => { try { return git(['remote', 'get-url', 'origin']).trim(); } catch { return ''; } })();
    const repo = (/github\.com[/:]([^/]+\/[^/.\s]+)/.exec(remote) || [])[1];
    if (repo) {
      const { importTranscript } = await import('./transcript.mjs');
      const file = importTranscript(root, repo);
      if (file) console.log(`Journal reconstitué depuis la session : ${file.slice(root.length + 1)} (à committer avec le reste).`);
    }
    const files = branchFiles(git);
    if (!files.some((f) => /^\.factory\/journal\/[^/]+\.jsonl$/.test(f))) console.log('Journal : aucun journal pour ce run. Lance ce contrôle depuis le dossier du projet, puis committe .factory/journal/.');
    else console.log(report(files, read, stages));
  } catch (e) {
    console.log(`Journal : contrôle impossible (${e.message}).`);
  }
}
