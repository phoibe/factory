import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepsFor, progress, laneFor, actionFor, moves, agoText, statusText, pollDelay, timeLine, isIdle, cardChanges, yoursList } from '../panel/live.mjs';

test('a feature goes through six steps, a bug skips the questions and the spec', () => {
  assert.deepEqual(stepsFor(['factory:feature']).map((s) => s.id), ['grilling', 'spec', 'building', 'visual', 'checks', 'acceptance']);
  assert.deepEqual(stepsFor(['factory:bug']).map((s) => s.id), ['building', 'visual', 'checks', 'acceptance']);
});

test('progress places the card on its step', () => {
  assert.deepEqual(progress({ column: 'visual', labels: ['factory:feature', 'factory:visual-review'] }), { index: 3, total: 6, name: 'Captures' });
  assert.deepEqual(progress({ column: 'checks', labels: ['factory:bug', 'factory:checks'] }), { index: 2, total: 4, name: 'Contrôles' });
});

test('a queued feature sits before the build, a blocked one keeps its underlying step', () => {
  assert.equal(progress({ column: 'queued', labels: ['factory:feature', 'factory:queued'] }).index, 2);
  assert.deepEqual(progress({ column: 'blocked', labels: ['factory:feature', 'factory:building', 'factory:blocked'] }), { index: 2, total: 6, name: 'Construction' });
  assert.equal(progress({ column: 'blocked', labels: ['factory:blocked'] }), null);
});

test('laneFor sorts cards into what waits for the owner, what agents do, and the queue', () => {
  assert.equal(laneFor({ column: 'spec', labels: ['factory:spec-review'] }), 'yours');
  assert.equal(laneFor({ column: 'spec', labels: ['factory:spec-review', 'factory:running'] }), 'working');
  assert.equal(laneFor({ column: 'building', labels: ['factory:building'] }), 'working');
  assert.equal(laneFor({ column: 'queued', labels: ['factory:queued'] }), 'queued');
});

test('actionFor names what the owner has to do', () => {
  assert.equal(actionFor('grilling'), 'Répondez aux questions');
  assert.equal(actionFor('acceptance'), 'Testez l\'aperçu');
  assert.equal(actionFor('building'), null);
});

test('moves lists the cards that changed step since the previous refresh', () => {
  const prev = new Map([[1, 'building'], [2, 'checks']]);
  const cards = [{ number: 1, title: 'A', column: 'visual' }, { number: 2, title: 'B', column: 'checks' }, { number: 3, title: 'C', column: 'queued' }];
  assert.deepEqual(moves(prev, cards), [{ number: 1, title: 'A', from: 'building', to: 'visual' }]);
  assert.deepEqual(moves(null, cards), []);
});

test('agoText is short and in French', () => {
  assert.equal(agoText(3_000), "à l'instant");
  assert.equal(agoText(25_000), 'il y a 25 s');
  assert.equal(agoText(185_000), 'il y a 3 min');
});

test('pollDelay is 8 s when active, 30 s when idle, and backs off after failures, up to 5 min', () => {
  assert.equal(pollDelay(0), 8_000);
  assert.equal(pollDelay(0, true), 30_000);
  assert.equal(pollDelay(1), 16_000);
  assert.equal(pollDelay(1, true), 60_000);
  assert.equal(pollDelay(10), 300_000);
});

test('timeLine gives one short line per lane', () => {
  const clock = () => '00:17';
  assert.equal(timeLine({ status: 'working', nextLow: 20, nextHigh: 40, next: 28, total: 40, endAt: 1 }, clock), 'Entre 20 et 40 min avant la suite');
  assert.equal(timeLine({ status: 'working', overrun: true, nextLow: 0, nextHigh: 0 }, clock), 'Plus long que prévu · nouvelle estimation en cours');
  assert.equal(timeLine({ status: 'yours', total: 61 }, clock), 'Ensuite ~1 h 01 de travail des agents');
  assert.equal(timeLine({ status: 'queued' }, clock), "Démarre dès qu'une place se libère");
});

test('isIdle is true after 2 minutes without activity', () => {
  assert.equal(isIdle(1_000, 1_000 + 119_999), false);
  assert.equal(isIdle(1_000, 1_000 + 120_000), true);
});

test('cardChanges tells added, removed and changed cards, and nothing when identical', () => {
  const prev = new Map([[1, 'a'], [2, 'b'], [3, 'c']]);
  assert.deepEqual(cardChanges(prev, new Map([[1, 'a'], [3, 'x'], [4, 'd']])), { added: [4], removed: [2], changed: [3] });
  assert.deepEqual(cardChanges(prev, new Map(prev)), { added: [], removed: [], changed: [] });
  assert.deepEqual(cardChanges(null, prev).added, [1, 2, 3]);
});

test('yoursList puts the oldest wait first: the spec step is a plain « go », the captures and the recette a plain « ok »', () => {
  const item = (number, column, updated_at, labels = []) => ({ number, column, updated_at, labels });
  const list = yoursList([
    item(3, 'acceptance', '2026-11-04T12:00:00Z'),
    item(1, 'spec', '2026-11-04T09:00:00Z'),
    item(2, 'visual', '2026-11-04T10:00:00Z', ['factory:running']),
    item(4, 'building', '2026-11-04T08:00:00Z'),
    item(5, 'grilling', '2026-11-04T11:00:00Z'),
  ]);
  assert.deepEqual(list.map((c) => [c.number, c.reply]), [[1, 'go'], [5, 'open'], [3, 'ok']]);
  assert.equal(yoursList([item(6, 'visual', '2026-11-04T10:00:00Z')])[0].reply, 'ok');
  assert.equal(yoursList([item(7, 'blocked', '2026-11-04T10:00:00Z', ['factory:blocked'])])[0].reply, 'open');
});

test('the live status line is never empty, so the cards do not jump when its text arrives', () => {
  assert.equal(statusText(0, 2000), "En direct · à jour à l'instant");
  assert.match(statusText(2, 0), /Connexion à GitHub perdue/);
});

test('the « À vous » card is drawn with its status text already filled (no growth after the cards are measured)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../panel/app.mjs', import.meta.url), 'utf8');
  const line = src.split('\n').find((l) => l.includes("class: 'live-text'"));
  assert.match(line, /statusText\(/);
});

test('a card only slides when it really moved: a few pixels of text reflow stay still', async () => {
  const { shouldSlide, SLIDE_MIN_PX } = await import('../panel/live.mjs');
  const r = (top, left = 0) => ({ top, left });
  assert.equal(shouldSlide(r(100), r(101)), false);
  assert.equal(shouldSlide(r(100), r(100 + SLIDE_MIN_PX - 1)), false);
  assert.equal(shouldSlide(r(100, 5), r(103, 5)), false);
  assert.equal(shouldSlide(r(100), r(100 + SLIDE_MIN_PX)), true);
  assert.equal(shouldSlide(r(100, 0), r(100, 300)), true);
});

test('flip uses shouldSlide, so no card is animated for a tiny shift', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../panel/app.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function flip('), src.indexOf('const rectsOf'));
  assert.match(body, /shouldSlide\(a, b\)/);
});

test('withoutTimes ignores the text of time elements but not other changes', async () => {
  const { withoutTimes } = await import('../panel/live.mjs');
  const a = '<article><span class="since" data-time="">depuis 2 min</span><h3>T</h3><p class="eta" data-time="">~5 min restantes</p></article>';
  const b = '<article><span class="since" data-time="">depuis 10 min</span><h3>T</h3><p class="eta" data-time="">~4 min restantes</p></article>';
  assert.equal(withoutTimes(a), withoutTimes(b));
  assert.notEqual(withoutTimes(a), withoutTimes(b.replace('<h3>T', '<h3>U')));
  assert.notEqual(withoutTimes(a), withoutTimes(a.replace('data-time=""', '')));
});

test('syncTimes copies time texts in place and leaves other nodes alone', async () => {
  const { syncTimes } = await import('../panel/live.mjs');
  const mk = (...t) => ({ querySelectorAll: () => t });
  const a = { textContent: 'depuis 2 min' }, b = { textContent: '~5 min' };
  syncTimes(mk(a, b), mk({ textContent: 'depuis 3 min' }, { textContent: '~5 min' }));
  assert.equal(a.textContent, 'depuis 3 min');
  assert.equal(b.textContent, '~5 min');
});

test('a hidden browser tab counts as idle, so it polls every 30 s instead of stopping', () => {
  assert.equal(isIdle(1_000, 1_000 + 5_000, true), true);
  assert.equal(isIdle(1_000, 1_000 + 5_000, false), false);
  assert.equal(isIdle(1_000, 1_000 + 5_000), false);
});

// #211: the board reads a card's comments only when the card may have changed.
import { cardSig, commentsStale } from '../panel/live.mjs';

test('a card that did not change is not read again', () => {
  const c = { number: 1, updated_at: '2026-11-06T10:00:00Z', comments: 4, labels: ['factory:spec-review'] };
  assert.equal(commentsStale(c, cardSig(c), { preview: null }), false);
});

test('a card with a new message is read again', () => {
  const c = { number: 1, updated_at: '2026-11-06T10:00:00Z', comments: 4, labels: [] };
  assert.equal(commentsStale({ ...c, comments: 5, updated_at: '2026-11-06T10:05:00Z' }, cardSig(c), { preview: null }), true);
  assert.equal(commentsStale(c, undefined, { preview: null }), true); // never read
});

test('a card an agent works on is always read: its session note is edited, not added', () => {
  const c = { number: 1, updated_at: '2026-11-06T10:00:00Z', comments: 4, labels: ['factory:running'] };
  assert.equal(commentsStale(c, cardSig(c), { preview: null }), true);
});

test('a PR card still waiting for its preview link is always read: the bot edits its comment', () => {
  const c = { number: 2, pull_request: {}, updated_at: '2026-11-06T10:00:00Z', comments: 2, labels: [] };
  assert.equal(commentsStale(c, cardSig(c), { preview: null }), true);
  assert.equal(commentsStale(c, cardSig(c), { preview: 'https://preview.example' }), false);
});

test('a stack sheet card has no questions and no spec, like a bug', async () => {
  const { stepsFor } = await import('../panel/live.mjs');
  assert.deepEqual(stepsFor(['factory:stack']), stepsFor(['factory:bug']));
});

// Issue #298: a card blocked only while it waits for another request's merge asks nothing of the owner.
import { waitsText, waitsEta, stillWaited } from '../panel/live.mjs';
test('a blocked card that waits for a merge sits in the queue lane, not in « À vous »', () => {
  const c = { labels: ['factory:feature', 'factory:building', 'factory:blocked'], column: 'blocked', waits: [12] };
  assert.equal(laneFor(c), 'queued');
  assert.equal(laneFor({ ...c, waits: [] }), 'yours');
  assert.equal(laneFor({ ...c, labels: [...c.labels, 'factory:running'] }), 'working');
  assert.deepEqual(yoursList([{ ...c, updated_at: '2026-11-08T10:00:00Z' }]), []);
});
test('waitsText names the awaited requests, with the title of a single one when known', () => {
  assert.equal(waitsText([12]), 'Attend #12');
  assert.equal(waitsText([12], new Map([[12, 'Ajouter un compte']])), 'Attend #12 · Ajouter un compte');
  assert.equal(waitsText([12, 15], new Map([[12, 'Ajouter un compte']])), 'Attend #12, #15');
});
test('waitsEta says when the card starts again, and that it is about to once everything is merged', () => {
  assert.equal(waitsEta({ waits: [12] }), 'Repart seule dès sa fusion');
  assert.equal(waitsEta({ waits: [12, 15] }), 'Repart seule dès leur fusion');
  assert.equal(waitsEta({ waits: [12], waitsMerged: true }), 'Reprise imminente');
});
test('stillWaited drops the requests already merged', () => {
  assert.deepEqual(stillWaited([12, 15], [{ number: 30, issue: 12, reason: null }]), [15]);
  assert.deepEqual(stillWaited([12], [{ number: 12, issue: 12, reason: 'Déjà réglée' }]), [12]);
  assert.deepEqual(stillWaited([30], [{ number: 30, issue: 12, reason: null }]), []);
});
