#!/usr/bin/env node
// Run by the agent before it opens or updates a PR: lists the steps its journal does not show yet, so it can
// do them now instead of the owner seeing an alert. Usage: node .factory/scripts/journal-check.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingSkills, parseJournal, uiChanged } from './fabrication.mjs';

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

export function report(files, readFile, stages) {
  const texts = files.filter((f) => /^\.factory\/journal\/[^/]+\.jsonl$/.test(f)).map(readFile).filter(Boolean);
  const missing = missingSkills(parseJournal(texts), { stages, ui: uiChanged(files) });
  if (!missing.length) return 'Journal : rien ne manque ✅';
  return ['Journal : ces étapes ne sont pas encore faites, fais-les maintenant puis relance ce contrôle :',
    ...missing.map((m) => `- ${m.label} : ${HOW[m.skill] || `charge le skill \`${m.skill}\``}`)].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  try {
    const cfg = join(root, '.factory/config.resolved.json');
    const stages = existsSync(cfg) ? JSON.parse(readFileSync(cfg, 'utf8')).stages || {} : {};
    const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return null; } };
    console.log(report(branchFiles(git), read, stages));
  } catch (e) {
    console.log(`Journal : contrôle impossible (${e.message}).`);
  }
}
