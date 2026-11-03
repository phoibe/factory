import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, isApproval, afterChecks } from '../scripts/lib/decide.mjs';
import { L } from '../scripts/lib/labels.mjs';

const config = { maxParallel: 2, stages: { grilling: true, acceptance: true, screenshots: true }, review: { maxLoops: 3 } };
const ctx = { inFlight: 0, lockFresh: false };
const ev = (o) => ({ kind: 'issue', event: 'issue_comment', action: 'created', number: 1, labels: [], text: '', fromOwner: true, fromAgent: false, ...o });

test('isApproval accepts short approvals', () => {
  for (const t of ['go', 'Go !', 'ok', 'OK.', 'oui', "Oui c'est bon", '👍', '✅', 'validé', 'on y va', 'LGTM', 'ça me va',
    'Parfait, merci !', "Oui c’est bon pour moi", 'ok 👍', 'vas-y', "d'accord"]) {
    assert.equal(isApproval(t), true, t);
  }
});

test('isApproval rejects conditional or long answers', () => {
  for (const t of ['ok mais change la couleur', 'oui sauf le bouton', 'ok ?', 'non', '', 'go pour la partie 1 par contre la 2 non',
    'ok, le bouton en rouge', 'go, et ajoute un export', 'top, change juste le titre', 'merci',
    'le bouton est trop gros, ok ?', 'ok je pense que ce serait mieux avec un autre titre en haut de page']) {
    assert.equal(isApproval(t), false, t);
  }
});

test('a new feature issue from the owner starts grilling', () => {
  const a = decide(ev({ event: 'issues', action: 'opened', labels: [L.feature] }), config, ctx);
  assert.deepEqual([a.type, a.stage, a.add], ['fire', 'grilling', [L.grilling]]);
});

test('a new feature goes straight to spec when grilling is off', () => {
  const a = decide(ev({ event: 'issues', action: 'opened', labels: [L.feature] }), { ...config, stages: { ...config.stages, grilling: false } }, ctx);
  assert.deepEqual([a.type, a.stage], ['fire', 'spec']);
});

test('labelling an existing issue as feature starts it', () => {
  const a = decide(ev({ event: 'issues', action: 'labeled', addedLabel: L.feature, labels: [L.feature] }), config, ctx);
  assert.equal(a.stage, 'grilling');
});

test('an issue already in a state is not restarted by labels', () => {
  assert.equal(decide(ev({ event: 'issues', action: 'labeled', addedLabel: L.feature, labels: [L.feature, L.building] }), config, ctx).type, 'ignore');
});

test('a new bug starts bugfix, or queues when the factory is full', () => {
  const opened = ev({ event: 'issues', action: 'opened', labels: [L.bug] });
  assert.deepEqual([decide(opened, config, ctx).stage, decide(opened, config, ctx).add], ['bugfix', [L.building]]);
  assert.equal(decide(opened, config, { ...ctx, inFlight: 2 }).type, 'queue');
});

test('issues opened by strangers are ignored', () => {
  assert.equal(decide(ev({ event: 'issues', action: 'opened', labels: [L.feature], fromOwner: false }), config, ctx).type, 'ignore');
});

test('grilling answers fire another grilling run', () => {
  assert.equal(decide(ev({ labels: [L.feature, L.grilling], text: '1 oui 2 non' }), config, ctx).stage, 'grilling');
});

test('spec approval starts the build or queues', () => {
  const e = ev({ labels: [L.feature, L.specReview], text: 'go' });
  const a = decide(e, config, ctx);
  assert.deepEqual([a.type, a.stage, a.add, a.remove], ['fire', 'build', [L.building], [L.specReview]]);
  const q = decide(e, config, { ...ctx, inFlight: 2 });
  assert.deepEqual([q.type, q.remove], ['queue', [L.specReview]]);
});

test('spec remarks fire a spec revision', () => {
  assert.equal(decide(ev({ labels: [L.feature, L.specReview], text: 'ajoute un mode sombre' }), config, ctx).stage, 'spec');
});

test('answer on a blocked issue resumes', () => {
  assert.equal(decide(ev({ labels: [L.feature, L.building, L.blocked], text: 'voici la clé' }), config, ctx).stage, 'resume');
});

test('comments by the agent, strangers, or during a live run are ignored', () => {
  const base = { labels: [L.feature, L.grilling], text: 'x' };
  assert.equal(decide(ev({ ...base, fromAgent: true }), config, ctx).type, 'ignore');
  assert.equal(decide(ev({ ...base, fromOwner: false }), config, ctx).type, 'ignore');
  const d = decide(ev(base), config, { ...ctx, lockFresh: true });
  assert.deepEqual([d.type, d.add], ['defer', [L.pending]]);
});

test('issues the agent files do not start on their own, a comment from the owner starts them', () => {
  assert.equal(decide(ev({ event: 'issues', action: 'opened', labels: [L.feature], fromAgent: true }), config, ctx).type, 'ignore');
  assert.equal(decide(ev({ labels: [L.feature], text: 'vas-y' }), config, ctx).stage, 'grilling');
});

test('a second start event on an issue already locked is ignored', () => {
  assert.equal(decide(ev({ event: 'issues', action: 'labeled', addedLabel: L.feature, labels: [L.feature, L.running] }), config, ctx).type, 'ignore');
});

test('removing the running label replays a deferred message', () => {
  const e = ev({ event: 'issues', action: 'unlabeled', removedLabel: L.running, labels: [L.grilling, L.pending] });
  assert.equal(decide(e, config, ctx).type, 'replay');
  assert.equal(decide({ ...e, labels: [L.grilling] }, config, ctx).type, 'ignore');
});

test('a dispatch with a payload starts the Actions agent', () => {
  assert.equal(decide({ kind: 'dispatch', payload: '{}' }, config, ctx).type, 'agent');
});

test('a push during acceptance sends the PR back to checks', () => {
  const a = decide(pr({ event: 'pull_request', action: 'synchronize', labels: [L.acceptance] }), config, ctx);
  assert.deepEqual([a.type, a.add, a.remove], ['checks', [L.checks], [L.acceptance]]);
});

test('comments on issues outside the factory are ignored', () => {
  assert.equal(decide(ev({ labels: ['question'], text: 'go' }), config, ctx).type, 'ignore');
});

test('queued issue comments are ignored', () => {
  assert.equal(decide(ev({ labels: [L.feature, L.queued], text: 'go' }), config, ctx).type, 'ignore');
});

const pr = (o) => ev({ kind: 'pr', number: 7, ...o });

test('visual approval moves the PR to checks', () => {
  const a = decide(pr({ labels: [L.visualReview], text: 'ok' }), config, ctx);
  assert.deepEqual([a.type, a.add, a.remove], ['checks', [L.checks], [L.visualReview]]);
});

test('visual remarks fire a visual fix', () => {
  assert.equal(decide(pr({ labels: [L.visualReview], text: 'le titre est trop petit' }), config, ctx).stage, 'visual-fix');
});

test('acceptance approval merges and advances the queue', () => {
  const a = decide(pr({ labels: [L.acceptance], text: "c'est bon" }), config, ctx);
  assert.deepEqual([a.type, a.dequeue], ['merge', true]);
});

test('acceptance remarks fire an acceptance fix', () => {
  assert.equal(decide(pr({ labels: [L.acceptance], text: 'le bouton ne marche pas' }), config, ctx).stage, 'acceptance-fix');
});

test('a review submission counts like a comment', () => {
  assert.equal(decide(pr({ event: 'pull_request_review', action: 'submitted', labels: [L.acceptance], text: 'go' }), config, ctx).type, 'merge');
});

test('comments during checks are ignored', () => {
  assert.equal(decide(pr({ labels: [L.checks], text: 'alors ?' }), config, ctx).type, 'ignore');
});

test('a push or label on a PR in checks runs the checks', () => {
  assert.equal(decide(pr({ event: 'pull_request', action: 'synchronize', labels: [L.checks] }), config, ctx).type, 'checks');
  assert.equal(decide(pr({ event: 'pull_request', action: 'labeled', addedLabel: L.checks, labels: [L.checks] }), config, ctx).type, 'checks');
  assert.equal(decide(pr({ event: 'pull_request', action: 'opened', labels: [L.checks] }), config, ctx).type, 'checks');
  assert.equal(decide(pr({ event: 'pull_request', action: 'synchronize', labels: [L.visualReview] }), config, ctx).type, 'ignore');
});

test('pull_request events are trusted whoever the sender (the agent pushes as the owner)', () => {
  assert.equal(decide(pr({ event: 'pull_request', action: 'synchronize', labels: [L.checks], fromOwner: false }), config, ctx).type, 'ignore');
});

test('closing a PR or an issue advances the queue', () => {
  assert.equal(decide(pr({ event: 'pull_request', action: 'closed', labels: [] }), config, ctx).type, 'dequeue');
  assert.equal(decide(ev({ event: 'issues', action: 'closed', labels: [L.feature] }), config, ctx).type, 'dequeue');
});

test('afterChecks routes green and red results', () => {
  const base = { acceptanceOn: true, isBug: false, failures: 0, maxLoops: 3 };
  assert.equal(afterChecks({ ...base, result: 'success' }), 'acceptance');
  assert.equal(afterChecks({ ...base, result: 'success', isBug: true }), 'merge');
  assert.equal(afterChecks({ ...base, result: 'success', acceptanceOn: false }), 'merge');
  assert.equal(afterChecks({ ...base, result: 'failure', failures: 2 }), 'fix');
  assert.equal(afterChecks({ ...base, result: 'failure', failures: 3 }), 'blocked');
});
