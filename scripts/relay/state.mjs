// Part of the relay engine (scripts/relay.mjs): the state of one relay run (outputs, comment cache, places in use, card locks).
// Its functions reach the other parts through the shared context `ctx` built by createRelay.
import { L } from '../lib/labels.mjs';
import { trustedAuthor } from '../lib/trust.mjs';
import { SHOTS_BRANCH, LOCK_MINUTES, prIssue, names } from './shared.mjs';

export function statePart(ctx) {
  const { gh, repo, now } = ctx;
  const takesPlace = (...a) => ctx.takesPlace(...a);
  const waitingLaunches = (...a) => ctx.waitingLaunches(...a);

  const outputs = {};
  const liveLabels = async (n) => names((await gh.getIssue(n))?.labels);
  // The captures table, posted by the agent or the factory: a stranger who names the branch shows nothing (issue #339).
  const postedCaptures = (c) => (c?.body || '').includes(SHOTS_BRANCH) && trustedAuthor(c, String(repo || '').split('/')[0]);
  // A PR whose branch lives in another repository: anyone can open one and write what they like in it.
  const fromFork = (p) => Boolean(p?.head && 'repo' in p.head && p.head.repo?.full_name !== repo);

  // `freed`: an issue whose build just ended. GitHub's issue list can still show its old label for a few
  // seconds, which used to keep its place taken until the next regular tick.
  // A place is taken only while the agent builds: once the card's PR is open (checks, captures, recette), the
  // next card can start (owner's rule). A blocked card has given up its place too, until the owner answers.
  const woken = new Set(); // cards wakeWaiters resumed during this relay run
  ctx.dequeues = 0; // queue checks made during this relay run (see refilling)
  // A blocked card's comments, read once per relay run while the card does not change (its `updated_at` moves with
  // every new comment): the queue is checked several times per run, and the alerts read the same cards.
  const commentCache = new Map();
  async function cardComments(item) {
    const hit = commentCache.get(item.number);
    if (hit && item.updated_at && hit.at === item.updated_at) return hit.comments;
    const comments = (await gh.listComments(item.number)) || [];
    commentCache.set(item.number, { at: item.updated_at, comments });
    return comments;
  }

  // `self`: the card an event is about; its own waiting launch must not count against it (a second « go »).
  async function inFlight(freed = null, self = null) {
    const open = await gh.listIssues({ labels: L.building });
    const withPr = new Set(((await gh.listPulls?.().catch(() => null)) || []).filter((p) => !fromFork(p)).map(prIssue).filter(Boolean));
    // A card woken by this run counts even when GitHub's list still shows it blocked.
    const building = (open || []).filter((i) => !i.pull_request && i.number !== freed && !withPr.has(i.number) && (woken.has(i.number) || !names(i.labels).includes(L.blocked))).length;
    // A « go » whose launch waits for its relaunch (issue #383) holds its place too.
    const waiting = (await waitingLaunches()).filter(({ item, saved }) => ![freed, self].includes(item.number) && takesPlace(saved) && !names(item.labels).includes(L.building)).length;
    return building + waiting;
  }

  async function lockStart(number) {
    const events = (await gh.listEvents(number)) || [];
    const last = events.filter((e) => e.event === 'labeled' && e.label?.name === L.running).pop();
    return last ? Date.parse(last.created_at) : null;
  }

  async function lockFresh(number, labels) {
    if (!labels.includes(L.running)) return false;
    const start = await lockStart(number);
    return start !== null && now() - start < LOCK_MINUTES * 60_000;
  }


  return { outputs, liveLabels, postedCaptures, fromFork, woken, commentCache, cardComments, inFlight, lockStart, lockFresh };
}
