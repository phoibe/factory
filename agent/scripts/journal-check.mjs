#!/usr/bin/env node
// Run by the agent before it opens or updates a PR: lists the steps its journal does not show yet, so it can
// do them now instead of the owner seeing an alert. Usage: node .factory/scripts/journal-check.mjs
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATCH_UP, expectations, missingSkills, parseJournal, redThenGreen, smallChange, uiChanged, upstreamCheck } from './fabrication.mjs';
import { latestRun, upstreamEntry } from './upstream.mjs';
import { defaultGh, repoFromRemote } from './specs.mjs';
import { importTranscript } from './transcript.mjs';

const HOW = {
  'writing-plans': 'charge le skill `writing-plans` (outil Skill) et écris le plan',
  'test-driven-development': "charge le skill `test-driven-development` et fais échouer un test avec la commande de test du projet avant de coder",
  'systematic-debugging': 'charge le skill `systematic-debugging` pour trouver la cause',
  'requesting-code-review': 'charge le skill `requesting-code-review` et fais relire le diff par un sous-agent neuf (rôle `review`)',
  impeccable: 'suis `.factory/stages/design-pass.md` (skill `impeccable`, commande `critique`, sur chaque écran modifié)',
};

// The branch's starting point: of origin/preprod (approval mode), origin/HEAD (the default branch) and origin/main,
// the merge base of those that exist with the fewest commits up to HEAD.
function mergeBase(git) {
  let best = null;
  for (const ref of ['origin/preprod', 'origin/HEAD', 'origin/main']) {
    try {
      const base = git(['merge-base', 'HEAD', ref]).trim();
      if (!base) continue;
      let count = 0;
      try { count = Number.parseInt(git(['rev-list', '--count', `${base}..HEAD`]), 10) || 0; } catch { /* keep 0 */ }
      if (!best || count < best.count) best = { base, count };
    } catch { /* this remote branch does not exist */ }
  }
  if (!best) throw new Error('no base branch found (origin/preprod, origin/HEAD, origin/main)');
  return best.base;
}

// Files of this branch compared to its base branch, committed or not.
export function branchFiles(git) {
  const base = mergeBase(git);
  const lines = (out) => out.split('\n').map((l) => l.trim()).filter(Boolean);
  return [...new Set([...lines(git(['diff', '--name-only', base])), ...lines(git(['ls-files', '--others', '--exclude-standard']))])];
}

const JOURNAL = /^\.factory\/journal\/[^/]+\.jsonl$/;
export const GATED = ['build', 'bugfix', 'foundation', 'audit', 'ui-polish'];

// What this branch still lacks, as lines « étape : comment la faire ». `stage` is the current run's stage:
// a build, bugfix or foundation run must show every step; a catch-up run only the ones it is there for;
// any other run is not checked (null). `current` is the journal text of the current run, for its TDD proof.
export function problems(files, readFile, stages, { stage = null, current = null } = {}) {
  const runs = parseJournal(files.filter((f) => JOURNAL.test(f)).map(readFile).filter(Boolean));
  const ui = uiChanged(files);
  const small = smallChange(files);
  let missing = missingSkills(runs, { stages, ui, small });
  if (stage === 'skills-fix') missing = missing.filter((m) => CATCH_UP.includes(m.skill));
  else if (stage && !GATED.includes(stage)) return [];
  const out = missing.map((m) => `${m.label} : ${HOW[m.skill] || `charge le skill \`${m.skill}\``}`);
  const run = current ? parseJournal([current]).at(-1) : null;
  if (run && GATED.includes(stage) && expectations(stage, stages, ui, { small }).some((e) => e.tdd && !missing.some((m) => m.skill === e.skill)) && !redThenGreen(run)) {
    out.push('preuve TDD : lance un test qui échoue avec la commande de test du projet, puis fais-le passer');
  }
  if (stage !== 'skills-fix') out.push(...upstreamCheck(runs).missing.map((m) => m.how));
  return out;
}

// The run being checked from the command line: the journal whose latest « run » entry is the most recent. Its stage
// is the one the lock applies, so both always agree on what is missing.
export function runOptions(files, readFile) {
  const best = latestRun(files, readFile);
  return best ? { stage: best.run.stage, current: best.text } : {};
}

// A feature build ships its validated spec as a document (docs/specs/<n>-….md, see stages/build.md). A reminder,
// not a lock: a request without a spec comment must still be able to open its PR.
export function specReminder(files, { stage = null, current = null } = {}, readFile = () => '') {
  if (stage !== 'build') return null;
  const run = String(current || '').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e?.kind === 'run').at(-1);
  const own = run?.issue ? new RegExp(`^docs/specs/${run.issue}(-[^/]*)?\\.md$`) : /^docs\/specs\/\d+[^/]*\.md$/;
  if (files.some((f) => own.test(f) && readFile(f) !== null)) return null; // a deleted spec does not count
  return `spec rangée : lance \`node .factory/scripts/specs.mjs save ${run?.issue ?? '<n>'}\` pour ranger la spec validée dans le projet`;
}

// Issue #550: for a build or a foundation, what the request's comments show about who did its questions and sheet,
// as the entry to append to the journal of the branch's latest build or foundation run ({ file, entry }), or null when
// there is nothing new to write. A later run that resumes the work (fix-checks, update-branch…) does not hide it.
// `comments(repo, issue)` reads the request (it may throw: « unread »); without `repo` the request cannot be read
// either. Only a run journaled with its models counts, as in upstreamCheck. « unread » never replaces a measured
// entry, and an entry equal to the newest one of those runs is not written again.
const MEASURED = ['proved', 'unproved', 'old'];
const DOC_STAGES = ['build', 'foundation'];
export function upstreamUpdate(files, readFile, { repo = null, comments, since = null } = {}) {
  let best = null;
  const texts = [];
  for (const file of files.filter((f) => JOURNAL.test(f))) {
    const text = readFile(file);
    if (!text) continue;
    texts.push(text);
    // Appended at the end of its journal, the entry belongs to the journal's last run: only that one can take it.
    const run = parseJournal([text]).at(-1);
    if (!run || !run.models || !DOC_STAGES.includes(run.stage) || run.issue == null) continue;
    if (!best || String(run.t) > String(best.run.t)) best = { file, run };
  }
  if (!best) return null;
  let list = null;
  if (repo) { try { list = comments(repo, best.run.issue); } catch { /* GitHub unreachable: « unread » */ } }
  const entry = upstreamEntry(best.run, list, { since, owner: repo ? repo.split('/')[0] : null });
  const current = parseJournal(texts)
    .filter((r) => r.models && DOC_STAGES.includes(r.stage) && Number(r.issue) === Number(best.run.issue) && r.upstream)
    .map((r) => r.upstream).sort((a, b) => String(a.t).localeCompare(String(b.t))).at(-1);
  if (!entry || (entry.status === 'unread' && MEASURED.includes(current?.status))) return null;
  const same = current && JSON.stringify([entry.doc, entry.status, entry.by]) === JSON.stringify([current.doc, current.status, current.by]);
  return same ? null : { file: best.file, entry };
}

// Issue #550: since when the proof is asked for: the date of the latest commit that brought the upstream instruction
// into .factory/AGENT.md (after a rollback of the factory and a new delivery, the new delivery). Null when unknown or
// when the instruction is not there now: every spec then counts as « old ». In a shallow clone the parent of a commit
// may be cut off: that commit then counts as the delivery, a later date, which only lets more specs count as « old ».
const INSTRUCTION = 'upstream.mjs';
export function upstreamSince(git) {
  const has = (rev) => { try { return git(['show', `${rev}:.factory/AGENT.md`]).includes(INSTRUCTION); } catch { return false; } };
  try {
    if (!has('HEAD')) return null;
    const log = git(['log', '--format=%H %cI', `-S${INSTRUCTION}`, '--', '.factory/AGENT.md']).trim().split('\n').filter(Boolean);
    for (const line of log) {
      const [sha, date] = line.split(' ');
      if (has(sha) && !has(`${sha}^`)) return date || null;
    }
  } catch { /* no history */ }
  return null;
}

export function report(files, readFile, stages, opts) {
  const list = problems(files, readFile, stages, opts);
  const spec = specReminder(files, opts, readFile);
  if (spec) list.push(spec);
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
    const repo = (() => { try { return repoFromRemote(remote); } catch { return null; } })();
    if (repo) {
      const file = importTranscript(root, repo);
      if (file) console.log(`Journal reconstitué depuis la session : ${file.slice(root.length + 1)} (à committer avec le reste).`);
    }
    let files = branchFiles(git);
    // A root commit has no parent: git's « invalid object name » there is expected, not for the owner's log.
    const since = upstreamSince((args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    const up = upstreamUpdate(files, read, { repo, since, comments: (r, n) => defaultGh(`repos/${r}/issues/${n}/comments`) });
    if (up) {
      appendFileSync(join(root, up.file), JSON.stringify({ t: new Date().toISOString(), ...up.entry }) + '\n');
      console.log('Journal : preuve relevée : committe `.factory/journal/`.');
      files = branchFiles(git);
    }
    if (!files.some((f) => JOURNAL.test(f))) console.log('Journal : aucun journal pour ce run. Lance ce contrôle depuis le dossier du projet, puis committe .factory/journal/.');
    else console.log(report(files, read, stages, runOptions(files, read)));
  } catch (e) {
    console.log(`Journal : contrôle impossible (${e.message}).`);
  }
}
