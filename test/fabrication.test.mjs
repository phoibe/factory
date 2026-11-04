import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJournal, summarize, uiChanged, FABRICATION_MARKER } from '../scripts/lib/fabrication.mjs';

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

test('no journal at all is an alert', () => {
  assert.equal(summarize([], { stages }).alerts.length, 1);
});

test('uiChanged ignores tests', () => {
  assert.equal(uiChanged(['src/app/page.tsx']), true);
  assert.equal(uiChanged(['src/app/page.test.tsx', 'src/lib/streak.ts']), false);
});

test('a general review must show the design pass and the code review, whatever the toggles', async () => {
  const { expectations } = await import('../scripts/lib/fabrication.mjs');
  assert.deepEqual(expectations('audit', { designPass: false, review: false }, false).map((e) => e.skill), ['impeccable', 'requesting-code-review']);
});
