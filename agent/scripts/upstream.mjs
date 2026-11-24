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
import { repoFromRemote, trusted } from './specs.mjs';
import { importTranscript } from './transcript.mjs';

const JOURNAL = /^\.factory\/journal\/[^/]+\.jsonl$/;
// `text=` since #559: a marker printed before it has none and stays valid (in-flight requests keep their proof).
const MARKER = /<!-- factory-upstream stage=([\w-]+) model=([\w.-]+) role=(plan|review)(?: text=([0-9a-f]{16}))? -->/;
const DOC_MARKS = { spec: /^<!-- factory-spec -->\s*$/m, brief: /^<!-- factory-brief -->\s*$/m };

// Longer than any run: a spec published by a run that started just before the script reached the project is not blamed.
export const UPSTREAM_GRACE_MS = 3 * 3600_000;

// The text the proof covers: what comes before the proof line, without the signature(s) the pilot or the publishing
// tool add at the end, line endings and trailing spaces left aside. Any other change is a rewrite.
const SIGNATURE = /(?:\n+---[ \t]*\n_[^\n]*\[Claude Code\]\([^)\n]*\)[^\n]*_)+$/;
export const proofText = (body) => String(body || '').replace(/\r\n?/g, '\n').split(/^<!-- factory-upstream .*$/m)[0]
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

// The final content of each file the sub-agent wrote with its Write and Edit tools, replayed in order. An Edit that
// cannot apply drops the file: its content is no longer known.
export function writtenTexts(lines) {
  const files = new Map();
  for (const b of toolUses(lines)) {
    const i = b.input || {};
    const path = String(i.file_path || '');
    if (b.name === 'Write' && typeof i.content === 'string') files.set(path, i.content);
    else if (b.name === 'Edit' && files.has(path)) {
      const cur = files.get(path);
      const from = String(i.old_string ?? '');
      if (!from || !cur.includes(from)) files.delete(path);
      else files.set(path, i.replace_all ? cur.split(from).join(String(i.new_string ?? '')) : cur.replace(from, () => String(i.new_string ?? '')));
    }
  }
  return [...files.values()];
}

const family = (m) => String(modelFamily(m) || '').toLowerCase();
// Every answer of the record came from the family of `model` (Claude Code's own error lines aside), and there is one.
export function ranOn(lines, model) {
  if (!model) return false;
  const models = (lines || []).filter((l) => l?.type === 'assistant' && l.message?.model && l.message.model !== '<synthetic>').map((l) => l.message.model);
  return models.length > 0 && models.every((m) => family(m) === family(model));
}

// Who did the upstream thinking of `text`: the latest sub-agent announced [role:plan:amont] or [role:review:amont]
// whose record shows it ran on its role's model and wrote that text. Otherwise why not, for the latest candidate.
export function upstreamVerdict(run, { text, record }) {
  const candidates = (run?.agents || []).filter((a) => a?.up === true && ['plan', 'review'].includes(a.role) && a.id).reverse();
  if (!candidates.length) return { ok: false, why: 'none' };
  const want = proofText(text);
  let first = null;
  for (const a of candidates) {
    let lines = null;
    try { lines = record(a); } catch { /* unreadable: no record */ }
    const model = run.models?.[a.role];
    let why;
    if (!lines) why = 'record';
    else if (!ranOn(lines, model)) why = 'model';
    else if (!want || !writtenTexts(lines).some((w) => proofText(w) === want)) why = 'text';
    else return { ok: true, model: family(model), role: a.role, hash: textHash(text) };
    first ??= why;
  }
  return { ok: false, why: first };
}

// The sub-agent handed an answer back: its last answer has text, or it called SubagentHandback with a message (how a
// sub-agent reports in the cloud sessions).
export function returned(lines) {
  const said = (lines || []).filter((l) => l?.type === 'assistant' && Array.isArray(l.message?.content));
  const last = said.at(-1);
  if (last && last.message.content.some((b) => b?.type === 'text' && String(b.text || '').trim())) return true;
  return toolUses(lines).some((b) => b.name === 'SubagentHandback' && String(b.input?.message || '').trim());
}

// A bug has no published text: its analysis is proved when the latest sub-agent announced [role:plan:amont] (or
// [role:review:amont]) launched before the last red test ran on its role's model and handed its analysis back
// before that test, as its record shows. The journal entry to append, or null.
export function bugProof(run, record) {
  const red = (run?.tests || []).filter((x) => !x.ok).at(-1);
  const before = (t) => !red || Date.parse(t) < Date.parse(red.t);
  const candidates = (run?.agents || []).filter((a) => a?.up === true && ['plan', 'review'].includes(a.role) && a.id && before(a.t)).reverse();
  for (const a of candidates) {
    let lines = null;
    try { lines = record(a); } catch { /* unreadable: no record */ }
    const model = run.models?.[a.role];
    const end = (lines || []).map((l) => l?.timestamp).filter(Boolean).at(-1);
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

export function readUpstream(body) {
  const m = MARKER.exec(String(body || ''));
  return m ? { stage: m[1], model: m[2], role: m[3], text: m[4] || null } : null;
}
// A marked comment proves something only when its text is still the one the marker was given for.
const validMarker = (body) => {
  const m = readUpstream(body);
  return m && (m.text == null || m.text === textHash(body)) ? m : null;
};

// What the issue's comments prove: only the latest version of the document decides; `by` lists every marked comment.
export function upstreamProof(comments, { doc = 'spec', since = null, owner = null } = {}) {
  const ok = (comments || []).filter((c) => owner == null || trusted(c, owner));
  const by = [];
  for (const c of ok) {
    const m = validMarker(c.body);
    if (m && !by.some((b) => b.model === m.model && b.role === m.role)) by.push({ model: m.model, role: m.role });
  }
  const latest = ok.filter((c) => DOC_MARKS[doc].test(String(c.body || ''))).at(-1);
  let status;
  if (!latest) status = 'none';
  else if (validMarker(latest.body)) status = 'proved';
  else if (readUpstream(latest.body)) status = 'unproved'; // rewritten after its proof was given
  else if (since && Date.parse(latest.created_at) > Date.parse(since) + UPSTREAM_GRACE_MS) status = 'unproved';
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

export function upstreamEntry(run, comments, { since = null, owner = null } = {}) {
  const doc = { build: 'spec', foundation: 'brief' }[run?.stage];
  if (!doc || run.issue == null) return null;
  if (comments == null) return { kind: 'upstream', doc, status: 'unread', by: [] };
  return upstreamProof(comments, { doc, since, owner });
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
      model: ["Phase amont : le sous-agent de réflexion n'a pas répondu sur le modèle choisi pour son rôle. Relance-le avec `model` = `models.<rôle>.model`."],
      text: [`Phase amont : le texte de ${path} n'est pas celui que le sous-agent a écrit avec l'outil Write. Publie son fichier tel quel, sans le réécrire (seules la ligne de preuve et la signature s'ajoutent à la fin).`],
    }[verdict.why];
    // At build or foundation time the document is already published: a version without the proof changes nothing.
    // Without a run the stage is unknown: both ways out are given.
    const repair = ['build', 'foundation'].includes(run?.stage);
    const publish = "après un sous-agent `plan` puis un sous-agent `review`, chacun lancé avec son `model`, publie sans la ligne : le contrôle à la construction le signalera.";
    console.error([
      ...cause,
      repair
        ? "Si elle refuse encore, ne republie rien : la version déjà publiée reste celle du propriétaire, le bilan le signalera."
        : run
          ? `Si elle refuse encore ${publish}`
          : `Si elle refuse encore : si tu es à une construction (build ou foundation), ne republie rien et continue, le bilan le signalera ; sinon, ${publish}`,
    ].join('\n'));
    process.exit(1);
  }
  console.log(marker);
}
