// Fallback journal, read from Claude Code's own record of the session. A routine that serves several
// projects starts in their parent folder, where Claude Code does not load the projects' hooks: nothing is
// journaled live. The transcript (~/.claude/projects/<folder>/<session>.jsonl) still holds every tool call
// and its result, written by Claude Code itself, so the journal is rebuilt from it.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { FAILED_TEXT, agentEntry, isTestCommand, runFromPrompt } from './journal.mjs';

const text = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (typeof b === 'string' ? b : b?.text || '')).join('\n') : '');

// Transcript lines -> journal entries ({kind: run | skill | test | agent}), oldest first.
export function fromTranscript(lines) {
  const out = [];
  const tests = new Map();
  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const t = o.timestamp || null;
    const content = o.message?.content;
    if (o.type === 'user') { // each routine prompt starts a run (tool results carry no text blocks)
      const run = runFromPrompt(text(content));
      if (run) out.push({ t, kind: 'run', ...run });
    }
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type === 'tool_use' && b.name === 'Skill') {
        const name = b.input?.skill || b.input?.name || b.input?.command;
        if (name) out.push({ t, kind: 'skill', name: String(name), id: b.id });
      } else if (b?.type === 'tool_use' && agentEntry({ tool_name: b.name })) {
        out.push({ t, ...agentEntry({ tool_name: b.name, tool_input: b.input }), id: b.id });
      } else if (b?.type === 'tool_use' && b.name === 'Bash' && isTestCommand(String(b.input?.command || ''))) {
        const e = { t, kind: 'test', cmd: String(b.input.command).slice(0, 200), ok: false, id: b.id };
        tests.set(b.id, e);
        out.push(e);
      } else if (b?.type === 'tool_result' && tests.has(b.tool_use_id)) {
        tests.get(b.tool_use_id).ok = b.is_error !== true && !FAILED_TEXT.test(text(b.content));
      }
    }
  }
  return out;
}

// The newest transcript of a run on `repo`, among the sessions of the last `maxAgeMs`.
export function findTranscript(repo, { projectsDir = join(homedir(), '.claude/projects'), now = Date.now(), maxAgeMs = 12 * 3600_000 } = {}) {
  const needle = JSON.stringify(repo).slice(1, -1);
  let best = null;
  for (const dir of (existsSync(projectsDir) ? readdirSync(projectsDir) : [])) {
    const full = join(projectsDir, dir);
    let files = [];
    try { files = readdirSync(full).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const p = join(full, f);
      const m = statSync(p).mtimeMs;
      if (now - m > maxAgeMs || (best && best.m >= m)) continue;
      const head = readFileSync(p, 'utf8').slice(0, 200_000);
      if (head.includes(needle) && /\\?"stage\\?"/.test(head)) best = { p, m };
    }
  }
  return best?.p || null;
}

// Writes .factory/journal/<session>.jsonl from the transcript when the hooks wrote nothing for this run.
export function importTranscript(root, repo, opts = {}) {
  const p = findTranscript(repo, opts);
  if (!p) return null;
  const session = basename(p, '.jsonl').replace(/[^\w-]/g, '').slice(0, 36);
  const file = join(root, '.factory/journal', `${session}.jsonl`);
  if (existsSync(file) && readFileSync(file, 'utf8').includes('"kind":"run"')) return file; // the hooks did it
  const entries = fromTranscript(readFileSync(p, 'utf8').split('\n'));
  if (!entries.some((e) => e.kind === 'run')) return null;
  mkdirSync(join(root, '.factory/journal'), { recursive: true });
  writeFileSync(file, entries.map((e) => JSON.stringify({ ...e, source: 'transcript' })).join('\n') + '\n');
  return file;
}
