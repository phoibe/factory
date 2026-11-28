// What a run consumed (issue #628), read from Claude Code's own record of the session at the end of the run and
// written to usage/YYYY-MM.json on the branch claude/factory-usage of the project, where the « Consommation » page
// reads it. One record per session: running it twice replaces the first.
//
//   node .factory/scripts/usage.mjs [--dry-run]     (from the project folder; --dry-run prints the record only)
//
// Record: { at, issue, stage, size, tasks: [{ type, kind, model, effort }], use: [[hour, task, model, input, cw5, cw1,
// cacheRead, output]] }. tasks[0] is the pilot (the session itself), the others its sub-agents.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultGh, repoFromRemote } from './specs.mjs';
import { findTranscript, fromTranscript } from './transcript.mjs';

export const BRANCH = 'claude/factory-usage';
export const KEEP_MONTHS = 3;

// The kind of each task, per role: a sub-agent's description says it as [kind:<id>] after its role (agent/AGENT.md).
export const KINDS = {
  plan: ['questions', 'plan', 'bug', 'framing', 'other'],
  code: ['build', 'task-review', 'design-critique', 'review-fix', 'owner-fix', 'checks-fix', 'other'],
  review: ['final-review', 'review-round', 'scope-check', 'security', 'audit', 'other'],
  audit: ['parts', 'history', 'other'],
  simple: ['research', 'screenshots', 'other'],
  pilot: ['questions', 'build', 'fixes', 'audit', 'other'],
};

const ROLE_TAG = /^\s*\[\s*role\s*:\s*(plan|code|review|audit|simple)\s*(?::\s*(amont)\s*)?\]/i;
const KIND_TAG = /^\s*\[\s*kind\s*:\s*([\w-]+)\s*\]/i;
const EFFORTS = ['low', 'medium', 'high'];

// The announced kind when it belongs to the role, else the one its stage implies.
export function kindOf({ role, up = false, label = '', stage = '' }) {
  const tag = KIND_TAG.exec(String(label || ''));
  const said = tag?.[1].toLowerCase();
  if (said && KINDS[role]?.includes(said)) return said;
  const text = String(label || '').replace(KIND_TAG, '').trim();
  const at = (...stages) => stages.includes(stage);
  if (role === 'plan') {
    if (up && at('grilling', 'spec')) return 'questions';
    if (up && at('bugfix')) return 'bug';
    if (up && at('framing')) return 'framing';
    if (at('build', 'bugfix')) return 'plan';
  } else if (role === 'code') {
    if (at('fix-checks')) return 'checks-fix';
    if (at('feedback', 'visual-fix', 'acceptance-fix')) return 'owner-fix';
    if (at('build', 'bugfix', 'foundation')) return 'build';
  } else if (role === 'review') {
    if (at('audit')) return 'audit';
  } else if (role === 'audit') {
    return /^Historique/i.test(text) ? 'history' : 'parts';
  } else if (role === 'simple') {
    if (at('screenshots')) return 'screenshots';
  }
  return 'other';
}

export function pilotKind(stage) {
  if (['grilling', 'spec'].includes(stage)) return 'questions';
  if (['build', 'bugfix', 'foundation'].includes(stage)) return 'build';
  if (['feedback', 'fix-checks', 'visual-fix', 'acceptance-fix', 'update-branch', 'resume', 'skills-fix'].includes(stage)) return 'fixes';
  if (['audit', 'ui-polish'].includes(stage)) return 'audit';
  return 'other';
}

const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };

// The billed messages of one file: one per message id, sub-agent copies and synthetic messages left out.
function messages(lines, { skip = new Set(), sidechain = true } = {}) {
  const out = [];
  for (const o of lines.map(parse)) {
    const m = o?.message;
    if (o?.type !== 'assistant' || !m?.usage || !m.model || m.model === '<synthetic>') continue;
    if (!sidechain && o.isSidechain === true) continue;
    if (m.id && skip.has(m.id)) continue;
    const at = new Date(o.timestamp);
    if (Number.isNaN(at.getTime())) continue;
    if (m.id) skip.add(m.id);
    const u = m.usage;
    const split = u.cache_creation && typeof u.cache_creation === 'object';
    const tokens = [
      u.input_tokens,
      split ? u.cache_creation.ephemeral_5m_input_tokens : u.cache_creation_input_tokens,
      split ? u.cache_creation.ephemeral_1h_input_tokens : 0,
      u.cache_read_input_tokens,
      u.output_tokens,
    ].map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
    out.push({ at, hour: at.toISOString().slice(0, 13), model: String(m.model), effort: o.effort ?? null, tokens });
  }
  return out;
}

const mostFrequent = (values) => {
  const count = new Map();
  for (const v of values) if (v != null) count.set(v, (count.get(v) || 0) + 1);
  let best = null;
  for (const [v, n] of count) if (best === null || n > count.get(best)) best = v;
  return best;
};
const effortOf = (v) => (EFFORTS.includes(v) ? v : null);
const firstTime = (lines) => { for (const o of lines.map(parse)) if (o?.timestamp) return String(o.timestamp); return ''; };

// Pure: the tasks of a session and its tokens per hour, task and model.
export function usageFromTranscript({ main = [], subagents = [], stage = '' }) {
  const seen = new Set();
  const subs = subagents.map((s, i) => ({ ...s, i, t: firstTime(s.lines || []) }))
    .sort((a, b) => a.t.localeCompare(b.t) || a.i - b.i)
    .map((s) => ({ ...s, msgs: messages(s.lines || [], { skip: seen }) }));
  const pilot = messages(main, { skip: seen, sidechain: false });
  const tasks = [];
  const rows = new Map();
  const add = (msgs, task) => {
    const index = tasks.length;
    const byModel = new Map();
    for (const m of msgs) {
      const key = `${m.hour}\u0000${m.model}`;
      const row = rows.get(`${key}\u0000${index}`) || [m.hour, index, m.model, 0, 0, 0, 0, 0];
      m.tokens.forEach((n, k) => { row[3 + k] += n; });
      rows.set(`${key}\u0000${index}`, row);
      byModel.set(m.model, (byModel.get(m.model) || 0) + m.tokens.reduce((a, b) => a + b, 0));
    }
    let model = '';
    for (const [id, n] of byModel) if (!model || n > byModel.get(model)) model = id;
    tasks.push({ ...task, model, effort: effortOf(task.effort ?? mostFrequent(msgs.map((m) => m.effort))) });
  };
  add(pilot, { type: 'pilot', kind: pilotKind(stage), effort: undefined });
  for (const s of subs) {
    if (!s.msgs.some((m) => m.tokens.some((n) => n > 0))) continue;
    const desc = String(s.meta?.description || '');
    const tag = ROLE_TAG.exec(desc);
    const role = tag ? tag[1].toLowerCase() : 'code';
    const label = tag ? desc.slice(tag[0].length).trim() : desc.trim();
    add(s.msgs, { type: role, kind: kindOf({ role, up: Boolean(tag?.[2]), label, stage }), effort: effortOf(s.meta?.effort) ?? undefined });
  }
  const use = [...rows.values()].sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1] || a[2].localeCompare(b[2]));
  return { tasks: tasks.map(({ type, kind, model, effort }) => ({ type, kind, model, effort })), use };
}

// Only a feature has a size: the last estimate of its body and comments.
export function sizeOf(issue, comments = []) {
  const labels = (issue?.labels || []).map((l) => (typeof l === 'string' ? l : l?.name));
  if (!labels.includes('factory:feature')) return null;
  let size = null;
  for (const text of [issue.body, ...(comments || []).map((c) => c?.body)]) {
    for (const m of String(text || '').matchAll(/<!--\s*factory-estimate\b[^>]*?\bsize=(small|medium|large)\b[^>]*-->/g)) size = m[1];
  }
  return size;
}

export function mergeRun(month, session, run) {
  return { v: 1, runs: { ...(month?.runs || {}), [session]: run } };
}

// Month files older than KEEP_MONTHS months before the month of `now`.
export function expiredMonths(fileNames, now) {
  const d = new Date(now);
  const cut = d.getUTCFullYear() * 12 + d.getUTCMonth() - KEEP_MONTHS;
  return fileNames.filter((f) => {
    const m = /^(\d{4})-(\d{2})\.json$/.exec(f);
    return m && Number(m[1]) * 12 + Number(m[2]) - 1 < cut;
  });
}

const readLines = (p) => { try { return readFileSync(p, 'utf8').split('\n').filter(Boolean); } catch { return []; } };

function subagentsOf(transcript) {
  const dir = join(dirname(transcript), basename(transcript, '.jsonl'), 'subagents');
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort(); } catch { return []; }
  return files.map((f) => {
    let meta = {};
    try { meta = JSON.parse(readFileSync(join(dir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')); } catch { /* no meta */ }
    return { lines: readLines(join(dir, f)), meta };
  });
}

const defaultGit = (cwd) => (args, at) => execFileSync('git', args, { cwd: at || cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Reads this session's transcript and writes its record; with dryRun, only returns it.
export function recordUsage({ cwd = process.cwd(), projectsDir, now = new Date(), gh = defaultGh, git = defaultGit(cwd), dryRun = false } = {}) {
  const repo = repoFromRemote(git(['config', '--get', 'remote.origin.url']));
  const transcript = findTranscript(repo, projectsDir ? { projectsDir } : {});
  if (!transcript) throw new Error(`aucun relevé de session récent pour ${repo}`);
  const session = basename(transcript, '.jsonl').replace(/[^\w-]/g, '').slice(0, 36);
  const main = readLines(transcript);
  const first = fromTranscript(main).find((e) => e.kind === 'run');
  const stage = first?.stage || 'other';
  const issue = Number.isInteger(first?.issue) ? first.issue : null;
  const subagents = subagentsOf(transcript);
  const { tasks, use } = usageFromTranscript({ main, subagents, stage });
  let size = null;
  if (issue !== null) {
    try { size = sizeOf(gh(`repos/${repo}/issues/${issue}`), gh(`repos/${repo}/issues/${issue}/comments`)); } catch { size = null; }
  }
  const last = main.concat(...subagents.map((s) => s.lines)).map(parse)
    .filter((o) => o?.type === 'assistant' && o.message?.usage).map((o) => new Date(o.timestamp)).filter((d) => !Number.isNaN(d.getTime()))
    .reduce((a, b) => (b > a ? b : a), null);
  const run = { at: (last || new Date(now)).toISOString(), issue, stage, size, tasks, use };
  if (dryRun) return { session, run, pushed: false };
  return { session, run, pushed: publish({ git, session, run, now }) };
}

// Same pattern as `shots.mjs publish`: a temporary worktree on the branch (an orphan on first use). A refused push
// (another run wrote meanwhile) starts again from the remote, the record re-applied on top.
function publish({ git, session, run, now }) {
  const month = run.at.slice(0, 7);
  const wt = mkdtempSync(join(tmpdir(), 'factory-usage-'));
  rmSync(wt, { recursive: true, force: true });
  // FETCH_HEAD belongs to the worktree that fetched: the retries fetch from the temporary one.
  const fetch = (at) => { try { git(['fetch', '--quiet', 'origin', BRANCH], at); return true; } catch { return false; } };
  const exists = fetch();
  if (exists) git(['worktree', 'add', '--quiet', '--detach', wt, 'FETCH_HEAD']);
  else {
    git(['worktree', 'add', '--quiet', '--detach', wt]);
    git(['checkout', '--quiet', '--orphan', BRANCH], wt);
    git(['rm', '-rf', '--quiet', '--ignore-unmatch', '.'], wt);
  }
  const apply = () => {
    const dir = join(wt, 'usage');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${month}.json`);
    let current = null;
    try { current = JSON.parse(readFileSync(file, 'utf8')); } catch { /* new month */ }
    writeFileSync(file, `${JSON.stringify(mergeRun(current, session, run))}\n`);
    for (const f of expiredMonths(readdirSync(dir), now)) rmSync(join(dir, f));
    git(['add', '--all', 'usage'], wt);
    if (!git(['status', '--porcelain'], wt)) return false;
    git(['commit', '--quiet', '-m', `chore: usage of session ${session}`], wt);
    return true;
  };
  try {
    if (!apply()) return false;
    for (let attempt = 1; ; attempt++) {
      try { git(['push', '--quiet', 'origin', `HEAD:refs/heads/${BRANCH}`], wt); return true; } catch (e) {
        if (attempt >= 5 || !fetch(wt)) throw e;
        git(['reset', '--quiet', '--hard', 'FETCH_HEAD'], wt);
        if (!apply()) return false;
      }
    }
  } finally {
    try { git(['worktree', 'remove', '--force', wt]); } catch { rmSync(wt, { recursive: true, force: true }); }
    if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const { run } = recordUsage({ dryRun });
    console.log(dryRun ? JSON.stringify(run, null, 2) : `Consommation notée : ${run.tasks.length} tâches.`);
  } catch (e) {
    console.error(`Consommation : ${e.message}`);
    process.exit(1);
  }
}
