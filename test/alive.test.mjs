// yolivesound #115: a long routine build that still works must not be taken for dead and doubled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aliveAt, markAlive, runOf, beatDue, heartbeat, beat, SESSION_MARKER, BEAT_MINUTES } from '../agent/scripts/alive.mjs';
import { SESSION_MARKER as RELAY_MARKER } from '../scripts/lib/labels.mjs';

const MIN = 60_000;

test('the agent finds the same « Dernier lancement » comment as the relay', () => {
  assert.equal(SESSION_MARKER, RELAY_MARKER);
});

test('a sign of life is written once and replaced in place', () => {
  const first = markAlive('note', '2026-11-16T18:00:00.000Z');
  assert.equal(aliveAt(first), Date.parse('2026-11-16T18:00:00.000Z'));
  const second = markAlive(first, '2026-11-16T18:10:00.000Z');
  assert.equal(aliveAt(second), Date.parse('2026-11-16T18:10:00.000Z'));
  assert.equal(second.match(/factory-alive/g).length, 1);
  assert.ok(second.startsWith('note'));
  assert.equal(aliveAt('no note'), null);
  assert.equal(aliveAt('<!-- factory-alive garbage -->'), null);
});

test('the run comes from the journal', () => {
  const j = '{"kind":"skill","name":"x"}\n{"t":"t","kind":"run","stage":"build","issue":115,"pr":null,"repo":"phoibe/app"}\n';
  assert.deepEqual(runOf(j), { repo: 'phoibe/app', issue: 115, pr: null });
  assert.equal(runOf('{"kind":"run","stage":"build","issue":3}'), null, 'no repo: nothing to write to');
  assert.equal(runOf(''), null);
});

test('a beat is due every ten minutes', () => {
  assert.ok(beatDue(null, 0));
  assert.ok(!beatDue(0, (BEAT_MINUTES - 1) * MIN));
  assert.ok(beatDue(0, BEAT_MINUTES * MIN));
});

test('the hook beats at most every ten minutes, and only for a factory run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'alive-'));
  const journalFile = join(dir, 'j.jsonl');
  const session = `test-${process.pid}-${Date.now()}`;
  const launched = [];
  const launch = (run, iso) => launched.push([run, iso]);
  assert.equal(heartbeat({ session, journalFile, now: 0, launch }), false, 'no journal: no run');
  writeFileSync(journalFile, '{"kind":"run","stage":"build","issue":7,"pr":null,"repo":"phoibe/app"}\n');
  const t0 = Date.parse('2026-11-16T18:00:00Z');
  assert.equal(heartbeat({ session, journalFile, now: t0, launch }), true);
  assert.equal(heartbeat({ session, journalFile, now: t0 + 5 * MIN, launch }), false);
  assert.equal(heartbeat({ session, journalFile, now: t0 + 10 * MIN, launch }), true);
  assert.deepEqual(launched.map(([r, iso]) => [r.issue, iso]), [[7, '2026-11-16T18:00:00.000Z'], [7, '2026-11-16T18:10:00.000Z']]);
});

test('the beat edits the « Dernier lancement » comment of the issue and of the PR, and survives a GitHub failure', () => {
  const calls = [];
  const comments = { 7: [{ id: 1, body: 'hello' }, { id: 2, body: `${SESSION_MARKER}\nDernier lancement` }], 9: [] };
  const gh = (args) => {
    calls.push(args);
    if (args[1].includes('/issues/9/')) throw new Error('boom');
    const m = /issues\/(\d+)\/comments\?/.exec(args[1]);
    return m ? JSON.stringify(comments[m[1]]) : '{}';
  };
  beat({ repo: 'phoibe/app', issue: 7, pr: 9, iso: '2026-11-16T18:00:00.000Z' }, gh);
  const patch = calls.find((a) => a.includes('PATCH'));
  assert.deepEqual(patch.slice(0, 4), ['api', '-X', 'PATCH', 'repos/phoibe/app/issues/comments/2']);
  assert.equal(aliveAt(patch[5]), Date.parse('2026-11-16T18:00:00.000Z'));
  assert.ok(patch[5].includes('Dernier lancement'));
  assert.equal(calls.filter((a) => a.includes('PATCH')).length, 1);
});
