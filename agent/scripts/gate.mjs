#!/usr/bin/env node
// Claude Code hook: the lock. A build, bugfix, foundation, audit or ui-polish run cannot open its PR (nor hand it to the next
// step with factory:checks / factory:visual-review) while its journal lacks a step, nor open it without saying what
// was tried in real conditions (issue #385), and it is sent back once
// when it tries to stop early. Installed by scripts/sync.mjs. After MAX_DENIALS refusals in one run it lets
// the agent through (the relay's catch-up run and the PR alert remain), so a run can never be stuck.
// It also refuses, in every factory run and without limit, reading the messages of a thread other than through
// thread.mjs (issue #565).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNPROVED_HOW } from './fabrication.mjs';
import { branchFiles, GATED, problems } from './journal-check.mjs';
import { sessionRoot } from './run-root.mjs';
import { brokenShotRows } from './shots.mjs';

export const MAX_DENIALS = 3;
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g;

// A command continued with a backslash is one line for the shell: join it before matching.
const commandOf = (input) => String(input?.command || '').replace(HEREDOC, '').replace(/\\\r?\n/g, ' ');

// A gh api / curl call that sends fields (gh api then POSTs unless told otherwise), and one that says GET.
// `-Fbody=@c.md` (no space) too; curl's `-fsSL` is not a field.
const SENDS_FIELDS = /\s-[fF](?:\s|[\w[\]]+=)|\s-d[\s@]|\s--(field|raw-field|input|data[\w-]*)\b/;
const EXPLICIT_GET = /(-X\s*|--method[\s=]+|--request[\s=]+)GET\b/i;
// Each gh api / curl call on its own, so a read chained to a write (or the other way round) does not hide it.
const apiCalls = (cmd) => cmd.split('\n').flatMap((l) => l.split(/(?=\b(?:gh\s+api|curl)\b)/));
// A call's own arguments: up to the first shell operator outside quotes (| ; & ) or a backtick, a `$(…)` of the
// call itself excepted), so what a pipe or a chained command adds (`grep -F`, `cut -f`, `echo -f`) is not taken for
// the call's fields.
export function ownArgs(call) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < call.length; i++) {
    const ch = call[i];
    if (quote === "'") { if (ch === quote) quote = null; continue; }
    if (ch === '$' && call[i + 1] === '(') { depth++; i++; continue; }
    if (ch === ')' && depth) { depth--; continue; }
    if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch;
    else if ('|;&)`'.includes(ch)) return call.slice(0, i);
  }
  return call;
}

// Does this tool call open a PR? A read of the pull requests does not: -X GET with -f filters, or a query string
// (`/pulls?head=…`, often inside $(…) to find the PR number) that a POST opening a PR never carries.
export function opensPr(tool, input = {}) {
  if (/create_pull_request$/.test(tool || '')) return true;
  if (tool !== 'Bash') return false;
  const cmd = commandOf(input);
  if (/\bgh\s+pr\s+create\b/.test(cmd)) return true;
  const posts = new RegExp(`(${SENDS_FIELDS.source}|-X\\s*POST|--method[\\s=]+POST|--request[\\s=]+POST)`);
  return apiCalls(cmd).some((c) => /^(gh\s+api|curl)\b.*\/pulls(?=$|[\s'"])/.test(c) && posts.test(c) && !EXPLICIT_GET.test(c));
}

// Issue #565: the messages of an issue or PR (review remarks included) are read only through thread.mjs, which leaves
// aside the messages of people outside the project. Reading one comment by its id stays allowed (thread.mjs never
// gives the id of a message left aside), and so do the issue or PR themselves (labels, state, branch).
export const THREAD_REFUSAL = "Verrou de la factory : les messages d'une demande ou d'une PR (remarques de relecture comprises) ne se lisent que par "
  + '`node .factory/scripts/thread.mjs <numéro> [--repo owner/name]`, qui laisse de côté les messages des personnes extérieures au projet. '
  + 'Si ce script échoue, ne lis pas le fil autrement : arrête-toi.';
// The address ends there (a trailing slash allowed): not `…/comments/123`, `…/comments/$ID`, `…/comments/"$ID"`,
// `…/comments/<id>`, `…/comments.patch` nor `…/replies`.
// One path segment, a $(…) in it included. The alternatives never match the same text (a `$` starts a $(…) or stands
// alone), so a failed match does not try every way of splitting many $(…): no exponential time.
const SEGMENT = String.raw`(?:\$\([^)]*\)|\$(?!\()|[^/\s'"?$])+`;
const THREAD_ADDRESS = new RegExp(String.raw`\/(issues|pulls)\/(?:comments|${SEGMENT}\/(?:comments|timeline|reviews(?:\/${SEGMENT}\/comments)?))(?:\/(?!["']?[\w%.$<{(-])|(?![\w/%.-]))`, 'i');
const WRITES = new RegExp(`(${SENDS_FIELDS.source}|(-X\\s*|--method[\\s=]+|--request[\\s=]+)(POST|PATCH|PUT|DELETE)\\b)`, 'i');
// curl -f is --fail, not a field.
const withoutCurlFail = (c) => (/^curl\b/.test(c) ? c.replace(/\s-f(?=\s)/g, ' ') : c);
// A curl call that names its host, and not GitHub (a local server, another site): not a thread read. A host given by a
// variable may be GitHub's, so it is judged like GitHub.
const curlElsewhere = (c) => /^curl\b/.test(c) && /\bhttps?:\/\/[^/\s'"]/i.test(c) && !/github\.com/i.test(c);
// Each `gh issue …` / `gh pr …` call on its own arguments.
const ghCalls = (cmd) => cmd.split('\n').flatMap((l) => l.split(/(?=\bgh\s+(?:issue|pr)\b)/)).map(ownArgs);
const MCP_THREAD_TOOLS = /(get_issue_comments|get_pull_request_comments|get_pull_request_reviews|get_pull_request_review_comments)$/;
export function readsThread(tool, input = {}) {
  const name = tool || '';
  if (MCP_THREAD_TOOLS.test(name)) return true;
  if (/issue_read$/.test(name)) return input?.method === 'get_comments';
  if (/pull_request_read$/.test(name)) return ['get_comments', 'get_review_comments', 'get_reviews'].includes(input?.method);
  if (name !== 'Bash') return false;
  const cmd = commandOf(input);
  const viewsThread = /^gh\s+(issue|pr)\s+(view|list)\b.*?(\s--comments\b|\s-c\b|--json[\s=]+['"]?[\w,]*\b(comments|reviews|latestReviews)\b)/s;
  if (ghCalls(cmd).some((c) => viewsThread.test(c))) return true;
  const calls = apiCalls(cmd).map((c) => withoutCurlFail(ownArgs(c)));
  if (calls.some((c) => /^gh\s+api\s+graphql\b/.test(c) && /\b(comments|reviews|reviewThreads|timelineItems)\b/.test(c) && !/\bmutation\b/.test(c))) return true;
  // Quotes inside the address (`repos/"$REPO"/issues/'5'/comments`) are the shell's: the address is read without them.
  return calls.some((c) => /^(gh\s+api|curl)\b/.test(c) && !curlElsewhere(c) && THREAD_ADDRESS.test(c.replace(/["']/g, ''))
    && (!WRITES.test(c) || EXPLICIT_GET.test(c)));
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

// Review #556: the « unproved » upstream step may be out of the agent's reach (its instruction even says to go on).
// Once a refusal was caused by that line alone (recorded as cause « upstream »), the line is no longer asked for in
// this run. Every refusal that showed it still counts toward the MAX_DENIALS: one when it came alone, more when it
// first came with other missing steps (no cause is recorded then, so it is asked again). The PR alert still reports it.
const isUpstream = (line) => line.startsWith(UNPROVED_HOW);
const UPSTREAM = 'upstream';

// The hook's answer for one input, or null to let it through. `env` gives the files and the stages (each a value, or a
// function that reads it only when needed: the thread refusal must depend neither on git nor on the config), the
// journal and config.
export function decide(input, { files: givenFiles, read, stages: givenStages, sessionText, readFile, cwd }) {
  let fileList;
  let stageMap;
  const files = () => (fileList ??= typeof givenFiles === 'function' ? givenFiles() : givenFiles);
  const stages = () => (stageMap ??= typeof givenStages === 'function' ? givenStages() : givenStages);
  const ev = input.hook_event_name;
  const runEntry = entries(sessionText).filter((e) => e.kind === 'run').at(-1);
  if (!runEntry) return null; // not a factory run
  // Never gives way, and spends none of the MAX_DENIALS: reading around the sorting is never needed.
  if (ev === 'PreToolUse' && readsThread(input.tool_name, input.tool_input)) {
    return { thread: true, out: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: THREAD_REFUSAL } } };
  }
  const denials = entries(sessionText).filter((e) => e.kind === 'gate').length;
  if (denials >= MAX_DENIALS) return null;
  const opts = { stage: runEntry.stage, current: sessionText };
  const upstreamGiven = entries(sessionText).some((e) => e.kind === 'gate' && e.cause === UPSTREAM);
  const missing = () => problems(files(), read, stages(), opts).filter((l) => !(upstreamGiven && isUpstream(l)));
  const cause = (list, other) => (!other && list.length && list.every(isUpstream) ? { cause: UPSTREAM } : {});
  if (ev === 'PreToolUse') {
    const shots = shotsRefusal(input.tool_name, input.tool_input, { readFile, cwd: input.cwd || cwd });
    if (shots) return { gate: true, out: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: shots } } };
    if (!handsOver(input.tool_name, input.tool_input)) return null;
    const list = missing();
    const real = GATED.includes(runEntry.stage) ? realCheckRefusal(input.tool_name, input.tool_input, { readFile, cwd: input.cwd || cwd }) : null;
    if (!list.length) {
      return real ? { gate: true, out: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: real } } } : null;
    }
    // Everything at once: each refusal spends one of the run's MAX_DENIALS.
    const reason = ['Verrou de la factory : la PR ne peut pas avancer, ces étapes manquent dans le journal :', ...list.map((l) => `- ${l}`),
      'Fais-les (avec l\'outil Skill), commit, puis réessaie.', ...(real ? ['', real] : [])].join('\n');
    return { gate: true, ...cause(list, real), out: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } } };
  }
  if (ev === 'Stop') {
    if (input.stop_hook_active) return null;
    if (!files().some((f) => !f.startsWith('.factory/journal/'))) return null; // nothing built yet (a question, a block)
    const list = missing();
    if (!list.length) return null;
    const reason = ['Verrou de la factory : avant de t\'arrêter, ces étapes manquent dans le journal :', ...list.map((l) => `- ${l}`),
      "Fais-les, puis termine le run comme prévu. Si tu t'arrêtes exprès (question au propriétaire, blocage expliqué sur l'issue), arrête-toi simplement."].join('\n');
    return { gate: true, ...cause(list), out: { decision: 'block', reason } };
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
      const stages = () => (existsSync(cfg) ? JSON.parse(readFileSync(cfg, 'utf8')).stages || {} : {});
      const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
      const readFile = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
      const res = decide(input, { files: () => branchFiles(git), read, stages, sessionText: read(`.factory/journal/${session}.jsonl`), readFile, cwd: input.cwd || root });
      const id = input.tool_use_id ? String(input.tool_use_id) : null;
      const counted = id && read(`.factory/journal/${session}.jsonl`).includes(`"id":${JSON.stringify(id)}`);
      if (res) {
        // Each clone's settings carry the hook: the same refusal reached twice counts once. A thread refusal is not
        // journaled: it never counts toward MAX_DENIALS.
        if (!counted && !res.thread) appendFileSync(sessionPath, JSON.stringify({ t: new Date().toISOString(), kind: 'gate', event: input.hook_event_name, ...(id ? { id } : {}), ...(res.cause ? { cause: res.cause } : {}) }) + '\n');
        process.stdout.write(JSON.stringify(res.out));
      }
    }
  } catch { /* never break the agent: on any error, let it through */ }
  process.exit(0);
}
