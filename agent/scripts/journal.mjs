#!/usr/bin/env node
// Claude Code hook: records what the agent really did (skills loaded, test runs) in .factory/journal/.
// Installed by scripts/sync.mjs into .claude/settings.json. It never blocks the agent: it always exits 0.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_COMMAND = /\b(vitest|jest|playwright test|node --test|(npm|pnpm|yarn|bun)( run)? test(:[\w-]+)?)\b/;
const FAILED_TEXT = /(\b[1-9]\d* (failed|failing)\b|\bFAIL\b|Tests?:\s+[1-9]\d* failed|^not ok\b|\bERR!|exit code [1-9])/im;

// The run JSON ({"repo","issue","pr","stage"}) is somewhere in the first prompt of the run.
export function runFromPrompt(prompt = '') {
  const m = /\{[^{}]*"stage"\s*:\s*"[^"]+"[^{}]*\}/.exec(prompt);
  if (!m) return null;
  try {
    const { stage, issue = null, pr = null } = JSON.parse(m[0]);
    return { stage, issue, pr };
  } catch { return null; }
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
    if (!TEST_COMMAND.test(cmd)) return null;
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
      const dir = join(process.env.CLAUDE_PROJECT_DIR || input.cwd || '.', '.factory/journal');
      mkdirSync(dir, { recursive: true });
      const session = String(input.session_id || 'session').replace(/[^\w-]/g, '').slice(0, 36);
      appendFileSync(join(dir, `${session}.jsonl`), JSON.stringify(entry) + '\n');
    }
  } catch { /* never block the agent */ }
  process.exit(0);
}
