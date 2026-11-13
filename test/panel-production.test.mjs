import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLiveEnv, deploymentState, gapItems, gapView } from '../panel/production.mjs';

const dep = (id, sha, environment = 'Production') => ({ id, sha, environment });
const st = (...states) => states.map((state) => ({ state }));
const pr = (number, sha, mergedAt, extra = {}) => ({ number, title: `PR ${number}`, merge_commit_sha: sha, merged_at: mergedAt, head: { ref: `claude/issue-${number}-x` }, body: `Closes #${number - 100}`, ...extra });

test('live environments are the production ones and GitHub Pages, never a preview', () => {
  assert.equal(isLiveEnv('Production'), true);
  assert.equal(isLiveEnv('Production – app-skyk'), true);
  assert.equal(isLiveEnv('github-pages'), true);
  assert.equal(isLiveEnv('Preview'), false);
});

test('the live commit is the newest deployment that succeeded; a newer one still running is « pending »', () => {
  const s = deploymentState([dep(1, 'a'), dep(3, 'c'), dep(2, 'b')], { 1: st('success'), 2: st('inactive', 'success'), 3: st('in_progress') });
  assert.deepEqual(s, { liveSha: 'b', latest: 'pending' });
});

test('a newest deployment that failed leaves the older version live', () => {
  assert.deepEqual(deploymentState([dep(1, 'a'), dep(2, 'b')], { 1: st('success'), 2: st('failure', 'in_progress') }), { liveSha: 'a', latest: 'failure' });
});

test('preview deployments are ignored', () => {
  assert.deepEqual(deploymentState([dep(1, 'a'), dep(2, 'b', 'Preview')], { 1: st('success'), 2: st('in_progress') }), { liveSha: 'a', latest: 'success' });
});

test('the gap lists merged PRs not live yet, oldest first, and ignores commits pushed without PR', () => {
  const pulls = [pr(112, 's2', '2026-11-08T11:00:00Z'), pr(111, 's1', '2026-11-08T10:00:00Z'), pr(110, 's0', '2026-11-07T10:00:00Z'), { number: 9, merged_at: null, merge_commit_sha: 'x' }];
  const items = gapItems(pulls, new Set(['s1', 's2', 'chore']));
  assert.deepEqual(items.map((i) => [i.number, i.issue, i.title, i.mergedAt]), [[111, 11, 'PR 111', '2026-11-08T10:00:00Z'], [112, 12, 'PR 112', '2026-11-08T11:00:00Z']]);
});

test('a PR undone by a live revert comes back in the gap until its redo is merged', () => {
  const revert = pr(120, 'r', '2026-11-09T10:00:00Z', { head: { ref: 'claude/revert-pr-111' }, body: '<!-- factory-revert -->\n<!-- factory-revert-redo #30 -->' });
  const pulls = [revert, pr(111, 's1', '2026-11-08T10:00:00Z')];
  assert.deepEqual(gapItems(pulls, new Set()).map((i) => i.number), [111]);
  const redo = pr(130, 'z', '2026-11-10T10:00:00Z', { body: 'Closes #30' });
  assert.deepEqual(gapItems([redo, ...pulls], new Set(['z'])).map((i) => i.number), [130]);
});

const base = { mode: 'auto', hasSite: true, deployments: [dep(1, 'a')], statusesById: { 1: st('success') }, aheadShas: new Set(), pulls: [] };

test('« En ligne : à jour » when nothing validated is missing from the live site', () => {
  const v = gapView(base);
  assert.equal(v.kind, 'ok');
  assert.equal(v.text, 'En ligne : à jour');
});

test('« N modifications d\'écart », singular for one', () => {
  const pulls = [pr(111, 's1', '2026-11-08T10:00:00Z'), pr(112, 's2', '2026-11-08T11:00:00Z')];
  assert.equal(gapView({ ...base, pulls, aheadShas: new Set(['s1', 's2']) }).text, 'En ligne : 2 modifications d\'écart');
  assert.equal(gapView({ ...base, pulls, aheadShas: new Set(['s1']) }).text, 'En ligne : 1 modification d\'écart');
});

test('« publication en cours… » while the host publishes', () => {
  const v = gapView({ ...base, deployments: [dep(1, 'a'), dep(2, 'b')], statusesById: { 1: st('success'), 2: st('queued') } });
  assert.equal(v.kind, 'deploying');
  assert.equal(v.text, 'En ligne : publication en cours…');
});

test('a failed publication shows the gap with its warning', () => {
  const v = gapView({ ...base, deployments: [dep(1, 'a'), dep(2, 'b')], statusesById: { 1: st('success'), 2: st('error') }, pulls: [pr(111, 's1', '2026-11-08T10:00:00Z')], aheadShas: new Set(['s1']) });
  assert.equal(v.kind, 'failed');
  assert.equal(v.text, 'En ligne : 1 modification d\'écart · la dernière publication a échoué');
});

test('a failed publication with nothing missing is still « à jour »', () => {
  assert.equal(gapView({ ...base, deployments: [dep(1, 'a'), dep(2, 'b')], statusesById: { 1: st('success'), 2: st('failure') } }).kind, 'ok');
});

test('external production: « version inconnue » with a reason', () => {
  const v = gapView({ ...base, mode: 'external' });
  assert.equal(v.kind, 'unknown');
  assert.equal(v.text, 'En ligne : version inconnue');
  assert.match(v.why, /hors de la factory/);
});

test('a site whose host tells GitHub nothing: « version inconnue »; a « site answers » never counts', () => {
  const v = gapView({ ...base, deployments: [], statusesById: {} });
  assert.equal(v.kind, 'unknown');
  assert.match(v.why, /ne prévient pas/);
});

test('a project without site nor live deployment shows nothing', () => {
  assert.equal(gapView({ ...base, hasSite: false, deployments: [dep(1, 'a', 'Preview')] }).kind, 'none');
});

test('GitHub not answering gives « version inconnue », never a stale « à jour »', () => {
  const v = gapView({ ...base, error: true });
  assert.equal(v.kind, 'unknown');
  assert.match(v.why, /GitHub/);
});
