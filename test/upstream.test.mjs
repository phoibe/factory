import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bugAnalysed, modelFamily, parseJournal, roleOf, summarize, upstreamAgent, upstreamCheck } from '../agent/scripts/fabrication.mjs';
import { report } from '../agent/scripts/journal-check.mjs';
import { MODEL_FAMILIES } from '../scripts/lib/models.mjs';

const j = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const FF = { plan: 'fable', review: 'fable' };
const stages = { plan: true, tdd: true, review: true, designPass: true };
// A real clock, one second per entry, starting a little before now (upstream.mjs only reads the runs of the last hours).
let clock = Date.now() - 3600_000;
const t = () => new Date((clock += 1000)).toISOString();
const runE = (stage, extra = {}) => ({ t: t(), kind: 'run', stage, issue: 42, pr: null, models: FF, ...extra });
const agent = (model) => ({ t: t(), kind: 'agent', model, effort: null, label: model });
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

test('upstreamAgent is the latest agent with a role (after an escalation, the model that succeeded)', () => {
  assert.deepEqual(upstreamAgent(runOf(runE('grilling', { models: { plan: 'opus', review: 'fable' } }), agent('opus'), agent('fable'), agent('sonnet'))), { model: 'fable', role: 'review' });
  assert.deepEqual(upstreamAgent(runOf(runE('grilling', { models: { plan: 'opus', review: 'fable' } }), agent('sonnet'), agent('claude-opus-5-5'))), { model: 'opus', role: 'plan' });
  assert.equal(upstreamAgent(runOf(runE('grilling'), agent('sonnet'))), null);
});

test('bugAnalysed: an agent with a role launched before the last red test', () => {
  assert.equal(bugAnalysed(runOf(runE('bugfix'), agent('fable'), agent('opus'), red(), green(), agent('fable'))), true, 'A');
  const b = [runE('bugfix'), agent('opus'), red(), green(), agent('fable')];
  assert.equal(bugAnalysed(runOf(...b)), false, 'B: the final reviewer is not the analysis');
  assert.equal(bugAnalysed(runOf(...b, agent('fable'), agent('opus'), red(), green())), true, 'C');
  assert.equal(bugAnalysed(runOf(runE('bugfix'), agent('fable'))), true, 'D');
});

const BUG_ALERT = "Correction du bug : l'outil n'a pas pu vérifier quel modèle a analysé le bug avant sa correction.";

test('upstreamCheck on a bugfix', () => {
  assert.deepEqual(upstreamCheck([runOf(runE('bugfix'), agent('fable'), red(), green())]),
    { lines: ['**Analyse du bug** : faite par Fable (rôle « Plans et organisation »)'], missing: [] });
  const res = upstreamCheck([runOf(runE('bugfix'), agent('opus'), red(), green(), agent('fable'))]);
  assert.deepEqual(res.lines, []);
  assert.equal(res.missing.length, 1);
  assert.equal(res.missing[0].alert, BUG_ALERT);
  assert.equal(res.missing[0].how, "analyse du bug : fais analyser le bug par un sous-agent du rôle `plan` (« Phase amont » dans AGENT.md), lancé avec `model` = `models.plan.model`, puis reproduis-le par un test rouge et corrige à partir de son analyse");
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
  assert.match(un.missing[0].how, /^questions et fiche : la fiche publiée ne porte pas la ligne de preuve\./);
  assert.match(un.missing[0].how, /upstream\.mjs 42/);
  assert.match(un.missing[0].how, /si `upstream\.mjs` refuse encore, ne republie rien/);
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
const { upstreamMarker, readUpstream, upstreamProof, latestRun, upstreamEntry, UPSTREAM_GRACE_MS } = await import('../agent/scripts/upstream.mjs');
const { spawnSync } = await import('node:child_process');
const { appendFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');

test('upstreamMarker names the model and role of the upstream thinking', () => {
  assert.equal(upstreamMarker(runOf(runE('spec'), agent('fable'))), '<!-- factory-upstream stage=spec model=fable role=plan -->');
  assert.equal(upstreamMarker(runOf(runE('spec', { models: { plan: 'opus', review: 'fable' } }), agent('claude-opus-5-5'))), '<!-- factory-upstream stage=spec model=opus role=plan -->');
  assert.equal(upstreamMarker(runOf(runE('spec'), agent('sonnet'))), null);
  assert.equal(upstreamMarker(runOf(runE('spec'))), null);
});

test('readUpstream reads the marker back, only for the plan or review role', () => {
  assert.deepEqual(readUpstream(`texte\n${upstreamMarker(runOf(runE('spec'), agent('fable')))}\n---`), { stage: 'spec', model: 'fable', role: 'plan' });
  assert.equal(readUpstream('<!-- factory-upstream stage=spec model=fable role=code -->'), null);
  assert.equal(readUpstream('<!-- factory-spec -->\nrien'), null);
});

const SINCE = '2026-11-20T10:00:00Z';
const at = (h) => new Date(Date.parse(SINCE) + h * 3600_000).toISOString();
const MARK = '<!-- factory-upstream stage=spec model=fable role=plan -->';
const c = (body, h, user = { login: 'o' }, extra = {}) => ({ body, created_at: at(h), user, ...extra });
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
const cli = (entries, ...args) => {
  const dir = mkdtempSync(join(tmpdir(), 'upstream-'));
  mkdirSync(join(dir, '.factory/journal'), { recursive: true });
  writeFileSync(join(dir, '.factory/journal/s.jsonl'), j(...entries) + '\n');
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: EMPTY_HOME } });
};

test('upstream.mjs prints the marker only when a plan sub-agent ran for this issue', () => {
  const ok = cli([runE('grilling', { issue: 12 }), agent('fable')], '12');
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), '<!-- factory-upstream stage=grilling model=fable role=plan -->');
  const none = cli([runE('grilling', { issue: 12 })], '12');
  assert.equal(none.status, 1);
  assert.equal(none.stdout, '');
  assert.match(none.stderr, /aucun sous-agent du rôle `plan`/);
  assert.match(none.stderr, /`model`[^\n]*models\.plan\.model/);
  assert.doesNotMatch(none.stdout + none.stderr, /factory-upstream/);
  assert.equal(cli([runE('grilling', { issue: 12 }), agent('fable')], '13').status, 1);
});

test('upstream.mjs without an issue number says how to call it', () => {
  for (const args of [[], ['abc']]) {
    const res = cli([runE('grilling', { issue: 12 }), agent('fable')], ...args);
    assert.equal(res.status, 1);
    assert.equal(res.stdout, '');
    assert.match(res.stderr, /numéro de la demande/);
    assert.doesNotMatch(res.stderr, /#(undefined|abc)/);
  }
});

test('upstream.mjs ignores a run of another session older than 12 hours', () => {
  const old = new Date(Date.now() - 13 * 3600_000).toISOString();
  assert.equal(cli([{ ...runE('grilling', { issue: 12 }), t: old }, { ...agent('fable'), t: old }], '12').status, 1);
});

// Hooks not loaded (a routine serving several projects): the journal comes from Claude Code's transcript, which
// grows as the session goes on. The plan sub-agent launched after a first refusal must be seen by the retry.
test('upstream.mjs sees the plan sub-agent launched after a first refusal, from the transcript', () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  mkdirSync(join(home, '.claude/projects/p'), { recursive: true });
  const session = join(home, '.claude/projects/p/sess-1.jsonl');
  const payload = { repo: 'o/p', issue: 12, pr: null, stage: 'grilling', models: { plan: { model: 'fable' }, review: { model: 'fable' } } };
  const line = (o) => JSON.stringify({ timestamp: t(), ...o });
  writeFileSync(session, line({ type: 'user', message: { role: 'user', content: `Run\n${JSON.stringify(payload)}` } }) + '\n');
  const dir = mkdtempSync(join(tmpdir(), 'upstream-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/o/p.git'], { cwd: dir });
  const run = () => spawnSync(process.execPath, [SCRIPT, '12'], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(run().status, 1);
  appendFileSync(session, line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Agent', input: { model: 'fable', description: 'phase amont' } }] } }) + '\n');
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), '<!-- factory-upstream stage=grilling model=fable role=plan -->');
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

test('upstream.mjs, when it refuses during a build or a foundation, says not to publish again', () => {
  for (const stage of ['build', 'foundation']) {
    const res = cli([runE(stage, { issue: 12 })], '12');
    assert.equal(res.status, 1);
    assert.match(res.stderr, /ne republie rien/, stage);
    assert.doesNotMatch(res.stderr, /publie sans la ligne/, stage);
  }
  assert.match(cli([runE('spec', { issue: 12 })], '12').stderr, /publie sans la ligne/);
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
