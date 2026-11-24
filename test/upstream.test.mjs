import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelFamily, parseJournal, roleOf, summarize, upstreamCheck } from '../agent/scripts/fabrication.mjs';
import { report } from '../agent/scripts/journal-check.mjs';
import { MODEL_FAMILIES } from '../scripts/lib/models.mjs';

const j = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const FF = { plan: 'fable', review: 'fable' };
const stages = { plan: true, tdd: true, review: true, designPass: true };
// A real clock, one second per entry, starting a little before now (upstream.mjs only reads the runs of the last hours).
let clock = Date.now() - 3600_000;
const t = () => new Date((clock += 1000)).toISOString();
const runE = (stage, extra = {}) => ({ t: t(), kind: 'run', stage, issue: 42, pr: null, models: FF, ...extra });
const agent = (model, extra = {}) => ({ t: t(), kind: 'agent', model, effort: null, label: model, ...extra });
const red = () => ({ t: t(), kind: 'test', cmd: 'npm test', ok: false });
const green = () => ({ t: t(), kind: 'test', cmd: 'npm test', ok: true });
const up = (status, by = [{ model: 'fable', role: 'plan' }], doc = 'spec') => ({ t: t(), kind: 'upstream', doc, status, by });
const runOf = (...entries) => parseJournal([j(...entries)]).at(-1);

test('parseJournal keeps the issue, the role models and the last upstream entry of each run', () => {
  const r = runOf(runE('build'), up('old'), up('proved'));
  assert.equal(r.issue, 42);
  assert.deepEqual(r.models, FF);
  assert.equal(r.upstream.status, 'proved');
  const old = runOf({ t: t(), kind: 'run', stage: 'build', issue: 3, pr: null });
  assert.equal(old.models, null);
  assert.equal(old.upstream, null);
});

test('every family of the catalog is shown by its capitalised name', () => {
  for (const f of MODEL_FAMILIES) assert.equal(modelFamily(`claude-${f.id}-${f.version}`), f.name);
});

test('roleOf matches a model to the plan role first, then the review role', () => {
  assert.equal(roleOf('claude-fable-5-2', FF), 'plan');
  assert.equal(roleOf('fable', { plan: 'opus', review: 'fable' }), 'review');
  assert.equal(roleOf('sonnet', FF), null);
  assert.equal(roleOf(null, FF), null);
  assert.equal(roleOf('fable', null), null);
});

// A bugfix journaled before #559 (no `role` key): an agent with a role launched before the last red test analysed it.
test('an older bugfix: an agent with a role launched before the last red test', () => {
  const analysed = (...entries) => upstreamCheck([runOf(...entries)]).lines.length === 1;
  assert.equal(analysed(runE('bugfix'), agent('fable'), agent('opus'), red(), green(), agent('fable')), true, 'A');
  const b = [runE('bugfix'), agent('opus'), red(), green(), agent('fable')];
  assert.equal(analysed(...b), false, 'B: the final reviewer is not the analysis');
  assert.equal(analysed(...b, agent('fable'), agent('opus'), red(), green()), true, 'C');
  assert.equal(analysed(runE('bugfix'), agent('fable')), true, 'D');
});

const BUG_ALERT = "Correction du bug : l'outil n'a pas pu vérifier quel modèle a analysé le bug avant sa correction.";

test('upstreamCheck on a bugfix', () => {
  assert.deepEqual(upstreamCheck([runOf(runE('bugfix'), agent('fable'), red(), green())]),
    { lines: ['**Analyse du bug** : faite par Fable (rôle « Plans et organisation »)'], missing: [] });
  const res = upstreamCheck([runOf(runE('bugfix'), agent('opus'), red(), green(), agent('fable'))]);
  assert.deepEqual(res.lines, []);
  assert.equal(res.missing.length, 1);
  assert.equal(res.missing[0].alert, BUG_ALERT);
  assert.equal(res.missing[0].how, "analyse du bug : lance `node .factory/scripts/journal-check.mjs` depuis le dossier du projet (il lit le relevé du sous-agent d'analyse) ; s'il la demande encore, fais analyser le bug par un sous-agent du rôle `plan` (« Phase amont » dans AGENT.md), lancé avec la description `[role:plan:amont]` et `model` = `models.plan.model`, puis reproduis-le par un test rouge et corrige à partir de son analyse");
});

test('upstreamCheck on a build or a foundation', () => {
  const none = upstreamCheck([runOf(runE('build'))]);
  assert.deepEqual(none.lines, ["**Questions et fiche** : non mesuré (l'outil n'a pas pu vérifier quel modèle les a faites)"]);
  assert.deepEqual(none.missing, [{ alert: null, how: 'questions et fiche : lance `node .factory/scripts/journal-check.mjs` depuis le dossier du projet (il relit la demande)' }]);
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('proved'))]), { lines: ['**Questions et fiche** : faites par Fable (rôle « Plans et organisation »)'], missing: [] });
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('proved', [{ model: 'opus', role: 'plan' }, { model: 'fable', role: 'review' }]))]).lines,
    ['**Questions et fiche** : faites par Opus (rôle « Plans et organisation »), Fable (rôle « Revue »)']);
  const un = upstreamCheck([runOf(runE('build'), up('unproved'))]);
  assert.deepEqual(un.lines, []);
  assert.equal(un.missing[0].alert, "Questions et fiche : l'outil n'a pas pu vérifier quel modèle les a faites (la dernière version publiée ne porte pas la preuve).");
  assert.match(un.missing[0].how, /^questions et fiche : la fiche publiée n'a pas de preuve valable : la ligne de preuve manque, ou le texte ne correspond plus à ce que le sous-agent de réflexion a écrit\./);
  assert.match(un.missing[0].how, /upstream\.mjs 42/);
  assert.match(un.missing[0].how, /\[role:plan:amont\]/);
  assert.match(un.missing[0].how, /upstream\.mjs 42 <fichier>/);
  assert.match(un.missing[0].how, /si `upstream\.mjs` refuse encore, ne republie rien \(aucune nouvelle version pour le propriétaire\) et continue : le bilan le signalera$/);
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('old'))]), { lines: ['**Questions et fiche** : publiées avant la mise en place de cette preuve (non mesuré)'], missing: [] });
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('unread', []))]), { lines: ["**Questions et fiche** : non mesuré (l'outil n'a pas pu vérifier quel modèle les a faites : la demande n'a pas pu être relue)"], missing: [] });
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('none', []))]), { lines: [], missing: [] });
  assert.deepEqual(upstreamCheck([runOf(runE('foundation'), up('proved', undefined, 'brief'))]).lines, ['**Questions et fiche projet** : faites par Fable (rôle « Plans et organisation »)']);
  assert.match(upstreamCheck([runOf(runE('foundation'))]).lines[0], /^\*\*Questions et fiche projet\*\* : non mesuré/);
});

test('upstreamCheck: the last upstream entry wins', () => {
  assert.equal(upstreamCheck([runOf(runE('build'), up('unproved'), up('proved'))]).missing.length, 0);
  assert.equal(upstreamCheck([runOf(runE('build'), up('proved'), up('unproved'))]).missing.length, 1);
});

test('upstreamCheck expects nothing from a run journaled by older scripts', () => {
  const old = (stage) => runOf({ t: t(), kind: 'run', stage, issue: 42, pr: null }, agent('opus'), red(), green());
  assert.deepEqual(upstreamCheck([old('bugfix')]), { lines: [], missing: [] });
  assert.deepEqual(upstreamCheck([old('build')]), { lines: [], missing: [] });
});

test('summarize shows the upstream line after the sub-agents and alerts when unproved', () => {
  const proved = summarize([runOf(runE('build'), up('proved'))], { stages: {} });
  assert.match(proved.body, /\*\*Sous-agents\*\*[^\n]*\n\n\*\*Questions et fiche\*\* : faites par Fable/);
  assert.equal(proved.alerts.filter((a) => /Questions et fiche/.test(a)).length, 0);
  const un = summarize([runOf(runE('build'), up('unproved'))], { stages: {} });
  assert.equal(un.alerts.filter((a) => /Questions et fiche/.test(a)).length, 1);
});

test('summarize: a build whose proof was not read shows « non mesuré », never an alert', () => {
  const res = summarize([runOf(runE('build'))], { stages: {} });
  assert.deepEqual(res.alerts.filter((a) => /Questions et fiche|modèle/.test(a)), []);
  assert.match(res.body, /\*\*Questions et fiche\*\* : non mesuré/);
  assert.doesNotMatch(res.body, /journal-check/);
});

test('a malformed « by » in the journal does not break the Fabrication lines', () => {
  for (const by of [null, 'fable', [null, { model: 'fable', role: 'plan' }, 3]]) {
    const res = upstreamCheck([runOf(runE('build'), { ...up('proved'), by })]);
    assert.equal(res.lines.length, 1, String(by));
  }
  assert.equal(upstreamCheck([runOf(runE('build'), { ...up('proved'), by: [null, { model: 'fable', role: 'plan' }] })]).lines[0], '**Questions et fiche** : faites par Fable (rôle « Plans et organisation »)');
});

const complete = (entry) => j(runE('build'), ...['writing-plans', 'test-driven-development', 'requesting-code-review', 'impeccable'].map((name) => ({ t: t(), kind: 'skill', name })),
  red(), green(), entry);

test('the journal check lists the upstream proof on a build, not on a catch-up run', () => {
  const current = complete(up('unproved'));
  const files = ['app/page.tsx', '.factory/journal/s.jsonl'];
  assert.match(report(files, () => current, stages, { stage: 'build', current }), /questions et fiche/);
  assert.doesNotMatch(report(files, () => current, stages, { stage: 'skills-fix', current }), /questions et fiche/);
  const ok = complete(up('proved'));
  assert.doesNotMatch(report(files, () => ok, stages, { stage: 'build', current: ok }), /questions et fiche/);
});

// Task 2: the marker printed by upstream.mjs, the proof read from the issue's comments, and the command line.
const { upstreamMarker, readUpstream, upstreamProof, latestRun, upstreamEntry, UPSTREAM_GRACE_MS, TEXT_PROOF, proofText, textHash, subagentRecord, writtenTexts, ranOn, upstreamVerdict } = await import('../agent/scripts/upstream.mjs');
const { spawnSync } = await import('node:child_process');
const { appendFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');

// Issue #559: the proof comes from Claude Code's own record of the thinking sub-agent.
const TEXT = '<!-- factory-agent -->\n<!-- factory-spec -->\n## Spec (version 1)\n\nLe texte.';
const SIGN = '\n\n---\n_Généré par [Claude Code](https://claude.ai/code) · software factory_\n';
// A sub-agent's record: one assistant line per Write, Edit, then its final text block (none when `final` is null).
const rec = ({ model = 'claude-fable-5-2', writes = [['/tmp/c.md', TEXT]], edits = [], final = 'Rendu.' } = {}) => {
  const lines = [];
  const say = (block) => lines.push({ type: 'assistant', timestamp: t(), message: { model, content: [block] } });
  for (const [file_path, content] of writes) say({ type: 'tool_use', id: `w${lines.length}`, name: 'Write', input: { file_path, content } });
  for (const [file_path, old_string, new_string] of edits) say({ type: 'tool_use', id: `e${lines.length}`, name: 'Edit', input: { file_path, old_string, new_string } });
  if (final != null) say({ type: 'text', text: final });
  return lines;
};
// A HOME holding the sub-agents' records of `session`, as Claude Code keeps them.
const home = (session, records) => {
  const dir = mkdtempSync(join(tmpdir(), 'home-'));
  const sub = join(dir, '.claude/projects/p', session, 'subagents');
  mkdirSync(sub, { recursive: true });
  records.forEach(({ id, lines }, i) => {
    writeFileSync(join(sub, `agent-a${i}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    writeFileSync(join(sub, `agent-a${i}.meta.json`), JSON.stringify({ agentType: 'general-purpose', toolUseId: id }));
  });
  return dir;
};
const comment = (body, h = 5) => ({ body, created_at: new Date(Date.parse('2026-11-20T10:00:00Z') + h * 3600_000).toISOString(), user: { login: 'o' } });

test('proofText leaves out the proof line and the signatures, and nothing else', () => {
  const marker = '<!-- factory-upstream stage=spec model=fable role=plan text=0123456789abcdef -->';
  for (const body of [TEXT + '\n\n' + marker + SIGN, TEXT + SIGN, TEXT.replace(/\n/g, ' \r\n') + '  \r\n',
    TEXT + '\n\n' + marker + SIGN + '\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_\n']) assert.equal(proofText(body), TEXT, JSON.stringify(body));
  assert.notEqual(textHash(TEXT.replace('Le texte.', 'Le texte!')), textHash(TEXT));
  assert.match(textHash(TEXT), /^[0-9a-f]{16}$/);
});

test('proofText cuts at the marker wherever it sits, as readUpstream finds it', () => {
  const marker = '<!-- factory-upstream stage=spec model=fable role=plan text=0123456789abcdef -->';
  for (const body of [TEXT + marker + SIGN, TEXT + '\n\n   ' + marker + SIGN, TEXT + SIGN + '\n' + marker + '\n']) {
    assert.ok(readUpstream(body), JSON.stringify(body));
    assert.equal(proofText(body), TEXT, JSON.stringify(body));
  }
});

test('proofText keeps what the pilot added after the marker, signatures aside', () => {
  const marker = '<!-- factory-upstream stage=spec model=fable role=plan text=0123456789abcdef -->';
  const added = TEXT + '\n\n' + marker + '\n\nUn paragraphe ajouté par le pilote.' + SIGN;
  assert.notEqual(proofText(added), TEXT);
  assert.match(proofText(added), /Un paragraphe ajouté par le pilote\./);
  assert.equal(proofText(TEXT + '\n\n' + marker + '\n\n---\n_Généré par la factory_\n\n---\n_Generated by Claude_\n'), TEXT, 'signature blocks without a link');
  assert.notEqual(proofText(TEXT + '\n\n' + marker + '\n\n---\nUne section après un trait.' + SIGN), TEXT, 'a rule followed by text is not a signature');
});

test('the real spec comment of #559 (old marker, two signatures) keeps its text', () => {
  const body = readFileSync(new URL('./fixtures/upstream-spec-559.md', import.meta.url), 'utf8');
  assert.equal(proofText(body), body.split('<!-- factory-upstream')[0].trim());
});

test('subagentRecord finds the record of a sub-agent by the id of its launch', () => {
  const dir = home('s1', [{ id: 'tu1', lines: rec({ final: 'un' }) }, { id: 'tu2', lines: rec({ final: 'deux' }) }]);
  const projectsDir = join(dir, '.claude/projects');
  assert.equal(subagentRecord('s1', 'tu2', { projectsDir }).at(-1).message.content[0].text, 'deux');
  assert.equal(subagentRecord('s1', 'tu3', { projectsDir }), null);
  assert.equal(subagentRecord('s2', 'tu1', { projectsDir }), null);
  assert.equal(subagentRecord('s1', 'tu1', { projectsDir: join(dir, 'nowhere') }), null);
  writeFileSync(join(projectsDir, 'p/s1/subagents/agent-a0.meta.json'), '{ not json');
  assert.equal(subagentRecord('s1', 'tu1', { projectsDir }), null);
});

test('writtenTexts replays the Write and Edit calls: the final content of each file', () => {
  assert.deepEqual(writtenTexts(rec({ writes: [['/f', 'A'], ['/f', 'B']] })), ['B']);
  assert.deepEqual(writtenTexts(rec({ writes: [['/f', 'Le texte.']], edits: [['/f', 'texte', 'mot']] })), ['Le mot.']);
  assert.deepEqual(writtenTexts(rec({ writes: [['/f', 'Le texte.']], edits: [['/f', 'absent', 'mot']] })), []);
  const bash = [{ type: 'assistant', timestamp: t(), message: { model: 'fable', content: [{ type: 'tool_use', name: 'Bash', input: { command: `cat > /f <<'EOF'\n${TEXT}\nEOF` } }] } }];
  assert.deepEqual(writtenTexts(bash), []);
});

// Claude Code answers each tool call in a user line; a refused one (is_error) changed nothing.
const refused = (lines, id) => [...lines, { type: 'user', timestamp: t(), message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'String to replace not found' }] } }];
test('writtenTexts does not replay a refused Write or Edit', () => {
  const lines = rec({ writes: [['/f', 'Le texte.']], edits: [['/f', 'texte', 'mot']], final: null });
  const editId = lines.at(-1).message.content[0].id;
  assert.deepEqual(writtenTexts(refused(lines, editId)), ['Le texte.']);
  const writeId = lines[0].message.content[0].id;
  assert.deepEqual(writtenTexts(refused(rec({ writes: [['/f', 'A'], ['/f', 'B']], final: null }), writeId)), ['B']);
  const two = rec({ writes: [['/f', 'A'], ['/f', 'B']], final: null });
  assert.deepEqual(writtenTexts(refused(two, two[1].message.content[0].id)), ['A'], 'the second Write was refused');
});

test('ranOn: every answer of the record came from the model of the role', () => {
  assert.equal(ranOn(rec(), 'fable'), true);
  assert.equal(ranOn([...rec(), ...rec({ model: 'claude-opus-5-5' })], 'fable'), false);
  assert.equal(ranOn(rec({ model: '<synthetic>' }), 'fable'), false);
  assert.equal(ranOn([{ type: 'user', message: { content: 'x' } }], 'fable'), false);
  assert.equal(ranOn([...rec(), ...rec({ model: '<synthetic>', writes: [] })], 'fable'), true);
});

const verdictOf = (run, text, records) => upstreamVerdict(run, { text, record: (a) => records[a.id] ?? null });

test('spec case « un seul sous-agent d\'un autre rôle »: no proof', () => {
  const run = runOf(runE('spec'), agent('fable', { role: 'code', id: 'a' }), agent('fable', { role: null, id: 'b' }));
  const v = verdictOf(run, TEXT, { a: rec(), b: rec() });
  assert.deepEqual(v, { ok: false, why: 'none' });
  assert.equal(upstreamMarker(run, v), null);
});

test('spec case « le vrai sous-agent de réflexion »: proved, and the marker reads back', () => {
  const run = runOf(runE('spec'), agent('fable', { role: 'plan', up: true, id: 'a' }));
  const v = verdictOf(run, TEXT, { a: rec() });
  assert.deepEqual(v, { ok: true, model: 'fable', role: 'plan', hash: textHash(TEXT) });
  const marker = upstreamMarker(run, v);
  assert.equal(marker, `<!-- factory-upstream stage=spec model=fable role=plan text=${textHash(TEXT)} -->`);
  assert.deepEqual(readUpstream(marker), { stage: 'spec', model: 'fable', role: 'plan', text: textHash(TEXT) });
  assert.deepEqual(upstreamProof([comment(TEXT + '\n\n' + marker + SIGN)]), { kind: 'upstream', doc: 'spec', status: 'proved', by: [{ model: 'fable', role: 'plan' }] });
});

test('spec case « relais par le rôle Revue »: the review sub-agent that wrote the text is named', () => {
  const run = runOf(runE('spec'), agent('fable', { role: 'plan', up: true, id: 'a' }), agent('fable', { role: 'review', up: true, id: 'b' }));
  assert.deepEqual(verdictOf(run, TEXT, { a: rec({ writes: [] }), b: rec() }), { ok: true, model: 'fable', role: 'review', hash: textHash(TEXT) });
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('proved', [{ model: 'fable', role: 'review' }]))]).lines, ['**Questions et fiche** : faites par Fable (rôle « Revue »)']);
});

test('spec case « texte réécrit par l\'agent qui pilote »: no proof', () => {
  const run = runOf(runE('spec'), agent('fable', { role: 'plan', up: true, id: 'a' }));
  const rewritten = TEXT.replace('Le texte.', 'Un autre texte.');
  assert.deepEqual(verdictOf(run, rewritten, { a: rec() }), { ok: false, why: 'text' });
  const marker = upstreamMarker(run, verdictOf(run, TEXT, { a: rec() }));
  for (const h of [-5, 5]) {
    assert.deepEqual(upstreamProof([comment(rewritten + '\n\n' + marker + SIGN, h)], { since: '2026-11-20T10:00:00Z' }),
      { kind: 'upstream', doc: 'spec', status: 'unproved', by: [] }, String(h));
  }
});

// A fresh thinking sub-agent may correct the file another one wrote (Read then Edit): the records are replayed together.
test('upstreamVerdict replays every thinking sub-agent of the run, in order', () => {
  const draft = TEXT.replace('Le texte.', 'Le brouillon.');
  const fix = (model = 'claude-fable-5-2') => rec({ model, writes: [], edits: [['/tmp/c.md', 'Le brouillon.', 'Le texte.']] });
  const both = runOf(runE('spec'), agent('fable', { role: 'plan', up: true, id: 'a' }), agent('fable', { role: 'review', up: true, id: 'b' }));
  assert.deepEqual(verdictOf(both, TEXT, { a: rec({ writes: [['/tmp/c.md', draft]] }), b: fix() }), { ok: true, model: 'fable', role: 'review', hash: textHash(TEXT) });
  const plans = runOf(runE('spec'), agent('fable', { role: 'plan', up: true, id: 'a' }), agent('fable', { role: 'plan', up: true, id: 'b' }));
  assert.deepEqual(verdictOf(plans, TEXT, { a: rec({ writes: [['/tmp/c.md', draft]] }), b: fix() }), { ok: true, model: 'fable', role: 'plan', hash: textHash(TEXT) }, 'a fresh plan sub-agent');
  assert.deepEqual(verdictOf(plans, TEXT, { a: rec({ model: 'claude-opus-5-5', writes: [['/tmp/c.md', draft]] }), b: fix() }), { ok: false, why: 'model' }, 'the draft came from another model');
  assert.deepEqual(verdictOf(plans, TEXT, { a: rec({ model: 'claude-opus-5-5' }), b: rec() }), { ok: true, model: 'fable', role: 'plan', hash: textHash(TEXT) }, 'rewritten whole by the right model');
  assert.deepEqual(verdictOf(plans, TEXT, { b: fix() }), { ok: false, why: 'text' }, 'the draft is unknown: the edit proves nothing');
  const mixed = runOf(runE('spec'), agent('fable', { role: 'plan', up: true, id: 'a' }), agent('fable', { role: 'code', id: 'c' }), agent('fable', { role: 'review', up: true, id: 'b' }));
  assert.deepEqual(verdictOf(mixed, TEXT, { a: rec({ writes: [['/tmp/c.md', draft]] }), c: fix(), b: rec({ writes: [] }) }), { ok: false, why: 'text' }, 'a sub-agent of another role does not count');
});

test('upstreamVerdict refuses a missing record, another model, a launch without id', () => {
  const run = runOf(runE('spec'), agent('fable', { role: 'plan', up: true, id: 'a' }));
  assert.deepEqual(verdictOf(run, TEXT, {}), { ok: false, why: 'record' });
  assert.deepEqual(verdictOf(run, TEXT, { a: rec({ model: 'claude-opus-5-5' }) }), { ok: false, why: 'model' });
  assert.deepEqual(verdictOf(runOf(runE('spec'), agent('fable', { role: 'plan', up: true })), TEXT, { undefined: rec() }), { ok: false, why: 'none' });
  assert.deepEqual(verdictOf(run, '', { a: rec({ writes: [['/f', '']] }) }), { ok: false, why: 'text' });
});

test('readUpstream reads the marker back, only for the plan or review role', () => {
  assert.deepEqual(readUpstream('texte\n<!-- factory-upstream stage=spec model=fable role=plan text=0123456789abcdef -->\n---'), { stage: 'spec', model: 'fable', role: 'plan', text: '0123456789abcdef' });
  assert.equal(readUpstream('<!-- factory-upstream stage=spec model=fable role=code -->'), null);
  assert.equal(readUpstream('<!-- factory-spec -->\nrien'), null);
});

const SINCE = '2026-11-20T10:00:00Z';
const at = (h) => new Date(Date.parse(SINCE) + h * 3600_000).toISOString();
const MARK = '<!-- factory-upstream stage=spec model=fable role=plan -->';
test('a marker printed before #559 (no text=) is still read', () => {
  assert.deepEqual(readUpstream(MARK), { stage: 'spec', model: 'fable', role: 'plan', text: null });
});
const c = (body, h, user = { login: 'o' }, extra = {}) => ({ body, created_at: at(h), user, ...extra });

// A marker without text= proves something only on a comment published before the text proof reached the project
// (`textSince`), grace period included: after that, every proof carries its text's hash.
test('a marker without text= is valid only before the text proof was delivered', () => {
  const body = `<!-- factory-agent -->\n<!-- factory-spec -->\n## Spec\n\n${MARK}\n`;
  const proved = { kind: 'upstream', doc: 'spec', status: 'proved', by: [{ model: 'fable', role: 'plan' }] };
  assert.deepEqual(upstreamProof([c(body, 1)], { since: SINCE, textSince: at(0) }), proved, 'within the grace period');
  assert.deepEqual(upstreamProof([c(body, -1)], { since: SINCE, textSince: at(0) }), proved, 'before');
  assert.deepEqual(upstreamProof([c(body, 4)], { since: SINCE, textSince: at(0) }), { kind: 'upstream', doc: 'spec', status: 'unproved', by: [] }, 'after');
  assert.deepEqual(upstreamProof([c(body, 4)], { since: SINCE }), proved, 'delivery unknown: as before');
  const real = readFileSync(new URL('./fixtures/upstream-spec-559.md', import.meta.url), 'utf8');
  assert.deepEqual(upstreamProof([{ body: real, created_at: '2026-11-23T09:00:00Z', user: { login: 'o' } }], { since: SINCE, textSince: '2026-11-24T12:50:32Z' }), proved, 'the real #559 spec');
});
const spec = (marked, h, user) => c(`<!-- factory-agent -->\n<!-- factory-spec -->\n## Spec\n${marked ? `\n${MARK}\n` : ''}`, h, user);

test('upstreamProof reads the latest trusted spec', () => {
  assert.equal(UPSTREAM_GRACE_MS, 3 * 3600_000);
  assert.deepEqual(upstreamProof([spec(true, 5)], { since: SINCE, owner: 'o' }), { kind: 'upstream', doc: 'spec', status: 'proved', by: [{ model: 'fable', role: 'plan' }] });
  const v2 = upstreamProof([spec(true, 1), spec(false, 4)], { since: SINCE, owner: 'o' });
  assert.equal(v2.status, 'unproved');
  assert.deepEqual(v2.by, [{ model: 'fable', role: 'plan' }]);
  for (const [h, since] of [[-5, SINCE], [2, SINCE], [10, null]]) assert.equal(upstreamProof([spec(false, h)], { since, owner: 'o' }).status, 'old', `${h} ${since}`);
  const intruder = upstreamProof([spec(false, 4), spec(true, 5, { login: 'x' }), { ...spec(true, 6), user: { login: 'x' }, author_association: 'NONE' }], { since: SINCE, owner: 'o' });
  assert.equal(intruder.status, 'unproved');
  assert.deepEqual(intruder.by, []);
  assert.equal(upstreamProof([c(`<!-- factory-brief -->\n${MARK}`, 5)], { doc: 'brief', since: SINCE, owner: 'o' }).status, 'proved');
  assert.equal(upstreamProof([c(`<!-- factory-brief -->\n${MARK}`, 5)], { since: SINCE, owner: 'o' }).status, 'none');
  const rounds = upstreamProof([c(`Questions\n${MARK}`, 1), c(`Questions\n${MARK.replace('fable', 'opus')}`, 2)], { since: SINCE, owner: 'o' });
  assert.equal(rounds.status, 'none');
  assert.deepEqual(rounds.by, [{ model: 'fable', role: 'plan' }, { model: 'opus', role: 'plan' }]);
});

test('latestRun keeps the most recent run of the issue asked for', () => {
  const files = { '.factory/journal/a.jsonl': j({ t: '2026-11-20T10:00:00Z', kind: 'run', stage: 'grilling', issue: 12 }), '.factory/journal/b.jsonl': j({ t: '2026-11-21T10:00:00Z', kind: 'run', stage: 'grilling', issue: 13 }), 'app/x.ts': 'x' };
  const read = (f) => files[f];
  assert.equal(latestRun(Object.keys(files), read).file, '.factory/journal/b.jsonl');
  assert.equal(latestRun(Object.keys(files), read, { issue: 12 }).file, '.factory/journal/a.jsonl');
  assert.equal(latestRun(Object.keys(files), read, { issue: 14 }), null);
});

test('upstreamEntry: a spec for a build, a brief for a foundation, nothing for a bugfix', () => {
  assert.equal(upstreamEntry(runOf(runE('bugfix')), [], { since: SINCE, owner: 'o' }), null);
  assert.equal(upstreamEntry(runOf(runE('foundation')), [], { since: SINCE, owner: 'o' }).doc, 'brief');
  assert.deepEqual(upstreamEntry(runOf(runE('build')), null, { since: SINCE, owner: 'o' }), { kind: 'upstream', doc: 'spec', status: 'unread', by: [] });
  assert.equal(upstreamEntry(runOf(runE('build')), [spec(true, 5)], { since: SINCE, owner: 'o' }).status, 'proved');
});

const SCRIPT = new URL('../agent/scripts/upstream.mjs', import.meta.url).pathname;
const EMPTY_HOME = mkdtempSync(join(tmpdir(), 'home-'));
// `args` may hold FILE: the path of a file holding `text`.
const cli = (entries, args, { home = EMPTY_HOME, text = TEXT } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'upstream-'));
  mkdirSync(join(dir, '.factory/journal'), { recursive: true });
  writeFileSync(join(dir, '.factory/journal/s.jsonl'), j(...entries) + '\n');
  writeFileSync(join(dir, 'c.md'), text);
  return spawnSync(process.execPath, [SCRIPT, ...args.map((a) => (a === 'FILE' ? join(dir, 'c.md') : a))], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: home } });
};
const planUp = (id = 'tu1') => agent('fable', { role: 'plan', up: true, id });

test('upstream.mjs prints the marker only when the announced plan sub-agent wrote this text', () => {
  const homeDir = home('s', [{ id: 'tu1', lines: rec() }]);
  const ok = cli([runE('grilling', { issue: 12 }), planUp()], ['12', 'FILE'], { home: homeDir });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), `<!-- factory-upstream stage=grilling model=fable role=plan text=${textHash(TEXT)} -->`);
  const other = cli([runE('grilling', { issue: 12 }), planUp()], ['12', 'FILE'], { home: homeDir, text: TEXT.replace('Le texte.', 'Un autre texte.') });
  assert.equal(other.status, 1);
  assert.equal(other.stdout, '');
  assert.match(other.stderr, /n'est pas celui que le sous-agent a écrit/);
  const code = cli([runE('grilling', { issue: 12 }), agent('fable', { role: 'code', id: 'tu1' })], ['12', 'FILE'], { home: homeDir });
  assert.equal(code.status, 1);
  assert.equal(code.stdout, '');
  assert.match(code.stderr, /aucun sous-agent du rôle `plan`/);
  assert.match(code.stderr, /`model`[^\n]*models\.plan\.model/);
  assert.doesNotMatch(code.stdout + code.stderr, /factory-upstream/);
  assert.match(other.stderr, /réécrire le fichier en entier avec l'outil Write/);
  assert.match(other.stderr, /Bash/);
  assert.match(other.stderr, /publie ce fichier tel quel/);
  const lost = cli([runE('grilling', { issue: 12 }), planUp()], ['12', 'FILE']);
  assert.equal(lost.status, 1);
  assert.match(lost.stderr, /relevé du sous-agent de réflexion est introuvable/);
  assert.match(lost.stderr, /Relancer ne changera rien : publie sans la ligne/);
  assert.doesNotMatch(lost.stderr, /Si elle refuse encore/);
  assert.equal(cli([runE('grilling', { issue: 12 }), planUp()], ['13', 'FILE'], { home: homeDir }).status, 1);
});

test('upstream.mjs without an issue number or a file says how to call it', () => {
  for (const args of [[], ['abc', 'FILE'], ['12'], ['12', '/nonexistent/c.md']]) {
    const res = cli([runE('grilling', { issue: 12 }), planUp()], args);
    assert.equal(res.status, 1);
    assert.equal(res.stdout, '');
    assert.match(res.stderr, /numéro de la demande/);
    assert.doesNotMatch(res.stderr, /#(undefined|abc)/);
  }
});

test('upstream.mjs ignores a run of another session older than 12 hours', () => {
  const old = new Date(Date.now() - 13 * 3600_000).toISOString();
  const homeDir = home('s', [{ id: 'tu1', lines: rec() }]);
  assert.equal(cli([{ ...runE('grilling', { issue: 12 }), t: old }, { ...planUp(), t: old }], ['12', 'FILE'], { home: homeDir }).status, 1);
});

// Hooks not loaded (a routine serving several projects): the journal comes from Claude Code's transcript, which
// grows as the session goes on. The plan sub-agent launched after a first refusal must be seen by the retry.
test('upstream.mjs sees the plan sub-agent launched after a first refusal, from the transcript', () => {
  const homeDir = home('sess-1', [{ id: 'x', lines: rec() }]);
  const session = join(homeDir, '.claude/projects/p/sess-1.jsonl');
  const payload = { repo: 'o/p', issue: 12, pr: null, stage: 'grilling', models: { plan: { model: 'fable' }, review: { model: 'fable' } } };
  const line = (o) => JSON.stringify({ timestamp: t(), ...o });
  writeFileSync(session, line({ type: 'user', message: { role: 'user', content: `Run\n${JSON.stringify(payload)}` } }) + '\n');
  const dir = mkdtempSync(join(tmpdir(), 'upstream-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/o/p.git'], { cwd: dir });
  writeFileSync(join(dir, 'c.md'), TEXT);
  const run = () => spawnSync(process.execPath, [SCRIPT, '12', 'c.md'], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: homeDir } });
  assert.equal(run().status, 1);
  appendFileSync(session, line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Agent', input: { model: 'fable', description: '[role:plan:amont] phase amont' } }] } }) + '\n');
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), `<!-- factory-upstream stage=grilling model=fable role=plan text=${textHash(TEXT)} -->`);
  assert.match(readFileSync(join(dir, '.factory/journal/sess-1.jsonl'), 'utf8'), /"kind":"agent"/);
});

// Issue #550, build time: what journal-check appends to the run's journal after reading the request back.
const { upstreamUpdate } = await import('../agent/scripts/journal-check.mjs');
const journalOf = (...entries) => ({ '.factory/journal/s.jsonl': j(...entries), 'app/x.ts': 'x' });
const update = (journal, opts) => upstreamUpdate(Object.keys(journal), (f) => journal[f] ?? null, { repo: 'o/p', since: SINCE, ...opts });

test('upstreamUpdate appends what the request shows, once', () => {
  const comments = () => [spec(true, 5)];
  const res = update(journalOf(runE('build')), { comments });
  assert.equal(res.file, '.factory/journal/s.jsonl');
  assert.deepEqual(res.entry, { kind: 'upstream', doc: 'spec', status: 'proved', by: [{ model: 'fable', role: 'plan' }] });
  assert.equal(update(journalOf(runE('build'), up('proved')), { comments }), null, 'no duplicate');
  assert.equal(update(journalOf(runE('build'), up('old', [])), { comments }).entry.status, 'proved');
  assert.equal(update(journalOf(runE('grilling')), { comments }), null, 'only a build or a foundation');
  assert.equal(update(journalOf(runE('build')), { comments, textSince: at(0) }).entry.status, 'unproved', 'a marker without text= after the delivery');
});

test('upstreamUpdate writes « unread » when the request cannot be read, never over a measured entry', () => {
  const fail = () => { throw new Error('offline'); };
  assert.equal(update(journalOf(runE('build')), { comments: fail }).entry.status, 'unread');
  assert.equal(update(journalOf(runE('build')), { repo: null, comments: () => [spec(true, 5)] }).entry.status, 'unread');
  for (const status of ['proved', 'unproved', 'old']) assert.equal(update(journalOf(runE('build'), up(status)), { comments: fail }), null, status);
  assert.equal(update(journalOf(runE('build'), up('unread', [])), { comments: fail }), null);
});

// Issue #550: the proof is required from the day the instruction reached the project's AGENT.md. After a rollback of
// the factory and a new delivery, it counts from the new delivery: a spec published while it was rolled back is « old ».
const { upstreamSince } = await import('../agent/scripts/journal-check.mjs');
test('upstreamSince is the date of the latest delivery of the upstream instruction', () => {
  const dir = mkdtempSync(join(tmpdir(), 'since-'));
  const git = (args, date) => spawnSync('git', args, {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).stdout;
  const run = (args) => git(args);
  const commit = (text, date) => {
    mkdirSync(join(dir, '.factory/scripts'), { recursive: true });
    writeFileSync(join(dir, '.factory/AGENT.md'), text);
    writeFileSync(join(dir, '.factory/scripts/upstream.mjs'), '// script\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'sync'], date);
  };
  git(['init', '-q']);
  assert.equal(upstreamSince(run), null, 'no history: unknown');
  commit('# Agent\n', '2026-01-01T00:00:00Z');
  assert.equal(upstreamSince(run), null, 'instruction not delivered yet');
  commit('# Agent\nlance `node .factory/scripts/upstream.mjs <n>`\n', '2026-02-01T00:00:00Z');
  assert.equal(Date.parse(upstreamSince(run)), Date.parse('2026-02-01T00:00:00Z'));
  commit('# Agent\n', '2026-03-01T00:00:00Z'); // rollback
  assert.equal(upstreamSince(run), null, 'rolled back: the proof is not asked for');
  commit('# Agent\nautre texte\nlance `node .factory/scripts/upstream.mjs <n>`\n', '2026-04-01T00:00:00Z'); // re-delivery
  assert.equal(Date.parse(upstreamSince(run)), Date.parse('2026-04-01T00:00:00Z'));
  commit('# Agent\nautre texte modifié\nlance `node .factory/scripts/upstream.mjs <n>`\n', '2026-05-01T00:00:00Z');
  assert.equal(Date.parse(upstreamSince(run)), Date.parse('2026-04-01T00:00:00Z'), 'a later edit keeps the delivery date');
  assert.equal(upstreamSince(() => { throw new Error('no git'); }), null);
});

test('upstreamSince dates the delivery of the text proof from the project\'s upstream.mjs', () => {
  assert.ok(readFileSync(SCRIPT, 'utf8').includes(TEXT_PROOF), 'the script carries the string that dates it');
  const dir = mkdtempSync(join(tmpdir(), 'since-'));
  const git = (args, date) => spawnSync('git', args, {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).stdout;
  const commit = (script, date) => {
    mkdirSync(join(dir, '.factory/scripts'), { recursive: true });
    writeFileSync(join(dir, '.factory/AGENT.md'), 'lance `node .factory/scripts/upstream.mjs <n>`\n');
    writeFileSync(join(dir, '.factory/scripts/upstream.mjs'), script);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'sync'], date);
  };
  git(['init', '-q']);
  const textSince = () => upstreamSince((args) => git(args), { file: '.factory/scripts/upstream.mjs', needle: TEXT_PROOF });
  commit('// old script\n', '2026-01-01T00:00:00Z');
  assert.equal(textSince(), null, 'not delivered yet');
  commit(`// new script ${TEXT_PROOF}\n`, '2026-11-25T00:00:00Z');
  assert.equal(Date.parse(textSince()), Date.parse('2026-11-25T00:00:00Z'));
  assert.equal(Date.parse(upstreamSince((args) => git(args))), Date.parse('2026-01-01T00:00:00Z'), 'the instruction keeps its own date');
});

test('upstream.mjs, when it refuses during a build or a foundation, says not to publish again', () => {
  for (const stage of ['build', 'foundation']) {
    const res = cli([runE(stage, { issue: 12 })], ['12', 'FILE']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /ne republie rien/, stage);
    assert.doesNotMatch(res.stderr, /publie sans la ligne/, stage);
  }
  assert.match(cli([runE('spec', { issue: 12 })], ['12', 'FILE']).stderr, /publie sans la ligne/);
});

test('upstreamUpdate measures the latest build of the branch, even when a later run resumed it', () => {
  const journals = {
    '.factory/journal/a.jsonl': j(runE('build')),
    '.factory/journal/b.jsonl': j(runE('fix-checks')),
  };
  const res = update(journals, { comments: () => [spec(true, 5)] });
  assert.equal(res?.file, '.factory/journal/a.jsonl');
  assert.equal(res.entry.status, 'proved');
});

test('upstreamUpdate never writes « unread » over a measured entry of an earlier build of the branch', () => {
  const fail = () => { throw new Error('offline'); };
  const journals = {
    '.factory/journal/a.jsonl': j(runE('build'), up('proved')),
    '.factory/journal/b.jsonl': j(runE('build')),
  };
  assert.equal(update(journals, { comments: fail }), null);
  assert.equal(update(journals, { comments: () => [spec(true, 5)] }), null, 'same as the newest entry');
  assert.equal(update(journals, { comments: () => [spec(false, 5)] })?.file, '.factory/journal/b.jsonl');
});

// A build journaled by older scripts (no `models`) is neither a target nor the newest entry, as in upstreamCheck.
test('upstreamUpdate ignores a build journaled without models', () => {
  const comments = () => [spec(true, 5)];
  const old = { '.factory/journal/a.jsonl': j(runE('build', { models: undefined })), '.factory/journal/b.jsonl': j(runE('fix-checks')) };
  assert.equal(update(old, { comments }), null, 'no target');
  const journals = {
    '.factory/journal/a.jsonl': j(runE('build', { models: undefined }), up('old', [])),
    '.factory/journal/c.jsonl': j(runE('build')),
  };
  const res = update(journals, { comments: () => [spec(false, -5)] });
  assert.equal(res?.file, '.factory/journal/c.jsonl', 'the entry of an old build does not count');
  assert.equal(res.entry.status, 'old');
});

test('journal-check stays quiet when the instruction came with the first commit of the project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quiet-'));
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  mkdirSync(join(dir, '.factory'));
  writeFileSync(join(dir, '.factory/AGENT.md'), 'lance `node .factory/scripts/upstream.mjs <n>`\n');
  git('add', '-A');
  git('commit', '-qm', 'first');
  git('remote', 'add', 'origin', 'https://github.com/o/p.git');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const script = new URL('../agent/scripts/journal-check.mjs', import.meta.url).pathname;
  const res = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: EMPTY_HOME } });
  assert.doesNotMatch(res.stderr, /invalid object name '[0-9a-f]+\^'/);
});

test('upstream.mjs, when no run is found, does not advise publishing without the line blindly', () => {
  const res = cli([], ['12', 'FILE']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /si tu es à une construction .*ne republie rien et continue/);
  assert.match(res.stderr, /sinon.*publie sans la ligne/);
});

// Issue #559, bug analysis: proved by the analysis sub-agent's own record, written to the bugfix journal.
const { returned, bugProof } = await import('../agent/scripts/upstream.mjs');
const { bugUpdate } = await import('../agent/scripts/journal-check.mjs');
const NEW_BUG_HOW = "analyse du bug : lance `node .factory/scripts/journal-check.mjs` depuis le dossier du projet (il lit le relevé du sous-agent d'analyse) ; s'il la demande encore, fais analyser le bug par un sous-agent du rôle `plan` (« Phase amont » dans AGENT.md), lancé avec la description `[role:plan:amont]` et `model` = `models.plan.model`, puis reproduis-le par un test rouge et corrige à partir de son analyse";
const recordsOf = (records) => (a) => records[a.id] ?? null;

test('returned: the sub-agent handed an answer back', () => {
  assert.equal(returned(rec()), true);
  assert.equal(returned(rec({ final: '' })), false);
  assert.equal(returned(rec({ final: null })), false, 'a last line that is a Write');
  const handback = (message) => [...rec({ final: null }), { type: 'assistant', timestamp: t(), message: { model: 'fable', content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message } }] } }];
  assert.equal(returned(handback('Analyse : la cause est…')), true);
  assert.equal(returned(handback('  ')), false);
});

test('returned: a sub-agent that ended on an API error handed nothing back', () => {
  const apiError = { type: 'assistant', isApiErrorMessage: true, timestamp: t(), message: { model: '<synthetic>', content: [{ type: 'text', text: 'API Error: 529 Overloaded' }] } };
  assert.equal(returned([...rec({ final: null }), apiError]), false, '<synthetic> and isApiErrorMessage');
  assert.equal(returned([...rec({ final: null }), { ...apiError, message: { ...apiError.message, model: 'claude-fable-5-2' } }]), false, 'isApiErrorMessage alone');
  assert.equal(returned([...rec({ final: null }), { ...apiError, isApiErrorMessage: undefined }]), false, '<synthetic> alone');
  assert.equal(returned([...rec(), apiError]), true, 'an answer before a later error line still counts');
  const run = runOf(runE('bugfix'), agent('fable', { role: 'plan', up: true, id: 'a' }));
  assert.equal(bugProof(run, recordsOf({ a: [...rec({ final: null }), apiError] })), null);
});

test('bug case « autre rôle, même modèle »: no proof, the alert and the new way out', () => {
  const r = rec();
  const run = runOf(runE('bugfix'), agent('fable', { role: 'code', id: 'a' }), red(), green());
  assert.equal(bugProof(run, recordsOf({ a: r })), null);
  const res = upstreamCheck([run]);
  assert.deepEqual(res.lines, []);
  assert.deepEqual(res.missing, [{ alert: BUG_ALERT, how: NEW_BUG_HOW }]);
});

test('bug case « le sous-agent d\'analyse »: proved before the fix began', () => {
  const r = rec();
  const entries = [runE('bugfix'), agent('fable', { role: 'plan', up: true, id: 'a' }), red(), green()];
  assert.deepEqual(bugProof(runOf(...entries), recordsOf({ a: r })), { kind: 'upstream', doc: 'bug', status: 'proved', by: [{ model: 'fable', role: 'plan' }] });
  assert.deepEqual(upstreamCheck([runOf(...entries, up('proved', [{ model: 'fable', role: 'plan' }], 'bug'))]),
    { lines: ['**Analyse du bug** : faite par Fable (rôle « Plans et organisation »)'], missing: [] });
});

test('bug case « relais »: the review sub-agent that handed the analysis back is named', () => {
  const a = rec({ final: '' });
  const b = rec();
  const run = runOf(runE('bugfix'), agent('fable', { role: 'plan', up: true, id: 'a' }), agent('fable', { role: 'review', up: true, id: 'b' }), red(), green());
  const entry = bugProof(run, recordsOf({ a, b }));
  assert.deepEqual(entry.by, [{ model: 'fable', role: 'review' }]);
  assert.deepEqual(upstreamCheck([runOf(runE('bugfix'), agent('fable', { role: 'review', up: true, id: 'b' }), red(), green(), up('proved', entry.by, 'bug'))]).lines,
    ['**Analyse du bug** : faite par Fable (rôle « Revue »)']);
});

test('bugProof refuses a missing record, another model, an analysis after the red test, the final reviewer', () => {
  const planUpA = () => agent('fable', { role: 'plan', up: true, id: 'a' });
  assert.equal(bugProof(runOf(runE('bugfix'), planUpA(), red(), green()), recordsOf({})), null);
  const opus = rec({ model: 'claude-opus-5-5' });
  assert.equal(bugProof(runOf(runE('bugfix'), planUpA(), red(), green()), recordsOf({ a: opus })), null);
  const late = runOf(runE('bugfix'), planUpA(), red(), green());
  assert.equal(bugProof(late, recordsOf({ a: rec() })), null, 'record ends after the red test');
  const r = rec();
  const reviewer = runOf(runE('bugfix'), red(), green(), agent('fable', { role: 'review', up: true, id: 'a' }));
  assert.equal(bugProof(reviewer, recordsOf({ a: r })), null, 'launched after the last red test');
});

const bugJournal = (...entries) => ({ '.factory/journal/s.jsonl': j(...entries), 'app/x.ts': 'x' });
const bugUp = (journal, records) => bugUpdate(Object.keys(journal), (f) => journal[f] ?? null, { record: (session, a) => (session === 's' ? records[a.id] ?? null : null) });

test('bugUpdate appends the proved analysis once, never anything else', () => {
  const r = rec();
  const entries = [runE('bugfix'), agent('fable', { role: 'plan', up: true, id: 'a' }), red(), green()];
  const res = bugUp(bugJournal(...entries), { a: r });
  assert.equal(res.file, '.factory/journal/s.jsonl');
  assert.deepEqual(res.entry, { kind: 'upstream', doc: 'bug', status: 'proved', by: [{ model: 'fable', role: 'plan' }] });
  assert.equal(bugUp(bugJournal(...entries, up('proved', res.entry.by, 'bug')), { a: r }), null, 'already proved');
  assert.equal(bugUp(bugJournal(...entries), {}), null, 'no record: nothing written');
  assert.equal(bugUp(bugJournal(...entries, runE('fix-checks')), { a: r }), null, 'the last run is not a bugfix');
  const two = { '.factory/journal/s.jsonl': j(...entries, up('proved', res.entry.by, 'bug')), '.factory/journal/z.jsonl': j(runE('fix-checks')) };
  assert.equal(bugUp(two, {}), null, 'a later run never replaces the proof');
});

// bugfix.md has journal-check run as soon as the analysis is handed back, before any test: the proof is journaled
// on the machine that holds the record, in case the fix goes on elsewhere.
test('bugUpdate proves the analysis right after it is handed back, before any red test', () => {
  const res = bugUp(bugJournal(runE('bugfix'), agent('fable', { role: 'plan', up: true, id: 'a' })), { a: rec() });
  assert.deepEqual(res?.entry, { kind: 'upstream', doc: 'bug', status: 'proved', by: [{ model: 'fable', role: 'plan' }] });
});

test('a bugfix journaled since #559 is proved only by its entry', () => {
  const run = runOf(runE('bugfix'), agent('fable', { role: null }), red(), green());
  const res = upstreamCheck([run]);
  assert.deepEqual(res.lines, []);
  assert.equal(res.missing[0].alert, BUG_ALERT);
});

test('journal-check lists the bug analysis on a bugfix until its entry is there', () => {
  const base = [runE('bugfix'), agent('fable', { role: 'plan', up: true, id: 'a' }), ...['systematic-debugging', 'test-driven-development', 'requesting-code-review'].map((name) => ({ t: t(), kind: 'skill', name })), red(), green()];
  const files = ['app/page.tsx', '.factory/journal/s.jsonl'];
  const without = j(...base);
  assert.match(report(files, () => without, stages, { stage: 'bugfix', current: without }), /analyse du bug/);
  const withEntry = j(...base, up('proved', [{ model: 'fable', role: 'plan' }], 'bug'));
  assert.doesNotMatch(report(files, () => withEntry, stages, { stage: 'bugfix', current: withEntry }), /analyse du bug/);
});
