// Issue #628: the « Consommation » page sums the runs' token use per task type, model, effort and kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TASK_TYPES, EFFORT_NAMES, aggregate, costBetween, engineLabel, fmtDollars, fmtTokens, fmtShare, fmtAverage } from '../panel/consumption.mjs';
import { MODEL_ROLES } from '../scripts/lib/models.mjs';

// Fake prices: 1 $ per million tokens of any kind; Fable 10 $; claude-opus-5-6 has no price.
const cost = (t, model) => {
  if (model === 'claude-opus-5-6') return null;
  const n = t.input + t.cw5 + t.cw1 + t.cacheRead + t.output;
  return (model.startsWith('claude-fable-') ? 10 : 1) * n / 1e6;
};
const all = { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z'), size: 'all', cost };
const task = (type, model, effort = 'high', kind = 'other') => ({ type, kind, model, effort });
// One use line with all its tokens as output.
const use = (hour, i, model, output) => [hour, i, model, 0, 0, 0, 0, output];

test('every kind id recorded by the runs has a French name, and the types keep the order of the settings', () => {
  const ids = {
    plan: ['questions', 'plan', 'bug', 'framing', 'other'],
    code: ['build', 'task-review', 'design-critique', 'review-fix', 'owner-fix', 'checks-fix', 'other'],
    review: ['final-review', 'review-round', 'scope-check', 'security', 'audit', 'other'],
    audit: ['parts', 'history', 'other'],
    simple: ['research', 'screenshots', 'other'],
    pilot: ['questions', 'build', 'fixes', 'audit', 'other'],
  };
  assert.deepEqual(TASK_TYPES.map((t) => t.id), ['plan', 'code', 'review', 'audit', 'simple', 'pilot']);
  for (const role of MODEL_ROLES) assert.equal(TASK_TYPES.find((t) => t.id === role.id).name, role.name);
  assert.equal(TASK_TYPES.at(-1).name, 'Agent qui pilote');
  for (const [type, kinds] of Object.entries(ids)) {
    const t = TASK_TYPES.find((x) => x.id === type);
    for (const k of kinds) assert.ok(t.kinds.find((x) => x.id === k)?.name, `${type}/${k}`);
  }
  assert.deepEqual(TASK_TYPES[1].kinds.map((k) => k.name), ['construction', 'relectures de tâche', 'critique du design',
    'corrections après relecture', 'corrections après vos retours (captures, recette)', 'corrections après les contrôles automatiques', 'autres']);
  assert.deepEqual(TASK_TYPES[5].kinds.map((k) => k.name), ['questions et fiche', 'construction', 'corrections', 'review générale et amélioration UI', 'autres']);
  assert.deepEqual(EFFORT_NAMES, { low: 'faible', medium: 'moyen', high: 'élevé' });
});

test('rows follow the order of the task types', () => {
  const runs = [{ at: '2026-11-10T12:00:00Z', size: 'small',
    tasks: [task('pilot', 'claude-opus-5-5', 'medium', 'build'), task('review', 'claude-fable-5-2'), task('code', 'claude-opus-5-5', 'medium', 'build'), task('plan', 'claude-fable-5-2', 'high', 'plan')],
    use: [use('2026-11-10T10', 0, 'claude-opus-5-5', 1e6), use('2026-11-10T10', 1, 'claude-fable-5-2', 1e6),
      use('2026-11-10T10', 2, 'claude-opus-5-5', 1e6), use('2026-11-10T10', 3, 'claude-fable-5-2', 1e6)] }];
  const { rows } = aggregate(runs, all);
  assert.deepEqual(rows.map((r) => r.type), ['plan', 'code', 'review', 'pilot']);
});

test('Revue on Fable and on Opus give two rows, most expensive first, with their kinds', () => {
  const runs = [
    { at: '2026-11-10T12:00:00Z', size: 'small', tasks: [task('review', 'claude-fable-5-2', 'high', 'final-review'), task('review', 'claude-fable-5-2', 'high', 'review-round')],
      use: [use('2026-11-10T10', 0, 'claude-fable-5-2', 1e6), use('2026-11-10T10', 1, 'claude-fable-5-2', 2e6)] },
    { at: '2026-11-12T12:00:00Z', size: 'small', tasks: [task('review', 'claude-opus-5-5-20261101', 'high', 'final-review')],
      use: [use('2026-11-12T10', 0, 'claude-opus-5-5-20261101', 3e6)] },
  ];
  const { rows, total } = aggregate(runs, all);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.family, r.version, r.showVersion, r.effort, r.tasks, r.tokens, r.dollars]),
    [['Fable', '5.2', false, 'high', 2, 3e6, 30], ['Opus', '5.5', false, 'high', 1, 3e6, 3]]);
  assert.deepEqual(rows[0].kinds, [
    { kind: 'final-review', name: 'relecture finale', tasks: 1, tokens: 1e6, dollars: 10 },
    { kind: 'review-round', name: 'relectures 2 et 3', tasks: 1, tokens: 2e6, dollars: 20 },
  ]);
  assert.equal(rows[0].fableDollars, 30);
  assert.equal(rows[1].fableDollars, 0);
  assert.deepEqual(total, { tasks: 3, tokens: 6e6, dollars: 33, fableDollars: 30 });
  assert.equal(engineLabel(rows[0]), 'Fable · élevé');
});

test('two versions of one family show their version', () => {
  const runs = [{ at: '2026-11-10T12:00:00Z', size: null, tasks: [task('code', 'claude-opus-5-5'), task('code', 'claude-opus-5-6'), task('code', 'claude-sonnet-5-5', null)],
    use: [use('2026-11-10T10', 0, 'claude-opus-5-5', 1e6), use('2026-11-10T10', 1, 'claude-opus-5-6', 1e6), use('2026-11-10T10', 2, 'claude-sonnet-5-5', 1e6)] }];
  const { rows } = aggregate(runs, all);
  assert.deepEqual(rows.map((r) => [r.family, r.showVersion]), [['Opus', true], ['Sonnet', false], ['Opus', true]]);
  assert.equal(engineLabel(rows[0]), 'Opus 5.5 · élevé');
  assert.equal(engineLabel(rows[1]), 'Sonnet');
});

test('the size filter: « small » leaves out runs with no size, « all » keeps them', () => {
  const runs = [
    { at: '2026-11-10T12:00:00Z', size: 'small', tasks: [task('code', 'claude-opus-5-5')], use: [use('2026-11-10T10', 0, 'claude-opus-5-5', 1e6)] },
    { at: '2026-11-10T12:00:00Z', size: null, tasks: [task('code', 'claude-opus-5-5')], use: [use('2026-11-10T10', 0, 'claude-opus-5-5', 2e6)] },
    { at: '2026-11-10T12:00:00Z', size: 'large', tasks: [task('code', 'claude-opus-5-5')], use: [use('2026-11-10T10', 0, 'claude-opus-5-5', 4e6)] },
  ];
  assert.equal(aggregate(runs, { ...all, size: 'small' }).total.tokens, 1e6);
  assert.equal(aggregate(runs, { ...all, size: 'all' }).total.tokens, 7e6);
  assert.equal(aggregate(runs, { ...all, size: 'all' }).total.tasks, 3);
});

test('an hour bucket half inside the period counts half; a task with no tokens in the period does not count', () => {
  const runs = [{ at: '2026-11-10T12:00:00Z', size: null, tasks: [task('code', 'claude-opus-5-5'), task('plan', 'claude-opus-5-5')],
    use: [use('2026-11-10T10', 0, 'claude-opus-5-5', 1e6), use('2026-11-09T08', 1, 'claude-opus-5-5', 1e6)] }];
  const { rows, total } = aggregate(runs, { ...all, from: new Date('2026-11-10T10:30:00Z') });
  assert.deepEqual(rows.map((r) => [r.type, r.tasks, r.tokens, r.dollars]), [['code', 1, 5e5, 0.5]]);
  assert.equal(total.tasks, 1);
  assert.equal(costBetween(runs, new Date('2026-11-10T10:30:00Z'), new Date('2026-11-10T10:45:00Z'), { cost }), 0.25);
});

test('an unpriced model keeps its tokens and has no dollars; costBetween ignores it', () => {
  const runs = [{ at: '2026-11-10T12:00:00Z', size: null, tasks: [task('code', 'claude-opus-5-6'), task('review', 'claude-fable-5-2')],
    use: [use('2026-11-10T10', 0, 'claude-opus-5-6', 1e6), use('2026-11-10T10', 1, 'claude-fable-5-2', 1e6)] }];
  const { rows, total } = aggregate(runs, all);
  assert.deepEqual(rows.map((r) => [r.type, r.tokens, r.dollars]), [['code', 1e6, null], ['review', 1e6, 10]]);
  assert.equal(rows[0].kinds[0].dollars, null);
  assert.equal(total.dollars, null);
  assert.equal(total.fableDollars, 10);
  assert.equal(costBetween(runs, all.from, all.to, { cost }), 10);
});

test('fableDollars only counts claude-fable-* tokens, even inside a task of another model', () => {
  const runs = [{ at: '2026-11-10T12:00:00Z', size: null, tasks: [task('pilot', 'claude-opus-5-5', 'medium', 'build')],
    use: [use('2026-11-10T10', 0, 'claude-opus-5-5', 3e6), use('2026-11-10T10', 0, 'claude-fable-5-2', 1e5)] }];
  const { rows } = aggregate(runs, all);
  assert.equal(rows[0].dollars, 4);
  assert.equal(rows[0].fableDollars, 1);
  assert.equal(costBetween(runs, all.from, all.to, { cost, fableOnly: true }), 1);
  assert.equal(costBetween(runs, all.from, all.to, { cost }), 4);
});

test('no runs: no rows and a zero total', () => {
  assert.deepEqual(aggregate([], all), { rows: [], total: { tasks: 0, tokens: 0, dollars: 0, fableDollars: 0 } });
});

test('dollars: whole from 10, cents below unless they round to ,00, unknown price', () => {
  assert.equal(fmtDollars(58.4), '58 $');
  assert.equal(fmtDollars(1234.2), '1 234 $');
  assert.equal(fmtDollars(4.1), '4,10 $');
  assert.equal(fmtDollars(0.6), '0,60 $');
  assert.equal(fmtDollars(0.04), '0,04 $');
  assert.equal(fmtDollars(6), '6 $');
  assert.equal(fmtDollars(5.999), '6 $');
  assert.equal(fmtDollars(9.996), '10 $');
  assert.equal(fmtDollars(0), '0 $');
  assert.equal(fmtDollars(null), 'tarif inconnu');
});

test('tokens: millions above a million, all digits below', () => {
  assert.equal(fmtTokens(41.3e6), '41 M de tokens');
  assert.equal(fmtTokens(1.23e6), '1,2 M de tokens');
  assert.equal(fmtTokens(2e6), '2 M de tokens');
  assert.equal(fmtTokens(850000), '850 000 tokens');
  assert.equal(fmtTokens(1), '1 token');
});

test('shares: always « ≈ » except zero', () => {
  assert.equal(fmtShare(0), '0 %');
  assert.equal(fmtShare(0.04), '< 0,1 %');
  assert.equal(fmtShare(0.62), '≈ 0,6 %');
  assert.equal(fmtShare(1.6), '≈ 1,6 %');
  assert.equal(fmtShare(9), '≈ 9 %');
  assert.equal(fmtShare(12.6), '≈ 13 %');
});

test('average: too few measures under 5 tasks', () => {
  assert.equal(fmtAverage(10, 4), 'trop peu de mesures');
  assert.equal(fmtAverage(57.4, 14), '4,10 $');
  assert.equal(fmtAverage(null, 14), 'tarif inconnu');
});
