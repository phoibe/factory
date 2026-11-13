import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRelaunch, writeRelaunch, relaunchLine } from '../panel/relaunch.mjs';
import { relaunchStep, isTransientStatus, RELAUNCH_TOLD } from '../scripts/lib/relaunch.mjs';

const MIN = 60_000;

test('the relaunch marker survives a launch whose follow-up holds an HTML comment', () => {
  const state = { stage: 'build', since: 1, then: { comments: [{ n: 3, body: '<!-- factory-agent -->\nJe reprends --> ok' }] } };
  const body = writeRelaunch('Ma demande', state);
  assert.ok(body.startsWith('Ma demande'));
  assert.equal((body.match(/-->/g) || []).length, 1, 'only the marker closes a hidden comment');
  assert.deepEqual(readRelaunch(body), state);
  assert.equal(writeRelaunch(body, null), 'Ma demande');
  assert.equal(readRelaunch('rien'), null);
  assert.equal(readRelaunch(null), null);
});

test('the card line names the time of the next relaunch', () => {
  const next = Date.UTC(2026, 10, 13, 15, 12);
  assert.equal(relaunchLine({ next }, 'Europe/Paris', next - 60_000), 'Relance prévue à 16:12');
  assert.equal(relaunchLine({ next }, 'Europe/Paris', next + 1), 'Relance imminente', 'a time already past is not shown');
  assert.equal(relaunchLine({}), null);
  assert.equal(relaunchLine(null), null);
});

test('retries after 2 min, then 10 min, then every 30 min; told once at the third failure', () => {
  const launch = { stage: 'build' };
  let now = 0;
  const s1 = relaunchStep(null, { launch, now });
  assert.deepEqual([s1.action, s1.state.next, s1.tell, s1.firstInMs], ['wait', 2 * MIN, false, 2 * MIN]);
  now = 2 * MIN;
  const s2 = relaunchStep(s1.state, { launch, now });
  assert.deepEqual([s2.state.next - now, s2.tell, s2.firstInMs], [10 * MIN, false, null]);
  now = 12 * MIN;
  const s3 = relaunchStep(s2.state, { launch, now });
  assert.deepEqual([s3.state.next - now, s3.tell], [30 * MIN, true]);
  now = 42 * MIN;
  const s4 = relaunchStep(s3.state, { launch, now });
  assert.deepEqual([s4.state.next - now, s4.tell], [30 * MIN, false]);
  assert.equal(s4.state.since, 0);
  assert.match(RELAUNCH_TOLD, /je réessaie tout seul, rien à faire de votre côté/);
});

test('three hours after the first failure, the card is blocked', () => {
  const s = relaunchStep({ since: 0, failures: 7, next: 1 }, { launch: { stage: 'build' }, now: 3 * 60 * MIN });
  assert.equal(s.action, 'block');
});

test('a new launch on a waiting card keeps its schedule but replaces what to start', () => {
  const s = relaunchStep({ stage: 'build', since: 0, failures: 3, told: true }, { launch: { stage: 'fix-checks', pr: 9 }, now: 50 * MIN });
  assert.deepEqual([s.state.stage, s.state.pr, s.state.since, s.state.told, s.tell], ['fix-checks', 9, 0, true, false]);
});

test('passing answers of the routine are told apart from configuration errors', () => {
  for (const s of [408, 425, 429, 500, 502, 503, 529]) assert.equal(isTransientStatus(s), true, String(s));
  for (const s of [400, 401, 403, 404, 422]) assert.equal(isTransientStatus(s), false, String(s));
});
