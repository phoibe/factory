#!/usr/bin/env node
// Claude Code hook: the lock. A build, bugfix or foundation run cannot open its PR (nor hand it to the next
// step with factory:checks / factory:visual-review) while its journal lacks a step, and it is sent back once
// when it tries to stop early. Installed by scripts/sync.mjs. After MAX_DENIALS refusals in one run it lets
// the agent through (the relay's catch-up run and the PR alert remain), so a run can never be stuck.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { branchFiles, problems } from './journal-check.mjs';
import { sessionRoot } from './run-root.mjs';

export const MAX_DENIALS = 3;
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g;

// Does this tool call open a PR, or hand it to the next step?
export function handsOver(tool, input = {}) {
  if (/create_pull_request$/.test(tool || '')) return true;
  if (/(add|update)_(issue_)?labels?$|issue_write$/.test(tool || '')) return /factory:(checks|visual-review)/.test(JSON.stringify(input));
  if (tool !== 'Bash') return false;
  const cmd = String(input.command || '').replace(HEREDOC, '');
  if (/\bgh\s+pr\s+create\b/.test(cmd)) return true;
  if (/\bgh\s+pr\s+edit\b[^\n]*--add-label[^\n]*factory:(checks|visual-review)/.test(cmd)) return true;
  if (/(gh\s+api|curl)\b[^\n]*\blabels\b[^\n]*factory:(checks|visual-review)/.test(cmd)) return true;
  const posts = /(\s-[fFd]\s|\s--(field|raw-field|input|data[\w-]*)\b|-X\s*POST|--method\s+POST|--request\s+POST)/;
  return /(gh\s+api|curl)\b[^\n]*\/pulls(?=$|[\s'"?])/m.test(cmd) && cmd.split('\n').some((l) => /\/pulls(?=$|[\s'"?])/.test(l) && posts.test(l));
}

const entries = (text) => String(text || '').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// The hook's answer for one input, or null to let it through. `env` gives the files, the journal and config.
export function decide(input, { files, read, stages, sessionText }) {
  const ev = input.hook_event_name;
  const runEntry = entries(sessionText).filter((e) => e.kind === 'run').at(-1);
  if (!runEntry) return null; // not a factory run
  const denials = entries(sessionText).filter((e) => e.kind === 'gate').length;
  if (denials >= MAX_DENIALS) return null;
  const opts = { stage: runEntry.stage, current: sessionText };
  if (ev === 'PreToolUse') {
    if (!handsOver(input.tool_name, input.tool_input)) return null;
    const list = problems(files, read, stages, opts);
    if (!list.length) return null;
    const reason = ['Verrou de la factory : la PR ne peut pas avancer, ces étapes manquent dans le journal :', ...list.map((l) => `- ${l}`),
      'Fais-les (avec l\'outil Skill), commit, puis réessaie.'].join('\n');
    return { gate: true, out: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } } };
  }
  if (ev === 'Stop') {
    if (input.stop_hook_active) return null;
    if (!files.some((f) => !f.startsWith('.factory/journal/'))) return null; // nothing built yet (a question, a block)
    const list = problems(files, read, stages, opts);
    if (!list.length) return null;
    const reason = ['Verrou de la factory : avant de t\'arrêter, ces étapes manquent dans le journal :', ...list.map((l) => `- ${l}`),
      "Fais-les, puis termine le run comme prévu. Si tu t'arrêtes exprès (question au propriétaire, blocage expliqué sur l'issue), arrête-toi simplement."].join('\n');
    return { gate: true, out: { decision: 'block', reason } };
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const session = String(input.session_id || 'session').replace(/[^\w-]/g, '').slice(0, 36);
    const root = sessionRoot(session, process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
    const sessionPath = join(root, '.factory/journal', `${session}.jsonl`);
    if (existsSync(sessionPath)) {
      const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return null; } };
      const cfg = join(root, '.factory/config.resolved.json');
      const stages = existsSync(cfg) ? JSON.parse(readFileSync(cfg, 'utf8')).stages || {} : {};
      const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
      const res = decide(input, { files: branchFiles(git), read, stages, sessionText: read(`.factory/journal/${session}.jsonl`) });
      const id = input.tool_use_id ? String(input.tool_use_id) : null;
      const counted = id && read(`.factory/journal/${session}.jsonl`).includes(`"id":${JSON.stringify(id)}`);
      if (res) {
        // Each clone's settings carry the hook: the same refusal reached twice counts once.
        if (!counted) appendFileSync(sessionPath, JSON.stringify({ t: new Date().toISOString(), kind: 'gate', event: input.hook_event_name, ...(id ? { id } : {}) }) + '\n');
        process.stdout.write(JSON.stringify(res.out));
      }
    }
  } catch { /* never break the agent: on any error, let it through */ }
  process.exit(0);
}
