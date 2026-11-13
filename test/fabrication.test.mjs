import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJournal, summarize, routeLine, uiChanged, FABRICATION_MARKER } from '../scripts/lib/fabrication.mjs';

const j = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const stages = { plan: true, tdd: true, review: true, designPass: true };

test('a clean build run has no alert and proves TDD', () => {
  const runs = parseJournal([j(
    { t: '2026-11-03T10:00', kind: 'run', stage: 'build' },
    { t: '2026-11-03T10:01', kind: 'skill', name: 'superpowers:writing-plans' },
    { t: '2026-11-03T10:02', kind: 'skill', name: 'superpowers:test-driven-development' },
    { t: '2026-11-03T10:03', kind: 'test', cmd: 'npm test', ok: false },
    { t: '2026-11-03T10:04', kind: 'test', cmd: 'npm test', ok: true },
    { t: '2026-11-03T10:05', kind: 'skill', name: 'superpowers:requesting-code-review' },
  )]);
  const { body, alerts } = summarize(runs, { stages, ui: false });
  assert.deepEqual(alerts, []);
  assert.ok(body.startsWith(FABRICATION_MARKER));
  assert.match(body, /Preuve TDD\*\* : oui/);
  assert.match(body, /`superpowers:test-driven-development`/);
});

test('missing skills, missing TDD proof and missing design pass raise alerts', () => {
  const runs = parseJournal([j(
    { t: '1', kind: 'run', stage: 'build' },
    { t: '2', kind: 'skill', name: 'test-driven-development' },
    { t: '3', kind: 'test', cmd: 'npm test', ok: true },
  )]);
  const { alerts } = summarize(runs, { stages, ui: true });
  assert.equal(alerts.length, 4); // plan, TDD proof, review, design
  assert.ok(alerts.some((a) => a.includes('pas de preuve TDD')));
  assert.ok(alerts.some((a) => a.includes('`impeccable`')));
});

test('disabled stages are not expected', () => {
  const runs = parseJournal([j({ t: '1', kind: 'run', stage: 'build' })]);
  assert.deepEqual(summarize(runs, { stages: { plan: false, tdd: false, review: false, designPass: false } }).alerts, []);
});

test('no journal at all is a discreet note, not an alert (no red card)', () => {
  const { alerts, body } = summarize([], { stages });
  assert.equal(alerts.length, 0);
  assert.match(body, /Pas de journal de construction/);
});

test('uiChanged ignores tests', () => {
  assert.equal(uiChanged(['src/app/page.tsx']), true);
  assert.equal(uiChanged(['src/app/page.test.tsx', 'src/lib/streak.ts']), false);
});

test('a general review must show the design pass and the code review, whatever the toggles', async () => {
  const { expectations } = await import('../scripts/lib/fabrication.mjs');
  assert.deepEqual(expectations('audit', { designPass: false, review: false }, false).map((e) => e.skill), ['impeccable', 'requesting-code-review']);
});

test('a cache-busting ?v=N bump is not a visual change (no design pass expected)', () => {
  const bump = { filename: 'panel/index.html', patch: '@@ -1 +1 @@\n-  <script type="module" src="app.mjs?v=16"></script>\n+  <script type="module" src="app.mjs?v=17"></script>' };
  assert.equal(uiChanged([bump, { filename: 'panel/app.mjs', patch: '+x' }]), false);
  assert.equal(uiChanged([{ filename: 'panel/index.html', patch: '-<p>a</p>\n+<p>b</p>' }]), true);
  assert.equal(uiChanged(['panel/index.html']), true);
});

test('a small change (3 source files or fewer) needs no written plan; a bigger one does', async () => {
  const { expectations, smallChange } = await import('../scripts/lib/fabrication.mjs');
  assert.equal(smallChange(['src/a.js', 'src/b.js', 'test/a.test.js', 'docs/plans/x.md', '.factory/journal/s.jsonl', 'package-lock.json']), true);
  assert.equal(smallChange(['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js']), false);
  const skills = (small) => expectations('build', {}, false, { small }).map((e) => e.skill);
  assert.ok(!skills(true).includes('writing-plans'));
  assert.ok(skills(false).includes('writing-plans'));
  assert.ok(skills(true).includes('test-driven-development'));
});

// Issue #381: the PR shows the route the request followed, from the journal (not declared by the agent).
const buildRun = (...skills) => parseJournal([j(
  { t: '2026-11-13T10:00', kind: 'run', stage: 'build' },
  ...skills.map((name, i) => ({ t: `2026-11-13T10:0${i + 1}`, kind: 'skill', name })),
)]);

test('a build with a plan is a medium route even when it touched few files', () => {
  const runs = buildRun('superpowers:writing-plans', 'test-driven-development');
  assert.equal(routeLine(runs, { small: true }), "**Parcours** : demande moyenne, plan exécuté d'une traite avec une seule relecture finale");
});

test('a big build without a plan claims no plan', () => {
  assert.equal(routeLine(buildRun('test-driven-development'), { small: false }), "**Parcours** : sans plan écrit, construite d'une traite avec une seule relecture finale");
});

test('a small build shows the light route', () => {
  const runs = buildRun('test-driven-development');
  assert.equal(routeLine(runs, { small: true }), "**Parcours** : petite demande, sans plan, construite d'une traite avec une seule relecture finale");
  assert.match(summarize(runs, { stages, small: true }).body, /\*\*Parcours\*\* : petite demande/);
});

test('a medium build shows its plan executed in one go', () => {
  const runs = buildRun('writing-plans', 'executing-plans');
  assert.equal(routeLine(runs, { small: false }), "**Parcours** : demande moyenne, plan exécuté d'une traite avec une seule relecture finale");
});

test('a large build shows its plan executed task by task', () => {
  const runs = buildRun('writing-plans', 'superpowers:subagent-driven-development');
  assert.equal(routeLine(runs, { small: false }), '**Parcours** : grande demande, plan exécuté tâche par tâche, chaque tâche relue');
});

test('a PR without a build run has no route line', () => {
  const runs = parseJournal([j({ t: '2026-11-13T10:00', kind: 'run', stage: 'fix-checks' })]);
  assert.equal(routeLine(runs, { small: true }), null);
  assert.doesNotMatch(summarize(runs, { stages, small: true }).body, /Parcours/);
});
