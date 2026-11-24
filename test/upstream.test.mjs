import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bugAnalysed, parseJournal, roleOf, summarize, upstreamAgent, upstreamCheck } from '../agent/scripts/fabrication.mjs';
import { report } from '../agent/scripts/journal-check.mjs';

const j = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const FF = { plan: 'fable', review: 'fable' };
const stages = { plan: true, tdd: true, review: true, designPass: true };
let clock = 0;
const t = () => `2026-11-24T10:${String(clock++).padStart(2, '0')}:00.000Z`;
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

test('roleOf matches a model to the plan role first, then the review role', () => {
  assert.equal(roleOf('claude-fable-5-2', FF), 'plan');
  assert.equal(roleOf('fable', { plan: 'opus', review: 'fable' }), 'review');
  assert.equal(roleOf('sonnet', FF), null);
  assert.equal(roleOf(null, FF), null);
  assert.equal(roleOf('fable', null), null);
});

test('upstreamAgent is the first agent with a role', () => {
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

const BUG_ALERT = 'Correction du bug : rien ne montre que le bug a été analysé par le modèle « Plans et organisation » avant sa correction.';

test('upstreamCheck on a bugfix', () => {
  assert.deepEqual(upstreamCheck([runOf(runE('bugfix'), agent('fable'), red(), green())]),
    { lines: ['**Analyse du bug** : faite par Fable (rôle « Plans et organisation »)'], missing: [] });
  const res = upstreamCheck([runOf(runE('bugfix'), agent('opus'), red(), green(), agent('fable'))]);
  assert.deepEqual(res.lines, []);
  assert.equal(res.missing.length, 1);
  assert.equal(res.missing[0].alert, BUG_ALERT);
  assert.equal(res.missing[0].how, "analyse du bug : fais analyser le bug par un sous-agent du rôle `plan` (« Phase amont » dans AGENT.md), puis reproduis-le par un test rouge et corrige à partir de son analyse");
});

test('upstreamCheck on a build or a foundation', () => {
  const none = upstreamCheck([runOf(runE('build'))]);
  assert.deepEqual(none.lines, []);
  assert.deepEqual(none.missing, [{ alert: 'Questions et fiche : la preuve n\'a pas été relevée.', how: 'questions et fiche : lance `node .factory/scripts/journal-check.mjs` depuis le dossier du projet (il relit la demande)' }]);
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('proved'))]), { lines: ['**Questions et fiche** : faites par Fable (rôle « Plans et organisation »)'], missing: [] });
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('proved', [{ model: 'opus', role: 'plan' }, { model: 'fable', role: 'review' }]))]).lines,
    ['**Questions et fiche** : faites par Opus (rôle « Plans et organisation »), Fable (rôle « Revue »)']);
  const un = upstreamCheck([runOf(runE('build'), up('unproved'))]);
  assert.deepEqual(un.lines, []);
  assert.equal(un.missing[0].alert, 'Questions et fiche : rien ne montre qu\'elles ont été faites par le modèle « Plans et organisation ».');
  assert.match(un.missing[0].how, /^questions et fiche : la fiche publiée ne porte pas la ligne de preuve\./);
  assert.match(un.missing[0].how, /upstream\.mjs 42/);
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('old'))]), { lines: ['**Questions et fiche** : publiées avant la mise en place de cette preuve (non mesuré)'], missing: [] });
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('unread', []))]), { lines: ['**Questions et fiche** : non mesuré (la demande n\'a pas pu être relue)'], missing: [] });
  assert.deepEqual(upstreamCheck([runOf(runE('build'), up('none', []))]), { lines: [], missing: [] });
  assert.deepEqual(upstreamCheck([runOf(runE('foundation'), up('proved', undefined, 'brief'))]).lines, ['**Questions et fiche projet** : faites par Fable (rôle « Plans et organisation »)']);
  assert.equal(upstreamCheck([runOf(runE('foundation'))]).missing[0].alert, 'Questions et fiche projet : la preuve n\'a pas été relevée.');
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
