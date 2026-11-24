#!/usr/bin/env node
// The agent's sign of life (yolivesound #115). The factory takes an agent for dead when its lock (`factory:running`)
// is older than LOCK_MINUTES, and starts a second one. A routine session has no time limit, so a long build that is
// still working was about to be doubled. While it works, this note on the card's « Dernier lancement » comment says
// so: the factory keeps the lock as long as the note is recent (scripts/relay/state.mjs, up to a ceiling).
//
// Called by the journal hook after the agent's tools (Bash, Skill, Agent). At most once every BEAT_MINUTES, it edits
// the comment in a detached process, so the agent never waits. An edit triggers no factory run (only new comments do).
// Every failure is silent: without the note, the factory simply keeps its time limit.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trusted } from './specs.mjs';

export const SESSION_MARKER = '<!-- factory-session -->';
export const BEAT_MINUTES = 10;
const ALIVE = /<!-- factory-alive (\S+) -->/;

// The time of the last sign of life a comment carries, in ms, or null.
export function aliveAt(body) {
  const m = ALIVE.exec(String(body || ''));
  const t = m ? Date.parse(m[1]) : NaN;
  return Number.isFinite(t) ? t : null;
}

// The comment's text with its sign of life set to `iso` (one note, replaced in place).
export function markAlive(body, iso) {
  const text = String(body || '');
  const note = `<!-- factory-alive ${iso} -->`;
  return ALIVE.test(text) ? text.replace(ALIVE, note) : `${text}\n${note}`;
}

// The run this session works on ({repo, issue, pr}), from the first `run` entry of its journal, or null.
export function runOf(journalText) {
  for (const line of String(journalText || '').split('\n')) {
    try {
      const e = JSON.parse(line);
      if (e?.kind === 'run' && e.repo && (e.issue || e.pr)) return { repo: e.repo, issue: e.issue ?? null, pr: e.pr ?? null };
    } catch { /* not a line */ }
  }
  return null;
}

// Whether a beat is due, given the time of the last one (ms, or null).
export const beatDue = (last, now) => last === null || now - last >= BEAT_MINUTES * 60_000;

// Called by the hook: decides, stamps, and leaves the GitHub calls to a detached process.
export function heartbeat({ session, journalFile, now = Date.now(), launch = detached }) {
  const dir = join(tmpdir(), 'factory-runs');
  const stamp = join(dir, `${String(session || 'session').replace(/[^\w-]/g, '').slice(0, 36)}.alive`);
  let last = null;
  try { last = Number(readFileSync(stamp, 'utf8')) || null; } catch { /* first beat */ }
  if (!beatDue(last, now)) return false;
  let run = null;
  try { run = runOf(readFileSync(journalFile, 'utf8')); } catch { /* no journal yet */ }
  if (!run) return false;
  mkdirSync(dir, { recursive: true });
  writeFileSync(stamp, String(now));
  launch(run, new Date(now).toISOString());
  return true;
}

function detached(run, iso) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--beat', JSON.stringify({ ...run, iso })], { detached: true, stdio: 'ignore' });
  child.unref();
}

// The GitHub part: the « Dernier lancement » comment of the issue and of the PR gets the new time. `gh` is the
// agent's own GitHub access (REST only, see AGENT.md).
export function beat({ repo, issue, pr, iso }, gh = (args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] })) {
  const owner = String(repo || '').split('/')[0];
  for (const n of [issue, pr].filter(Boolean)) {
    try {
      const comments = JSON.parse(gh(['api', `repos/${repo}/issues/${n}/comments?per_page=100`]) || '[]');
      // Only the factory's own comment, as the relay reads it: on a public project anyone can post the marker.
      const mine = comments.find((c) => String(c.body || '').includes(SESSION_MARKER) && trusted(c, owner));
      if (mine) gh(['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${mine.id}`, '-f', `body=${markAlive(mine.body, iso)}`]);
    } catch { /* silent: the factory keeps its time limit */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--beat') {
  try { beat(JSON.parse(process.argv[3] || '{}')); } catch { /* silent */ }
  process.exit(0);
}
