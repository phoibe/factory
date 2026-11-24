#!/usr/bin/env node
// Issue #550: proof that the upstream thinking (questions, spec, project sheet) was done by a sub-agent of role `plan`.
// Before publishing, the pilot runs `node .factory/scripts/upstream.mjs <n> <fichier>` from the project's folder: it
// reads the run's journal and Claude Code's own record of the sub-agent announced `[role:plan:amont]` (issue #559),
// and prints a hidden line naming the model that did the thinking and the hash of the text it wrote, to end the
// comment with. At build time journal-check.mjs reads the issue's comments back (upstreamEntry) and journals what it
// found; a comment whose text no longer matches its hash proves nothing.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelFamily, parseJournal } from './fabrication.mjs';
import { shownCommand } from './journal.mjs';
import { repoFromRemote, trusted } from './specs.mjs';
import { importTranscript } from './transcript.mjs';

const JOURNAL = /^\.factory\/journal\/[^/]+\.jsonl$/;
// `text=` since #559: a marker printed before it has none and stays valid on a comment published before this script
// reached the project (in-flight requests keep their proof), the grace period included.
const MARKER = /<!-- factory-upstream stage=([\w-]+) model=([\w.-]+) role=(plan|review)(?: text=([0-9a-f]{16}))? -->/;
const DOC_MARKS = { spec: /^<!-- factory-spec -->\s*$/m, brief: /^<!-- factory-brief -->\s*$/m };

// Longer than any run: a spec published by a run that started just before the script reached the project is not blamed.
export const UPSTREAM_GRACE_MS = 3 * 3600_000;
// Dates the delivery of the text proof: journal-check finds the commit that brought this string into the project's
// .factory/scripts/upstream.mjs (upstreamSince). Keep it, unchanged, in this file.
export const TEXT_PROOF = 'factory-upstream-text-proof';
const after = (date, since) => since != null && Date.parse(date) > Date.parse(since) + UPSTREAM_GRACE_MS;

// The text the proof covers: the comment without its proof line (wherever it sits, as readUpstream finds it) and
// without the signature(s) the pilot or the publishing tool add at the end (`---` then one italic line carrying the
// `[Claude Code](…)` link), line endings and trailing spaces left aside. Any other change, even after the proof line,
// is a rewrite.
const SIGNATURE = /(?:\n+---[ \t]*\n_[^\n]*\[Claude Code\]\([^\n]*_)+$/;
export const proofText = (body) => String(body || '').replace(/\r\n?/g, '\n').replace(new RegExp(MARKER.source, 'g'), '')
  .replace(/[ \t]+$/gm, '').trimEnd().replace(SIGNATURE, '').trim();
export const textHash = (body) => createHash('sha256').update(proofText(body)).digest('hex').slice(0, 16);

// Claude Code keeps one record per sub-agent: <projects>/<folder>/<session>/subagents/agent-<x>.jsonl, next to
// agent-<x>.meta.json whose `toolUseId` is the id of the Agent call (the journal's `agent` entry). Its parsed lines,
// or null when it cannot be found or read: never a throw.
export function subagentRecord(session, toolUseId, { projectsDir = join(homedir(), '.claude/projects') } = {}) {
  if (!session || !toolUseId) return null;
  try {
    for (const folder of readdirSync(projectsDir)) {
      const dir = join(projectsDir, folder, basename(String(session)), 'subagents');
      let names = [];
      try { names = readdirSync(dir).filter((f) => f.endsWith('.meta.json')); } catch { continue; }
      for (const name of names) {
        let meta = null;
        try { meta = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch { continue; }
        if (meta?.toolUseId !== toolUseId) continue;
        const text = readFileSync(join(dir, name.replace(/\.meta\.json$/, '.jsonl')), 'utf8');
        return text.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      }
    }
  } catch { /* no projects folder, unreadable HOME: nothing to read */ }
  return null;
}

const toolUses = (lines) => (lines || []).filter((l) => l?.type === 'assistant' && Array.isArray(l.message?.content))
  .flatMap((l) => l.message.content.filter((b) => b?.type === 'tool_use'));

// Claude Code answers each tool call in a user line: the ids of the calls it refused (is_error), which changed nothing.
const refusedIds = (lines) => new Set((lines || []).filter((l) => l?.type === 'user' && Array.isArray(l.message?.content))
  .flatMap((l) => l.message.content.filter((b) => b?.type === 'tool_result' && b.is_error === true).map((b) => b.tool_use_id)));

// The tool calls of a record, each with its record and time (a line without one takes the time of the line before).
function calls(r) {
  const refused = refusedIds(r.lines);
  let at = -Infinity;
  return (r.lines || []).flatMap((l) => {
    const ms = Date.parse(l?.timestamp);
    if (!Number.isNaN(ms)) at = ms;
    return toolUses([l]).filter((b) => b.id == null || !refused.has(b.id)).map((b) => ({ b, r, at }));
  });
}

// The records of several sub-agents ([{ lines }], in launch order) replayed as one, their tool calls in time order
// (launch order on a tie): the final content of each file written with the Write and Edit tools, and the records that
// made it (`by`: since its last Write, in order). A refused call is skipped; an Edit that cannot apply drops the file:
// its content is no longer known.
function replay(records) {
  const files = new Map();
  for (const { b, r } of records.flatMap(calls).sort((x, y) => (x.at - y.at) || 0)) {
    const i = b.input || {};
    const path = String(i.file_path || '');
    if (b.name === 'Write' && typeof i.content === 'string') files.set(path, { text: i.content, by: [r] });
    else if (b.name === 'Edit' && files.has(path)) {
      const { text: cur, by } = files.get(path);
      const from = String(i.old_string ?? '');
      const to = String(i.new_string ?? '');
      if (!from || !cur.includes(from)) files.delete(path);
      else files.set(path, { text: i.replace_all ? cur.split(from).join(to) : cur.replace(from, () => to), by: by.includes(r) ? by : [...by, r] });
    }
  }
  return [...files.values()];
}
// The final content of each file one sub-agent wrote.
export const writtenTexts = (lines) => replay([{ lines }]).map((f) => f.text);

const family = (m) => String(modelFamily(m) || '').toLowerCase();
// The record's answers from a model: Claude Code's own lines (`<synthetic>`, an API error it reports) left aside.
const answers = (lines) => (lines || []).filter((l) => l?.type === 'assistant' && l.message && l.message.model !== '<synthetic>' && !l.isApiErrorMessage);
// Every answer of the record came from the family of `model`, and there is one.
export function ranOn(lines, model) {
  if (!model) return false;
  const models = answers(lines).filter((l) => l.message.model).map((l) => l.message.model);
  return models.length > 0 && models.every((m) => family(m) === family(model));
}

// Who did the upstream thinking of `text`: the sub-agents announced [role:plan:amont] or [role:review:amont], their
// records replayed together in launch order (a fresh one may correct the file another wrote), wrote that text, and
// each of those that wrote it ran on its role's model. The proof goes to the one that wrote last. Otherwise why not.
export function upstreamVerdict(run, { text, record }) {
  const agents = (run?.agents || []).filter((a) => a?.up === true && ['plan', 'review'].includes(a.role) && a.id);
  if (!agents.length) return { ok: false, why: 'none' };
  const records = agents.map((a) => {
    let lines = null;
    try { lines = record(a); } catch { /* unreadable: no record */ }
    return { a, lines, model: run.models?.[a.role] };
  });
  const onModel = (r) => ranOn(r.lines, r.model);
  const want = proofText(text);
  const hits = want ? replay(records.filter((r) => r.lines)).filter((f) => proofText(f.text) === want) : [];
  // A sub-agent that crashed (it never handed anything back) proves nothing, not even a draft another one corrected.
  const hit = hits.find((f) => f.by.every((r) => onModel(r) && returned(r.lines)));
  if (hit) {
    const last = hit.by.at(-1);
    return { ok: true, model: family(last.model), role: last.a.role, hash: textHash(text) };
  }
  if (hits.some((f) => f.by.every(onModel))) return { ok: false, why: 'returned' };
  if (hits.length) return { ok: false, why: 'model' };
  const latest = records.at(-1);
  return { ok: false, why: !latest.lines ? 'record' : !onModel(latest) ? 'model' : 'text' };
}

// The sub-agent handed an answer back: its last answer has text, or it called SubagentHandback with a message (how a
// sub-agent reports in the cloud sessions). An API error that ended it is not an answer, nor a last answer cut on a
// tool call (`stop_reason` « tool_use »): the sub-agent was still at work.
export function returned(lines) {
  const said = answers(lines).filter((l) => Array.isArray(l.message.content));
  const last = said.at(-1);
  if (last && last.message.stop_reason !== 'tool_use' && last.message.content.some((b) => b?.type === 'text' && String(b.text || '').trim())) return true;
  return toolUses(lines).some((b) => b.name === 'SubagentHandback' && String(b.input?.message || '').trim());
}

// A bug has no published text: its analysis is proved when the latest sub-agent announced [role:plan:amont] (or
// [role:review:amont]) launched before the last red test ran on its role's model and handed its analysis back
// before that test, as its record shows. A test it ran itself (to reproduce the bug) is part of the analysis, not of
// the fix. The journal entry to append, or null.
export function bugProof(run, record) {
  const reds = (run?.tests || []).filter((x) => !x.ok);
  const candidates = (run?.agents || []).filter((a) => a?.up === true && ['plan', 'review'].includes(a.role) && a.id).reverse();
  for (const a of candidates) {
    let lines = null;
    try { lines = record(a); } catch { /* unreadable: no record */ }
    const model = run.models?.[a.role];
    // Its end: the latest time in its record (its lines are not always in time order).
    const times = (lines || []).map((l) => Date.parse(l?.timestamp)).filter((n) => !Number.isNaN(n));
    const end = times.length ? new Date(Math.max(...times)).toISOString() : null;
    // Its own: the journal keeps the id of the tool call that ran the test, the one of a Bash call in its record.
    // An older entry without id: run during its span, after the same test command appears among its calls (a red
    // test of the fix begun while the analysis still ran is not its own).
    const bash = toolUses(lines).filter((b) => b.name === 'Bash');
    const ran = (x) => (lines || []).some((l) => Date.parse(l?.timestamp) <= Date.parse(x.t)
      && toolUses([l]).some((b) => b.name === 'Bash' && shownCommand(String(b.input?.command || '')) === x.cmd));
    const own = (x) => (x.id ? bash.some((b) => b.id === x.id)
      : end && Date.parse(x.t) >= Date.parse(a.t) && Date.parse(x.t) <= Date.parse(end) && ran(x));
    const red = reds.filter((x) => !own(x)).at(-1);
    const before = (t) => !red || Date.parse(t) < Date.parse(red.t);
    if (!before(a.t)) continue;
    if (lines && ranOn(lines, model) && returned(lines) && (!red || (end && before(end)))) {
      return { kind: 'upstream', doc: 'bug', status: 'proved', by: [{ model: family(model), role: a.role }] };
    }
  }
  return null;
}

export function upstreamMarker(run, verdict) {
  if (!run || !verdict?.ok) return null;
  return `<!-- factory-upstream stage=${run.stage} model=${verdict.model} role=${verdict.role} text=${verdict.hash} -->`;
}

// The last marker of the comment: the one the pilot appended (an older one copied into the text proves nothing).
export function readUpstream(body) {
  const m = [...String(body || '').matchAll(new RegExp(MARKER.source, 'g'))].at(-1);
  return m ? { stage: m[1], model: m[2], role: m[3], text: m[4] || null } : null;
}
// A marked comment proves something only when its text is still the one the marker was given for. A marker without
// text is only taken from a comment published before the text proof reached the project (`textSince`; unknown: taken).
const validMarker = (c, textSince) => {
  const m = readUpstream(c?.body);
  if (!m) return null;
  if (m.text == null) return after(c.created_at, textSince) ? null : m;
  return m.text === textHash(c.body) ? m : null;
};

// What the issue's comments prove: only the latest version of the document decides; `by` lists every marked comment.
export function upstreamProof(comments, { doc = 'spec', since = null, textSince = null, owner = null } = {}) {
  const ok = (comments || []).filter((c) => owner == null || trusted(c, owner));
  const by = [];
  for (const c of ok) {
    const m = validMarker(c, textSince);
    if (m && !by.some((b) => b.model === m.model && b.role === m.role)) by.push({ model: m.model, role: m.role });
  }
  const latest = ok.filter((c) => DOC_MARKS[doc].test(String(c.body || ''))).at(-1);
  let status;
  if (!latest) status = 'none';
  else if (validMarker(latest, textSince)) status = 'proved';
  else if (readUpstream(latest.body)) status = 'unproved'; // rewritten after its proof was given, or proof without text
  else if (since && after(latest.created_at, since)) status = 'unproved';
  else status = 'old';
  return { kind: 'upstream', doc, status, by };
}

// The journal whose last « run » entry is the most recent (on `issue` when given). With `notBefore` (ms), a run that
// started earlier is skipped, unless its journal is `keep` (the current session's).
export function latestRun(files, readFile, { issue = null, notBefore = null, keep = null } = {}) {
  let best = null;
  for (const file of files.filter((x) => JOURNAL.test(x))) {
    const text = readFile(file);
    const run = String(text || '').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e?.kind === 'run').at(-1);
    if (!run || (issue != null && Number(run.issue) !== Number(issue))) continue;
    if (notBefore != null && file !== keep && !(Date.parse(run.t) >= notBefore)) continue;
    if (!best || Date.parse(run.t) > Date.parse(best.run.t)) best = { file, run, text };
  }
  return best;
}

export function upstreamEntry(run, comments, { since = null, textSince = null, owner = null } = {}) {
  const doc = { build: 'spec', foundation: 'brief' }[run?.stage];
  if (!doc || run.issue == null) return null;
  if (comments == null) return { kind: 'upstream', doc, status: 'unread', by: [] };
  return upstreamProof(comments, { doc, since, textSince, owner });
}

// Only this session's journal, or a run of the last hours: an old journal of the same request proves nothing now.
const RECENT_MS = 12 * 3600_000;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [n, path] = process.argv.slice(2);
  const root = process.cwd();
  let text = null;
  try { text = path ? readFileSync(resolve(root, path), 'utf8') : null; } catch { /* unreadable */ }
  if (!/^\d+$/.test(n || '') || text == null) {
    console.error("Phase amont : donne le numéro de la demande et le fichier du texte à publier, par exemple `node .factory/scripts/upstream.mjs 12 /tmp/commentaire.md`.");
    process.exit(1);
  }
  // A proof line already in the file (copied from a previous version) would be read at build instead of the new one.
  if (MARKER.test(text)) {
    console.error([
      `Phase amont : le fichier ${path} contient déjà une ligne de preuve (\`<!-- factory-upstream … -->\`), sans doute recopiée d'une version précédente.`,
      "Demande au sous-agent de réflexion de réécrire le fichier en entier avec l'outil Write, sans cette ligne, puis relance cette commande. Ne publie rien avant.",
    ].join('\n'));
    process.exit(1);
  }
  // Hooks are not loaded when the routine serves several projects: rebuild the journal from the transcript.
  let keep = null;
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const file = importTranscript(root, repoFromRemote(remote));
    if (file) keep = `.factory/journal/${basename(file)}`;
  } catch { /* no remote or no transcript: the hooks' journal is all there is */ }
  let files = [];
  try { files = readdirSync(join(root, '.factory/journal')).map((f) => `.factory/journal/${f}`); } catch { /* no journal */ }
  const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return null; } };
  const best = latestRun(files, read, { issue: Number(n), notBefore: Date.now() - RECENT_MS, keep });
  const run = best ? parseJournal([best.text]).at(-1) : null;
  // The journal's file name is the session's id, under which Claude Code keeps the sub-agents' records.
  const session = best ? basename(best.file, '.jsonl') : null;
  const verdict = run ? upstreamVerdict(run, { text, record: (a) => subagentRecord(session, a.id) }) : { ok: false, why: 'none' };
  const marker = upstreamMarker(run, verdict);
  if (!marker) {
    const cause = {
      none: [
        `Phase amont : aucun sous-agent du rôle \`plan\` annoncé (\`[role:plan:amont]\`) n'a été vu dans ce run pour la demande #${n}.`,
        "Lance-le avec une `description` qui commence par `[role:plan:amont]` et `model` = `models.plan.model` (« Phase amont » dans AGENT.md), puis relance cette commande. Ne publie rien avant.",
      ],
      record: ["Phase amont : le relevé du sous-agent de réflexion est introuvable sur cette machine, l'outil ne peut rien vérifier."],
      returned: [
        "Phase amont : un sous-agent de réflexion qui a écrit ce texte s'est arrêté sans rendre son travail (échec) : son texte ne compte pas.",
        "Demande à un sous-agent de réflexion (lancé avec `[role:plan:amont]` et `model` = `models.plan.model`) de réécrire le fichier en entier avec l'outil Write et de rendre son travail, puis publie ce fichier tel quel.",
      ],
      model: ["Phase amont : le sous-agent de réflexion n'a pas répondu sur le modèle choisi pour son rôle. Relance-le avec `model` = `models.<rôle>.model`."],
      text: [
        `Phase amont : le texte de ${path} n'est pas celui que le sous-agent a écrit avec les outils Write et Edit (un fichier écrit par Bash n'est pas vu).`,
        "Demande au sous-agent de réflexion (ou à un nouveau, lancé avec `[role:plan:amont]` et `model` = `models.plan.model`) de réécrire le fichier en entier avec l'outil Write, puis publie ce fichier tel quel, sans le retoucher (seules la ligne de preuve et la signature s'ajoutent à la fin).",
      ],
    }[verdict.why];
    // At build or foundation time the document is already published: a version without the proof changes nothing.
    // Without a run the stage is unknown: both ways out are given. Without the record, relaunching cannot help.
    const repair = ['build', 'foundation'].includes(run?.stage);
    const publish = "après un sous-agent `plan` puis un sous-agent `review`, chacun lancé avec son `model`, publie sans la ligne : le contrôle à la construction le signalera.";
    console.error([
      ...cause,
      repair
        ? "Si elle refuse encore, ne republie rien : la version déjà publiée reste celle du propriétaire, le bilan le signalera."
        : verdict.why === 'record'
          ? "Relancer ne changera rien : publie sans la ligne, le contrôle à la construction le signalera."
          : run
            ? `Si elle refuse encore ${publish}`
            : `Si elle refuse encore : si tu es à une construction (build ou foundation), ne republie rien et continue, le bilan le signalera ; sinon, ${publish}`,
    ].join('\n'));
    process.exit(1);
  }
  console.log(marker);
}
