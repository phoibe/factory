#!/usr/bin/env node
// Helpers for .github/workflows/stable.yml, run in a full clone of main.
//   node scripts/stable.mjs tag    -> the next version tag, vYYYY.MM.DD (then .2, .3… the same day)
//   node scripts/stable.mjs notes  -> the changes since the current stable branch, in Markdown
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function nextTag(existing, date = new Date()) {
  const day = `v${date.toISOString().slice(0, 10).replace(/-/g, '.')}`;
  if (!existing.includes(day)) return day;
  let n = 2;
  while (existing.includes(`${day}.${n}`)) n++;
  return `${day}.${n}`;
}

export function notes(subjects) {
  const lines = subjects.filter((s) => s && !/^chore\(factory\)/.test(s)).map((s) => `- ${s}`);
  return ['Ce qui change pour les projets :', '', ...(lines.length ? lines : ['- (aucun changement visible)'])].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const cmd = process.argv[2];
  if (cmd === 'tag') console.log(nextTag(git('tag', '--list', 'v*').split('\n').filter(Boolean)));
  else if (cmd === 'notes') {
    let range = 'HEAD';
    try { git('fetch', '--quiet', 'origin', 'stable'); range = 'FETCH_HEAD..HEAD'; } catch { /* first promotion */ }
    console.log(notes(git('log', '--format=%s', range).split('\n')));
  } else { console.error('usage: stable.mjs tag|notes'); process.exit(1); }
}
