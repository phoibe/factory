#!/usr/bin/env node
// Claude Code hook: the lock. A build, bugfix, foundation or audit run cannot open its PR (nor hand it to the next
// step with factory:checks / factory:visual-review) while its journal lacks a step, nor open it without saying what
// was tried in real conditions (issue #385), and it is sent back once
// when it tries to stop early. Installed by scripts/sync.mjs. After MAX_DENIALS refusals in one run it lets
// the agent through (the relay's catch-up run and the PR alert remain), so a run can never be stuck.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { branchFiles, GATED, problems } from './journal-check.mjs';
import { sessionRoot } from './run-root.mjs';
import { brokenShotRows } from './shots.mjs';

export const MAX_DENIALS = 3;
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g;

// A command continued with a backslash is one line for the shell: join it before matching.
const commandOf = (input) => String(input?.command || '').replace(HEREDOC, '').replace(/\\\r?\n/g, ' ');

// Does this tool call open a PR? A read of the pull requests does not: -X GET with -f filters, or a query string
// (`/pulls?head=…`, often inside $(…) to find the PR number) that a POST opening a PR never carries.
export function opensPr(tool, input = {}) {
  if (/create_pull_request$/.test(tool || '')) return true;
  if (tool !== 'Bash') return false;
  const cmd = commandOf(input);
  if (/\bgh\s+pr\s+create\b/.test(cmd)) return true;
  const posts = /(\s-[fFd]\s|\s--(field|raw-field|input|data[\w-]*)\b|-X\s*POST|--method[\s=]+POST|--request[\s=]+POST)/;
  const reads = /(-X\s*|--method[\s=]+|--request[\s=]+)GET\b/;
  // Each gh api / curl call on its own, so a read chained to an opening does not hide it.
  const calls = cmd.split('\n').flatMap((l) => l.split(/(?=\b(?:gh\s+api|curl)\b)/));
  return calls.some((c) => /^(gh\s+api|curl)\b.*\/pulls(?=$|[\s'"])/.test(c) && posts.test(c) && !reads.test(c));
}

// Does this tool call open a PR, or hand it to the next step?
export function handsOver(tool, input = {}) {
  if (opensPr(tool, input)) return true;
  if (/(add|update)_(issue_)?labels?$|issue_write$/.test(tool || '')) return /factory:(checks|visual-review)/.test(JSON.stringify(input));
  if (tool !== 'Bash') return false;
  const cmd = commandOf(input);
  if (/\bgh\s+pr\s+edit\b[^\n]*--add-label[^\n]*factory:(checks|visual-review)/.test(cmd)) return true;
  return /(gh\s+api|curl)\b[^\n]*\blabels\b[^\n]*factory:(checks|visual-review)/.test(cmd);
}

// The texts a tool call may post as a message: the command itself (heredocs included), the files it sends with
// body=@file, --input file or $(cat file), and the body of a GitHub MCP call.
export function postedTexts(tool, input = {}, { readFile = () => null, cwd = '.' } = {}) {
  if (tool !== 'Bash') return /^mcp__github__/.test(tool || '') ? [input.body, input.comment].filter((x) => typeof x === 'string') : [];
  const cmd = String(input.command || '');
  if (!/\b(gh\s+(api|pr|issue)|curl)\b/.test(cmd)) return [];
  const paths = [...cmd.matchAll(/=@(['"]?)([^\s'"]+)\1|--input\s+(['"]?)([^\s'"]+)\3|\$\((?:cat\s+|<\s*)(['"]?)([^\s'")]+)\5\s*\)/g)]
    .map((m) => m[2] || m[4] || m[6]).filter((f) => f && f !== '-');
  // curl -d @file, --data-binary @file, gh pr create --body-file file
  for (const m of cmd.matchAll(/(?:\s-d|--data[\w-]*|--body-file)[\s=]+@?(['"]?)([^\s'"]+)\1/g)) if (m[2] !== '-') paths.push(m[2].replace(/^@/, ''));
  return [cmd, ...paths.map((f) => readFile(isAbsolute(f) ? f : join(cwd, f))).filter((x) => typeof x === 'string')];
}

// Issue #375: a screenshots message whose table is not the tool's own (a row that would show a broken link).
export function shotsRefusal(tool, input, io) {
  const broken = [...new Set(postedTexts(tool, input, io).flatMap(brokenShotRows))];
  if (!broken.length) return null;
  return ["Verrou de la factory : ce message de captures ne s'afficherait pas, ces lignes du tableau ne sont pas des images :",
    ...broken.map((l) => `- ${l}`),
    'Ne publie pas le tableau des captures : la factory le publie elle-même à partir des images poussées (issue #378). '
    + 'Retire le tableau de ton message (garde tes phrases), puis republie.'].join('\n');
}

// Issue #385: the PR a building run opens says what was tried in the project's real conditions, or what was not.
// Accents are optional (« Pas verifie en vrai » counts), whatever their Unicode form.
// Also « Essayée », « **Essayé** en vrai », a non-breaking space, and a JSON body with \u00e9 escapes.
const REAL_CHECK = /essayee?s?\W+en\W+vrai|pas\W+verifiee?s?\W+en\W+vrai/i;
const plain = (t) => t.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function realCheckRefusal(tool, input, io) {
  if (!opensPr(tool, input)) return null;
  if (postedTexts(tool, input, io).some((t) => REAL_CHECK.test(plain(t)))) return null;
  return ['Verrou de la factory : le résumé de la PR ne dit pas ce qui a été essayé en conditions réelles.',
    'Rejoue le parcours de la demande sur les vraies données du projet (vrai GitHub, vrai site en ligne, vrai message publié), '
    + 'en lecture seule : ne crée, ne modifie, n\'envoie ni ne supprime rien de réel.',
    'Puis ajoute au résumé une ligne « Essayé en vrai : … » (ce que tu as regardé et ce que tu as vu), et une ligne '
    + '« Pas vérifié en vrai : … » pour ce qui ne pouvait pas l\'être (il faudrait écrire de vraies données, un service extérieur intervient). '
    + 'Écris le résumé dans un fichier et envoie-le avec `-F body=@fichier` (chemin sans variable), puis réessaie.'].join('\n');
}

const entries = (text) => String(text || '').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// The hook's answer for one input, or null to let it through. `env` gives the files, the journal and config.
export function decide(input, { files, read, stages, sessionText, readFile, cwd }) {
  const ev = input.hook_event_name;
  const runEntry = entries(sessionText).filter((e) => e.kind === 'run').at(-1);
  if (!runEntry) return null; // not a factory run
  const denials = entries(sessionText).filter((e) => e.kind === 'gate').length;
  if (denials >= MAX_DENIALS) return null;
  const opts = { stage: runEntry.stage, current: sessionText };
  if (ev === 'PreToolUse') {
    const shots = shotsRefusal(input.tool_name, input.tool_input, { readFile, cwd: input.cwd || cwd });
    if (shots) return { gate: true, out: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: shots } } };
    if (!handsOver(input.tool_name, input.tool_input)) return null;
    const list = problems(files, read, stages, opts);
    const real = GATED.includes(runEntry.stage) ? realCheckRefusal(input.tool_name, input.tool_input, { readFile, cwd: input.cwd || cwd }) : null;
    if (!list.length) {
      return real ? { gate: true, out: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: real } } } : null;
    }
    // Everything at once: each refusal spends one of the run's MAX_DENIALS.
    const reason = ['Verrou de la factory : la PR ne peut pas avancer, ces étapes manquent dans le journal :', ...list.map((l) => `- ${l}`),
      'Fais-les (avec l\'outil Skill), commit, puis réessaie.', ...(real ? ['', real] : [])].join('\n');
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
      const readFile = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
      const res = decide(input, { files: branchFiles(git), read, stages, sessionText: read(`.factory/journal/${session}.jsonl`), readFile, cwd: input.cwd || root });
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
