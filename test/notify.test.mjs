import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitingCards, alertText, sendAlert, notifiedComment } from '../scripts/lib/notify.mjs';
import { createRelay } from '../scripts/relay.mjs';
import { L } from '../scripts/lib/labels.mjs';

const card = (number, labels, extra = {}) => ({ number, title: `Carte ${number}`, html_url: `https://github.com/o/p/issues/${number}`, labels: labels.map((name) => ({ name })), ...extra });

test('only the four waiting-for-owner cases give a card', () => {
  const cards = [
    card(1, [L.specReview]), card(2, [L.visualReview], { pull_request: {} }), card(3, [L.acceptance], { pull_request: {} }), card(4, [L.blocked]),
    card(5, [L.building]), card(6, [L.checks], { pull_request: {} }), card(7, [L.grilling]),
  ];
  assert.deepEqual(waitingCards(cards).map((c) => [c.number, c.label]), [[1, L.specReview], [2, L.visualReview], [3, L.acceptance], [4, L.blocked]]);
});

test('a card an agent is working on, or a spec that starts by itself, does not wait for the owner', () => {
  assert.deepEqual(waitingCards([card(1, [L.blocked, L.running]), card(2, [L.specReview, L.autoGo])]), []);
});

test('the text says the project, what is expected, in French', () => {
  assert.match(alertText('mon-projet', L.specReview), /Spec à valider sur mon-projet/);
  assert.match(alertText('mon-projet', L.visualReview), /Captures à valider sur mon-projet/);
  assert.match(alertText('mon-projet', L.acceptance), /Recette prête sur mon-projet/);
  assert.match(alertText('mon-projet', L.blocked), /bloquée sur mon-projet/);
});

test('sendAlert posts JSON to ntfy with the link, and never throws', async () => {
  const sent = [];
  const ok = await sendAlert({ topic: 'secret-topic', message: 'Salut', click: 'https://x/1', fetchImpl: async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; } });
  assert.equal(ok, true);
  assert.equal(sent[0].url, 'https://ntfy.sh');
  assert.deepEqual([sent[0].body.topic, sent[0].body.message, sent[0].body.click], ['secret-topic', 'Salut', 'https://x/1']);
  assert.equal(await sendAlert({ topic: 'secret-topic', message: 'a', fetchImpl: async () => { throw new Error('down'); } }), false);
  assert.equal(await sendAlert({ topic: 'secret-topic', message: 'a', fetchImpl: async () => ({ ok: false, status: 500 }) }), false);
  assert.equal(await sendAlert({ topic: '', message: 'a', fetchImpl: async () => assert.fail('no topic, no call') }), false);
});

function setup({ items, events = {}, comments = {}, topic = 'secret-topic', fail = false }) {
  const calls = [];
  const posted = [];
  const gh = {
    listIssues: async ({ labels }) => items.filter((i) => i.labels.some((l) => l.name === labels)),
    listEvents: async (n) => events[n] || [],
    listComments: async (n) => comments[n] || [],
    comment: async (n, body) => { calls.push(['comment', n, body]); comments[n] = [...(comments[n] || []), { id: 99, body }]; return { id: 99, body }; },
    updateComment: async (id, body) => { calls.push(['update', id, body]); for (const l of Object.values(comments)) { const c = l.find((x) => x.id === id); if (c) c.body = body; } },
  };
  const fetchImpl = async (url, init) => { posted.push(JSON.parse(init.body)); if (fail) throw new Error('down'); return { ok: true }; };
  const relay = createRelay({ gh, repo: 'o/projet', config: { runner: 'claude-cloud', maxParallel: 2, stages: {}, review: { maxLoops: 3 } }, env: topic ? { NTFY_TOPIC: topic } : {}, fetchImpl, log: () => {} });
  return { relay, calls, posted, comments };
}

const labeledAt = (label, id = 7) => [{ id, event: 'labeled', label: { name: label }, created_at: '2026-01-01T00:00:00Z' }];

test('the tick alerts once per wait, with project, expectation and link', async () => {
  const s = setup({ items: [card(1, [L.specReview])], events: { 1: labeledAt(L.specReview) } });
  await s.relay.notifyWaiting();
  assert.equal(s.posted.length, 1);
  assert.match(s.posted[0].message, /Spec à valider sur projet/);
  assert.equal(s.posted[0].click, 'https://github.com/o/p/issues/1');
  await s.relay.notifyWaiting(); // no reminder
  assert.equal(s.posted.length, 1);
});

test('a new wait on the same card alerts again', async () => {
  const s = setup({ items: [card(1, [L.blocked])], events: { 1: labeledAt(L.blocked, 7) } });
  await s.relay.notifyWaiting();
  const events = { 1: labeledAt(L.blocked, 8) };
  const again = setup({ items: [card(1, [L.blocked])], events, comments: s.comments });
  await again.relay.notifyWaiting();
  assert.equal(again.posted.length, 1);
});

test('without NTFY_TOPIC nothing is sent and nothing is written', async () => {
  const s = setup({ items: [card(1, [L.specReview])], events: { 1: labeledAt(L.specReview) }, topic: '' });
  await s.relay.notifyWaiting();
  assert.deepEqual([s.posted.length, s.calls.length], [0, 0]);
});

test('a failed send does not break the relay and is retried at the next tick', async () => {
  const s = setup({ items: [card(1, [L.specReview])], events: { 1: labeledAt(L.specReview) }, fail: true });
  await s.relay.notifyWaiting();
  assert.equal(s.posted.length, 1);
  assert.doesNotMatch(s.comments[1].at(-1).body, /specReview|spec-review@/); // key taken back
  await s.relay.notifyWaiting();
  assert.equal(s.posted.length, 2); // retried
});

test('a failed marker write never repeats the alert endlessly: nothing is sent without the key saved', async () => {
  const s = setup({ items: [card(1, [L.specReview])], events: { 1: labeledAt(L.specReview) } });
  const gh = { listIssues: async () => [card(1, [L.specReview])], listEvents: async () => labeledAt(L.specReview), listComments: async () => [], comment: async () => { throw new Error('rate limit'); } };
  const sent = [];
  const relay = createRelay({ gh, repo: 'o/p', config: { runner: 'claude-cloud', maxParallel: 2, stages: {}, review: { maxLoops: 3 } }, env: { NTFY_TOPIC: 't' }, fetchImpl: async () => { sent.push(1); return { ok: true }; }, log: () => {} });
  await relay.notifyWaiting();
  assert.equal(sent.length, 0);
});

test('a tick runs the alerts', async () => {
  const s = setup({ items: [card(1, [L.acceptance], { pull_request: {} })], events: { 1: labeledAt(L.acceptance) } });
  await s.relay.notifyWaiting();
  assert.match(s.posted[0].message, /Recette prête/);
});

test('an alert already sent costs no read of the whole thread nor of the card\'s events (#211)', async () => {
  const label = L.specReview;
  const at = '2026-01-01T00:00:00Z';
  const marker = { id: 5, updated_at: '2026-01-01T00:01:00Z', body: notifiedComment([`${label}@7`]) };
  const old = { id: 1, updated_at: '2025-12-01T00:00:00Z', body: 'une vieille discussion' };
  const reads = [];
  const gh = {
    listIssues: async ({ labels }) => (labels === label ? [card(1, [label])] : []),
    listRepoEvents: async () => [{ id: 7, event: 'labeled', label: { name: label }, created_at: at, issue: { number: 1 } }],
    listCommentsSince: async (n, since) => [old, marker].filter((c) => c.updated_at >= since),
    listEvents: async () => { reads.push('events'); return []; },
    listComments: async () => { reads.push('comments'); return [old, marker]; },
    comment: async () => assert.fail('nothing to write'),
    updateComment: async () => assert.fail('nothing to write'),
  };
  const sent = [];
  const relay = createRelay({ gh, repo: 'o/p', config: { runner: 'claude-cloud', maxParallel: 2, stages: {}, review: { maxLoops: 3 } }, env: { NTFY_TOPIC: 't' }, fetchImpl: async () => { sent.push(1); return { ok: true }; }, log: () => {} });
  await relay.notifyWaiting();
  assert.deepEqual([sent.length, reads], [0, []]);
});

test('the newest wait of a card is the one alerted, whatever order GitHub lists the events in', async () => {
  const label = L.blocked;
  const comments = { 1: [{ id: 5, updated_at: '2026-02-01T00:01:00Z', body: notifiedComment([`${label}@8`]) }] };
  const gh = {
    listIssues: async ({ labels }) => (labels === label ? [card(1, [label])] : []),
    listRepoEvents: async () => [
      { id: 7, event: 'labeled', label: { name: label }, created_at: '2026-01-01T00:00:00Z', issue: { number: 1 } },
      { id: 8, event: 'labeled', label: { name: label }, created_at: '2026-02-01T00:00:00Z', issue: { number: 1 } },
    ],
    listCommentsSince: async (n, since) => comments[n].filter((c) => c.updated_at >= since),
    listEvents: async () => [],
    listComments: async (n) => comments[n],
    comment: async () => { writes.push('comment'); return { id: 6 }; },
    updateComment: async () => { writes.push('update'); },
  };
  const sent = [];
  const writes = [];
  const relay = createRelay({ gh, repo: 'o/p', config: { runner: 'claude-cloud', maxParallel: 2, stages: {}, review: { maxLoops: 3 } }, env: { NTFY_TOPIC: 't' }, fetchImpl: async () => { sent.push(1); return { ok: true }; }, log: () => {} });
  await relay.notifyWaiting();
  assert.deepEqual([sent.length, writes], [0, []]);
});

test('a card whose launch waits for its relaunch sends no alert: the owner already answered (#383)', () => {
  assert.deepEqual(waitingCards([card(3, [L.specReview, L.relaunch])]), []);
  assert.equal(waitingCards([card(4, [L.blocked, L.relaunch], { body: '<!-- factory-relaunch {"blocked":true,"next":null} -->' })]).length, 1, 'given up after 3 hours');
});
