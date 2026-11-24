#!/usr/bin/env node
// Issue #550: proof that the upstream thinking (questions, spec, project sheet) was done by a sub-agent of role `plan`.
// Before publishing, the pilot runs `node .factory/scripts/upstream.mjs <n>` from the project's folder: it reads the
// run's journal and prints a hidden line naming the model that did the thinking, to end the comment with. At build
// time journal-check.mjs reads the issue's comments back (upstreamEntry) and journals what it found.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJournal, upstreamAgent } from './fabrication.mjs';
import { trusted } from './specs.mjs';

const JOURNAL = /^\.factory\/journal\/[^/]+\.jsonl$/;
const MARKER = /<!-- factory-upstream stage=([\w-]+) model=([\w.-]+) role=(plan|review) -->/;
const DOC_MARKS = { spec: /^<!-- factory-spec -->\s*$/m, brief: /^<!-- factory-brief -->\s*$/m };

// Longer than any run: a spec published by a run that started just before the script reached the project is not blamed.
export const UPSTREAM_GRACE_MS = 3 * 3600_000;

export function upstreamMarker(run) {
  const a = run ? upstreamAgent(run) : null;
  return a ? `<!-- factory-upstream stage=${run.stage} model=${a.model} role=${a.role} -->` : null;
}

export function readUpstream(body) {
  const m = MARKER.exec(String(body || ''));
  return m ? { stage: m[1], model: m[2], role: m[3] } : null;
}

// What the issue's comments prove: only the latest version of the document decides; `by` lists every marked comment.
export function upstreamProof(comments, { doc = 'spec', since = null, owner = null } = {}) {
  const ok = (comments || []).filter((c) => owner == null || trusted(c, owner));
  const by = [];
  for (const c of ok) {
    const m = readUpstream(c.body);
    if (m && !by.some((b) => b.model === m.model && b.role === m.role)) by.push({ model: m.model, role: m.role });
  }
  const latest = ok.filter((c) => DOC_MARKS[doc].test(String(c.body || ''))).at(-1);
  let status;
  if (!latest) status = 'none';
  else if (readUpstream(latest.body)) status = 'proved';
  else if (since && Date.parse(latest.created_at) > Date.parse(since) + UPSTREAM_GRACE_MS) status = 'unproved';
  else status = 'old';
  return { kind: 'upstream', doc, status, by };
}

// The journal whose last « run » entry is the most recent (on `issue` when given).
export function latestRun(files, readFile, { issue = null } = {}) {
  let best = null;
  for (const file of files.filter((x) => JOURNAL.test(x))) {
    const text = readFile(file);
    const run = String(text || '').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e?.kind === 'run').at(-1);
    if (!run || (issue != null && Number(run.issue) !== Number(issue))) continue;
    if (!best || Date.parse(run.t) > Date.parse(best.run.t)) best = { file, run, text };
  }
  return best;
}

export function upstreamEntry(run, comments, { since = null, owner = null } = {}) {
  const doc = { build: 'spec', foundation: 'brief' }[run?.stage];
  if (!doc || run.issue == null) return null;
  if (comments == null) return { kind: 'upstream', doc, status: 'unread', by: [] };
  return upstreamProof(comments, { doc, since, owner });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const n = process.argv[2];
  const root = process.cwd();
  const refuse = () => {
    console.log(`Phase amont : aucun sous-agent du rôle \`plan\` n'a été lancé dans ce run pour la demande #${n}. Lance-le (« Phase amont » dans AGENT.md), puis relance cette commande. Ne publie rien avant.`);
    process.exit(1);
  };
  if (!/^\d+$/.test(n || '')) refuse();
  // Hooks are not loaded when the routine serves several projects: rebuild the journal from the transcript.
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const { repoFromRemote } = await import('./specs.mjs');
    const { importTranscript } = await import('./transcript.mjs');
    importTranscript(root, repoFromRemote(remote));
  } catch { /* no remote or no transcript: the hooks' journal is all there is */ }
  let files = [];
  try { files = readdirSync(join(root, '.factory/journal')).map((f) => `.factory/journal/${f}`); } catch { /* no journal */ }
  const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return null; } };
  const best = latestRun(files, read, { issue: Number(n) });
  const marker = best ? upstreamMarker(parseJournal([best.text]).at(-1)) : null;
  if (!marker) refuse();
  console.log(marker);
}
