#!/usr/bin/env node
// Claude Code hook: records what the agent really did (skills loaded, test runs) in .factory/journal/.
// Installed by scripts/sync.mjs into .claude/settings.json. It never blocks the agent: it always exits 0.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot, rememberRoot, sessionRoot } from './run-root.mjs';

const RUNNER = /^(?:(?:npx|bunx|pnpm (?:exec|dlx)|yarn)\s+)?(?:vitest|jest|playwright test|node --test|pytest|python3? -m (?:pytest|unittest))\b|^(?:npm|pnpm|yarn|bun)(?: run)? test(?::[\w-]+)?(?:\s|$)/;
const PREFIX = /^(?:cd\s+\S+|[A-Z_][A-Z0-9_]*=\S*|timeout\s+\S+|env|time|CI=\S+)\s*/;

// A Bash command runs the tests when one of its commands starts with a test runner. The text of a heredoc
// (a file being written that merely mentions vitest) does not count.
export function isTestCommand(cmd = '') {
  const code = String(cmd).replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '');
  return code.split(/&&|\|\||[;|\n()]/).some((part) => {
    let p = part.trim();
    for (let prev = null; prev !== p;) { prev = p; p = p.replace(PREFIX, ''); }
    return RUNNER.test(p);
  });
}
// Case matters: node --test prints « # fail 0 » on a green run.
export const FAILED_TEXT = /(\b[1-9]\d* (?:failed|failing)\b|\bFAIL\b|Tests?:\s+[1-9]\d* failed|^not ok\b|^# fail [1-9]|\bERR!|exit code [1-9])/m;

// The run JSON ({"repo","issue","pr","stage"}) is somewhere in the first prompt of the run.
export function runFromPrompt(prompt = '') {
  const text = String(prompt);
  // Every balanced {...} block, outermost first, until one parses as a run (it may hold nested objects).
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}' && --depth === 0) {
        try {
          const o = JSON.parse(text.slice(i, j + 1));
          if (o && typeof o.stage === 'string') return { stage: o.stage, issue: o.issue ?? null, pr: o.pr ?? null, ...(o.repo ? { repo: o.repo } : {}) };
        } catch { /* not JSON */ }
        break;
      }
    }
  }
  return null;
}

function responseFailed(res) {
  if (res == null) return false;
  if (typeof res === 'string') return FAILED_TEXT.test(res);
  for (const k of ['exitCode', 'exit_code', 'code', 'returnCode']) if (typeof res[k] === 'number') return res[k] !== 0;
  if (res.interrupted === true || res.is_error === true) return true;
  return FAILED_TEXT.test([res.stdout, res.stderr, res.output].filter(Boolean).join('\n'));
}

// One hook input -> one journal entry, or null when there is nothing worth keeping.
export function entryFor(input, now = new Date()) {
  const t = now.toISOString();
  const ev = input.hook_event_name;
  if (ev === 'UserPromptSubmit') {
    const run = runFromPrompt(input.prompt);
    return run ? { t, kind: 'run', ...run } : null;
  }
  if (input.tool_name === 'Skill' && ev === 'PostToolUse') {
    const i = input.tool_input || {};
    const name = i.skill || i.name || i.command;
    return name ? { t, kind: 'skill', name: String(name) } : null;
  }
  if (input.tool_name === 'Bash' && (ev === 'PostToolUse' || ev === 'PostToolUseFailure')) {
    const cmd = String(input.tool_input?.command || '');
    if (!isTestCommand(cmd)) return null;
    const ok = ev === 'PostToolUse' && !responseFailed(input.tool_response);
    return { t, kind: 'test', cmd: cmd.slice(0, 200), ok };
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const entry = entryFor(input);
    if (entry) {
      const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || '.';
      const session = String(input.session_id || 'session').replace(/[^\w-]/g, '').slice(0, 36);
      let root;
      if (entry.kind === 'run') { root = findRoot(projectDir, entry.repo); rememberRoot(session, root); } else root = sessionRoot(session, projectDir);
      const dir = join(root, '.factory/journal');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${session}.jsonl`);
      // Each clone's settings carry the hook, so one call can reach it twice: keep it once.
      const id = input.tool_use_id ? String(input.tool_use_id) : null;
      let seen = '';
      try { seen = readFileSync(file, 'utf8'); } catch { /* new file */ }
      const dup = id ? seen.includes(`"id":${JSON.stringify(id)}`) : entry.kind === 'run' && seen.split('\n').some((l) => l.includes('"kind":"run"') && l.includes(`"stage":${JSON.stringify(entry.stage)}`));
      if (!dup) appendFileSync(file, JSON.stringify(id ? { ...entry, id } : entry) + '\n');
    }
  } catch { /* never block the agent */ }
  process.exit(0);
}
