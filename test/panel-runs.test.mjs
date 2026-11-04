import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parisMidnight, runsToday, runsText } from '../panel/runs.mjs';

const ev = (at, n = 1, name = 'factory:running', event = 'labeled') => ({ event, label: { name }, created_at: at, issue: { number: n } });
const now = Date.parse('2026-11-04T18:00:00Z'); // 19 h à Paris

test('parisMidnight is the start of the day in Paris', () => {
  assert.equal(new Date(parisMidnight(now)).toISOString(), '2026-11-03T23:00:00.000Z');
  assert.equal(new Date(parisMidnight(Date.parse('2026-07-01T12:00:00Z'))).toISOString(), '2026-06-30T22:00:00.000Z');
});

test('runsToday counts the agent starts of the day, one per start even when it locks an issue and its PR', () => {
  const events = [
    ev('2026-11-04T17:00:00Z', 5), ev('2026-11-04T17:00:01Z', 9), // one start on an issue and its PR
    ev('2026-11-04T16:00:00Z', 5),
    ev('2026-11-04T16:00:00Z', 5, 'factory:checks'), // another label
    ev('2026-11-04T15:00:00Z', 5, 'factory:running', 'unlabeled'),
    ev('2026-11-03T22:30:00Z', 5), // yesterday in Paris
  ];
  assert.equal(runsToday(events, now), 2);
});

test('runsText says it plainly', () => {
  assert.equal(runsText(0), "Aucun agent lancé aujourd'hui");
  assert.equal(runsText(1), "1 agent lancé aujourd'hui");
  assert.equal(runsText(12), "12 agents lancés aujourd'hui");
});
