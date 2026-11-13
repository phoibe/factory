// Part of the relay engine (scripts/relay.mjs): watching and repairs (conflicts, closing/reopening cards, rate limit and outage retries, labels, idle cards, stale locks, waiting messages).
// Its functions reach the other parts through the shared context `ctx` built by createRelay.
import { L, closeReason, CLOSE_REASONS, AGENT_MARKER, UPDATE_BRANCH_MARKER, buildStage } from '../lib/labels.mjs';
import { PREPROD_BRANCH } from '../lib/config-core.mjs';
import { isRateLimited } from '../lib/ratelimit.mjs';
import { syncFingerprint } from '../lib/fingerprint.mjs';
import { WAIT_LABELS, waitingCards, alertText, sendAlert, NOTIFIED_MARKER, notifiedKeys, notifiedComment } from '../lib/notify.mjs';
import { readOutage, writeOutage, syncStep, OUTAGE_GIVE_UP_MS } from '../lib/outage.mjs';
import { waitedFor } from '../lib/waits.mjs';
import { ROOT, PROJECT_WORKFLOW, MAX_BRANCH_UPDATES, updateMark, branchUpdates, IDLE_MINUTES, HEAL_MARKER, RATE_LIMIT_STEP, MAX_RATE_LIMIT_ATTEMPTS, OUTAGE_LOST_MS, REOPEN_MARKER, REOPEN_LABELS, REOPEN_PR_LABELS, stripReopen, CLOSE_STATE, branchIssue, prIssue, say, names, linkedIssue } from './shared.mjs';

export function watchPart(ctx) {
  const { gh, repo, env, fetchImpl, now, log } = ctx;
  const liveLabels = (...a) => ctx.liveLabels(...a);
  const fromFork = (...a) => ctx.fromFork(...a);
  const cardComments = (...a) => ctx.cardComments(...a);
  const lockStart = (...a) => ctx.lockStart(...a);
  const lockFresh = (...a) => ctx.lockFresh(...a);
  const launch = (...a) => ctx.launch(...a);
  const clearRelaunch = (...a) => ctx.clearRelaunch(...a);
  const waitingLaunches = (...a) => ctx.waitingLaunches(...a);
  const retryLaunches = (...a) => ctx.retryLaunches(...a);
  const dropStaleRelaunchLabels = (...a) => ctx.dropStaleRelaunchLabels(...a);
  const fireOrBlock = (...a) => ctx.fireOrBlock(...a);
  const dequeue = (...a) => ctx.dequeue(...a);
  const syncPreprod = (...a) => ctx.syncPreprod(...a);
  const settledPr = (...a) => ctx.settledPr(...a);
  const syncVersionTag = (...a) => ctx.syncVersionTag(...a);
  const ensureStackSheet = (...a) => ctx.ensureStackSheet(...a);
  const unstickRedos = (...a) => ctx.unstickRedos(...a);
  const lastRunningAt = (...a) => ctx.lastRunningAt(...a);
  const handle = (...a) => ctx.handle(...a);
  const report = (...a) => ctx.report(...a);

  // GitHub runs no pull_request workflow for a PR in conflict with main: a PR waiting for its checks would
  // wait forever. Checked right after every merge (that is when a PR falls into conflict) and on every event.
  async function unstickConflicts() {
    const waiting = ((await gh.listIssues({ labels: L.checks })) || []).filter((i) => i.pull_request);
    for (const item of waiting) {
      if (names(item.labels).includes(L.running) || names(item.labels).includes(L.relaunch)) continue; // its launch waits
      const pr = await settledPr(item.number);
      if (pr?.state !== 'open' || pr.mergeable_state !== 'dirty') continue;
      if (!(await liveLabels(item.number)).includes(L.checks)) continue; // another relay run took it
      const updates = branchUpdates(await gh.listComments(item.number), pr.head?.sha);
      const issue = prIssue(pr);
      if (updates >= MAX_BRANCH_UPDATES) {
        await gh.removeLabel(item.number, L.checks);
        if (issue) await gh.addLabels(issue, [L.blocked]);
        await gh.comment(issue || item.number, say(`La PR #${item.number} est en conflit avec la version en ligne et l'agent n'a pas réussi à la remettre à jour. Répondez « réessaie » ici pour une nouvelle tentative.`));
        continue;
      }
      await fireOrBlock({ stage: 'update-branch', issue, pr: item.number, why: 'La branche est en conflit avec la version en ligne', then: {
        labels: [{ n: item.number, remove: [L.checks], add: [L.fixing] }],
        comments: [{ n: item.number, body: `${UPDATE_BRANCH_MARKER}\n${updateMark(pr.head?.sha)}\n${say("Les contrôles ne pouvaient pas démarrer : la branche est en conflit avec la version en ligne (une autre feature est passée entre-temps). L'agent la met à jour, puis les contrôles repartent. Rien à faire de votre côté pour l'instant.")}` }],
      } });
    }
  }

  // The owner gave up on a card (PR or issue): close it with its PR or issue, and free its place. The agent's run is
  // refused closing anything, so it only asks for it with factory:close and the factory does it here.
  async function dropCard(n, owner) {
    const item = await gh.getIssue(n);
    if (!item || item.state !== 'open') return;
    const isPr = Boolean(item.pull_request);
    const pr = isPr ? await gh.getPr(n) : null;
    const issue = isPr ? prIssue(pr) : n;
    const prs = isPr ? [n] : ((await gh.listPulls?.().catch(() => null)) || []).filter((p) => !fromFork(p) && (linkedIssue(p.body) === n || branchIssue(p) === n)).map((p) => p.number);
    // The agent closing by itself (already done, duplicate, obsolete: issue #203). Only a feature or a bug; its own
    // message is the only one, and the card's state is saved so that a message from the owner brings it back.
    const it0 = issue ? (issue === n ? item : await gh.getIssue(issue)) : null;
    const reason = closeReason(names(item.labels)) || closeReason(names(it0?.labels));
    if (reason) {
      const kinds = names(it0?.labels);
      if (!it0 || it0.state !== 'open' || ![L.feature, L.bug].some((l) => kinds.includes(l))) {
        for (const k of new Set([n, issue].filter(Boolean))) for (const l of [L.close, ...CLOSE_REASONS]) await gh.removeLabel(k, l);
        log(`drop: #${n} refused, the agent only closes a feature or a bug by itself`);
        await gh.comment(issue || n, say("La factory ne ferme pas seule ce type de demande : elle reste ouverte. Dites « fermer » ici si vous voulez l'abandonner."));
        return;
      }
      // The owner wrote during the run (on the request or its PR): his message wins, nothing is closed.
      const cards = [...new Set([issue, ...prs])];
      const waiting = [];
      for (const k of cards) if ((await liveLabels(k)).includes(L.pending)) waiting.push(k);
      if (waiting.length) {
        for (const k of cards) for (const l of [L.close, ...CLOSE_REASONS]) await gh.removeLabel(k, l);
        log(`drop: #${n} not closed, the owner wrote meanwhile`);
        for (const k of waiting) await handle({ kind: 'replay', event: 'issues', action: 'unlabeled', removedLabel: L.running, number: k, labels: [] }, { ownerLogin: owner });
        return;
      }
      if (!kinds.includes(reason)) await gh.addLabels(issue, [reason]);
      const prSteps = [];
      for (const p of prs) prSteps.push({ n: p, labels: (await liveLabels(p)).filter((l) => REOPEN_PR_LABELS.includes(l)) });
      const saved = { labels: kinds.filter((l) => REOPEN_LABELS.includes(l)), prs: prSteps };
      await gh.updateIssue(issue, { body: `${stripReopen(it0.body)}\n\n${REOPEN_MARKER} ${JSON.stringify(saved)} -->`.replace(/^\n\n/, '') });
    }
    const dropLabels = async (k) => {
      await clearRelaunch(k); // a launch that waited must never start on a closed card
      for (const l of (await liveLabels(k)).filter((x) => [L.building, L.blocked, L.running, L.queued, L.pending, L.fixing, L.grilling, L.specReview, L.visualReview, L.checks, L.acceptance, L.close, L.resumeQueued].includes(x))) await gh.removeLabel(k, l);
    };
    for (const p of prs) {
      await gh.closePr(p);
      await dropLabels(p);
      // The reason lives on the request only: a closed PR keeping it would start the agent on a message.
      for (const l of CLOSE_REASONS) if ((await liveLabels(p)).includes(l)) await gh.removeLabel(p, l);
    }
    if (issue) {
      const it = issue === n ? item : await gh.getIssue(issue);
      await dropLabels(issue);
      if (it?.state === 'open') await gh.closeIssue(issue, CLOSE_STATE[reason] || 'not_planned');
    }
    if (reason) { log(`drop: #${n} closed by the agent (${reason})`); return dequeue({ freed: issue }); }
    const what = isPr ? (issue ? `cette PR est abandonnée et la demande #${issue} est fermée` : 'cette PR est abandonnée')
      : (prs.length ? `cette demande est fermée, avec sa PR #${prs[0]}` : 'cette demande est fermée');
    await gh.comment(n, say(`C'est fait : ${what}. Rien n'a été mis en ligne. Pour reprendre le sujet plus tard, rouvrez-la.`));
    log(`drop: #${n} closed`);
    await dequeue({ freed: issue || null });
  }

  // A card the agent marked factory:close but whose run ended without removing factory:running (or whose event was
  // lost): closed on the next tick all the same.
  async function closeAsked(ownerLogin) {
    for (const item of (await gh.listIssues({ labels: L.close })) || []) {
      // An agent still at work closes its card itself when it ends: the tick only takes the ones left behind.
      if (await lockFresh(item.number, names(item.labels))) continue;
      await dropCard(item.number, ownerLogin);
    }
  }

  // The owner wrote in a request the agent closed by itself: it opens again with its PRs, at the step it was at, and
  // blocked, so the usual « blocked card answered » path resumes it (or queues it when the factory is full).
  async function reopenCard(n) {
    const item = await gh.getIssue(n);
    const m = new RegExp(`${REOPEN_MARKER} (\\{.*?\\}) -->`).exec(item?.body || '');
    let saved = { labels: [], prs: [] };
    try { if (m) saved = { ...saved, ...JSON.parse(m[1]) }; } catch { /* a damaged marker: reopen with no state */ }
    if (item?.state === 'closed') await gh.reopenIssue(n);
    if (m) await gh.updateIssue(n, { body: stripReopen(item.body) });
    for (const l of CLOSE_REASONS) if (names(item?.labels).includes(l)) await gh.removeLabel(n, l);
    // A card closed in the queue comes back as building: blocked, the answered path starts it or queues it again.
    const step = [...new Set(saved.labels.filter((l) => REOPEN_LABELS.includes(l)).map((l) => ([L.queued, L.resumeQueued].includes(l) ? L.building : l)))];
    // No saved step (never started, or closed by hand with the label): it starts like a new request.
    if (step.length) await gh.addLabels(n, [...step, L.blocked]);
    let stepless = null;
    for (const p of saved.prs || []) {
      const { n: number, labels = [] } = typeof p === 'number' ? { n: p } : p;
      try {
        await gh.reopenPr(number);
        const back = labels.filter((l) => REOPEN_PR_LABELS.includes(l));
        if (back.length) await gh.addLabels(number, back);
        else stepless = number;
      } catch (e) { log(`reopen PR #${number}: ${e.message}`); }
    }
    log(`reopen: #${n} (${step.join(', ') || 'no saved step'})`);
    return { stepless };
  }

  // The guard, run on every tick: repairs the states no event will ever move, so a place is never held for nothing.
  // It only speaks to the owner when it cannot repair (a card that stops twice without finishing).
  async function heal(ownerLogin) {
    await retryRateLimited().catch((e) => log(`rate-limited runs: ${e.message}`));
    await retryLaunches().catch((e) => { if (isRateLimited(e)) throw e; log(`relaunches: ${e.message}`); });
    await dropStaleRelaunchLabels().catch((e) => { if (isRateLimited(e)) throw e; log(`stale relaunch labels: ${e.message}`); });
    const closed = (await gh.listClosedPulls?.().catch(() => null)) || [];
    await closeMerged(closed);
    await relaunchIdle(closed, ownerLogin);
    await releaseStaleLocks(ownerLogin);
    await reportLost();
    await closeAsked(ownerLogin);
    await retryOutages();
    await unstickRedos().catch((e) => log(`stuck redo cards: ${e.message}`));
    await syncIfBehind();
    await ensureStackSheet().catch((e) => log(`stack sheet: ${e.message}`));
    await syncPreprod().catch((e) => log(`${PREPROD_BRANCH}: ${e.message}`));
    await syncVersionTag().catch((e) => log(`version tag: ${e.message}`));
  }

  // A relay run stopped by GitHub's « too many requests » left its event undone: re-running its failed jobs replays
  // the very same event, now that the limit has passed. Runs of the last day only, a few attempts each.
  async function retryRateLimited() {
    if (!gh.failedRuns) return;
    const since = now() - 24 * 3600_000;
    // A primary limit lasts at most an hour and ticks run late: a run is looked at for 2 h after it last moved, then
    // its jobs are no longer read at every tick.
    const moved = now() - 2 * 60 * 60_000;
    for (const run of await gh.failedRuns(PROJECT_WORKFLOW)) {
      if (run.event === 'schedule') continue; // a stopped tick: the next one does the same work
      if (Date.parse(run.created_at) < since || (run.run_attempt || 1) >= MAX_RATE_LIMIT_ATTEMPTS) continue;
      if (run.updated_at && Date.parse(run.updated_at) < moved) continue;
      const jobs = await gh.runJobs(run.id);
      // A checks report stopped this way is made again by reportLost, from the checks' own result: not re-run twice.
      const stopped = jobs.filter((j) => (j.steps || []).some((st) => st.name === RATE_LIMIT_STEP && st.conclusion === 'failure'));
      if (!stopped.length || stopped.every((j) => /(^|\/ )report$/.test(j.name || ''))) continue;
      await gh.rerunFailed(run.id);
      log(`guard: run ${run.id} stopped by the rate limit, re-run`);
    }
  }

  // Checks that failed on an outage (issue #213): the retries due now start here, one per PR, never while an agent
  // works on it or once the card is blocked. A retry not reported after OUTAGE_LOST_MS is started again.
  async function retryOutages() {
    for (const p of (await gh.listPulls?.().catch(() => null)) || []) {
      const st = readOutage(p.body);
      if (!st || st.blocked || !st.next || now() < st.next) continue;
      const labels = await liveLabels(p.number);
      if (!labels.includes(L.checks) || labels.includes(L.running)) continue;
      const pr = await gh.getPr(p.number);
      if (pr?.state === 'closed' || pr?.head?.sha !== st.sha) continue; // new code: its own checks run anyway
      await gh.updateIssue(p.number, { body: writeOutage(pr.body, { ...st, tries: st.tries + 1, next: now() + OUTAGE_LOST_MS }) });
      const ref = (await gh.getRepo())?.default_branch || 'main';
      await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ checksFor: p.number }) });
      log(`guard: checks of #${p.number} retried after an outage (try ${st.tries + 1})`);
    }
  }

  // The project's agent instructions come from its last sync, which only ran on a config change or weekly: a fix to
  // the agent's rules (« never close, add factory:close ») reached the relay at once but the agent a week later.
  // When the project's synced fingerprint differs from this factory version's, the sync is started now.
  async function syncIfBehind() {
    if (!gh.getContent) return;
    let mine;
    try { mine = syncFingerprint(ROOT); } catch { return; }
    const file = await gh.getContent('.factory/synced.json').catch(() => null);
    let theirs = null;
    try { theirs = file?.content ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')).fingerprint : null; } catch { /* resync */ }
    // A sync that cannot be pushed used to be started again every 5 minutes forever: the retries are spaced out and
    // the owner gets one alert after a day for the same version (issue #213). The state lives in a ref, see github.mjs.
    const state = gh.getState ? await gh.getState('sync').catch(() => null) : null;
    const step = syncStep(state, { mine, theirs, now: now() });
    if (step.changed && gh.setState) await gh.setState('sync', step.state).catch((e) => log(`sync state: ${e.message}`));
    if (step.alert) {
      const project = repo.split('/')[1] || repo;
      const sent = await sendAlert({ topic: (env.NTFY_TOPIC || '').trim(), message: `La mise à jour du projet ${project} ne passe pas depuis hier. Je continue à réessayer une fois par jour.`, click: `https://github.com/${repo}/actions/workflows/factory-sync.yml`, fetchImpl });
      log(`sync failing for a day: alert ${sent ? 'sent' : 'not sent'}`);
    }
    if (!step.dispatch) return;
    const ref = (await gh.getRepo())?.default_branch || 'main';
    try { await gh.dispatch('factory-sync.yml', ref, {}); log(`sync started: project at ${theirs || 'unknown'}, factory at ${mine}`); }
    catch (e) { log(`sync not started (${String(e.message || e).slice(0, 80)})`); }
  }

  // The open PR of a card that a long outage blocked (its marker says so), or null. A PR from a fork is never one:
  // anyone can write that marker in its description (issue #339).
  async function outageBlockedPr(ev) {
    const prs = ev.kind === 'pr'
      ? [await gh.getPr(ev.number)]
      : ((await gh.listPulls?.().catch(() => null)) || []).filter((p) => linkedIssue(p.body) === ev.number || branchIssue(p) === ev.number);
    return prs.find((p) => p && p.state !== 'closed' && !fromFork(p) && readOutage(p.body)?.blocked)?.number || null;
  }

  // The checks ran but their report step died (GitHub 503, runner lost): nothing else will ever move the PR, which
  // stays in « contrôles » with green checks. The report is made again from the checks' own result.
  async function reportLost() {
    const waiting = ((await gh.listIssues({ labels: L.checks })) || []).filter((i) => i.pull_request);
    for (const item of waiting) {
      if (names(item.labels).includes(L.running)) continue;
      const pr = await gh.getPr(item.number);
      if (pr?.state !== 'open') continue;
      const runs = (await gh.checkRuns?.(pr.head.sha).catch(() => null)) || [];
      const job = (name) => runs.filter((r) => new RegExp(`(^|/ )${name}$`).test(r.name)).sort((a, b) => Date.parse(b.started_at || 0) - Date.parse(a.started_at || 0))[0];
      const checks = job('checks');
      const last = job('report');
      if (!checks || checks.status !== 'completed' || !['success', 'failure'].includes(checks.conclusion)) continue;
      if (!last || last.status !== 'completed' || last.conclusion !== 'failure') continue;
      if (Date.parse(last.started_at || 0) < Date.parse(checks.completed_at || 0)) continue; // an older report
      if (!(await liveLabels(item.number)).includes(L.checks)) continue; // another relay run took it
      log(`guard: report of #${item.number} lost, made again (${checks.conclusion})`);
      // Red checks on a commit already followed for an outage: the lost report most likely died of the same outage.
      // Never past the 3 hours: a replayed report must not block the card by itself, the usual path takes it then.
      const followed = readOutage(pr.body);
      const transient = checks.conclusion === 'failure' && followed?.sha === pr.head.sha && now() - followed.since < OUTAGE_GIVE_UP_MS;
      await report({ result: checks.conclusion, pr: item.number, sha: pr.head.sha, transient });
    }
  }

  // A merge GitHub did not follow with « Closes #n » (bot merge, lost event): the issue stays open and holds a place.
  // A factory label typed wrong by an agent (« une semaine à la fois:factory:feature » on yoldmewhen2 #55, 2026-11-06)
  // hides the card from the factory: nothing picks it, the board does not show it. Put the real label back.
  const KNOWN = new Set(Object.values(L).filter((v) => typeof v === 'string' && v.startsWith('factory:')));
  const meant = (label) => { const m = /(factory:[a-z-]+)\s*$/.exec(label); return m && m[1] !== label && KNOWN.has(m[1]) ? m[1] : null; };
  async function repairLabels() {
    if (!gh.listOpenIssues) return;
    for (const issue of (await gh.listOpenIssues()) || []) {
      for (const label of names(issue.labels)) {
        const fixed = meant(label);
        if (!fixed) continue;
        await gh.addLabels(issue.number, [fixed]);
        await gh.removeLabel(issue.number, label);
        log(`#${issue.number}: label « ${label} » replaced by ${fixed}`);
      }
    }
  }

  // One read of the open issues instead of one per recently closed PR: a finished card costs nothing.
  async function closeMerged(closed) {
    const merged = closed.filter((p) => p.merged_at);
    if (!merged.length) return;
    const open = gh.listOpenIssues ? new Map(((await gh.listOpenIssues()) || []).map((i) => [i.number, i])) : null;
    for (const pr of merged) {
      const n = prIssue(pr);
      if (!n || (open && !open.has(n))) continue;
      const issue = open ? open.get(n) : await gh.getIssue(n);
      if (!issue || issue.state !== 'open' || issue.pull_request) continue;
      const labels = names(issue.labels);
      if (!labels.some((l) => l.startsWith('factory:'))) continue;
      // Reopened by the owner after the merge: there is more to do on it.
      const events = (await gh.listEvents(n)) || [];
      if (events.some((e) => e.event === 'reopened' && Date.parse(e.created_at) > Date.parse(pr.merged_at))) continue;
      for (const l of [L.building, L.blocked, L.running, L.queued, L.pending]) if (labels.includes(l)) await gh.removeLabel(n, l);
      await gh.closeIssue(n);
      log(`guard: #${n} closed, its PR #${pr.number} was merged`);
    }
  }

  async function relaunchIdle(closed, ownerLogin) {
    const building = ((await gh.listIssues({ labels: L.building })) || []).filter((i) => !i.pull_request && !names(i.labels).includes(L.relaunch));
    if (!building.length) return;
    if ((await waitingLaunches()).length) return; // the service is down: the waiting launches go first
    // A fork PR names whatever card it likes: it never stands for the card's own PR (issue #339).
    const linked = new Set([...((await gh.listPulls?.().catch(() => null)) || []).filter((p) => !fromFork(p)), ...closed].flatMap((p) => [linkedIssue(p.body), branchIssue(p)]).filter(Boolean));
    for (const item of building) {
      const n = item.number;
      if (linked.has(n)) continue; // it has a PR (open: the PR steps move it; closed by the owner: on purpose)
      const labels = await liveLabels(n);
      if (!labels.includes(L.building) || [L.blocked, L.queued].some((l) => labels.includes(l))) continue;
      if (labels.includes(L.running)) {
        if (await lockFresh(n, labels)) continue;
        await gh.removeLabel(n, L.running); // the agent died without releasing its lock
        if (labels.includes(L.pending)) {
          await handle({ kind: 'replay', event: 'issues', action: 'unlabeled', removedLabel: L.running, number: n, labels: [] }, { ownerLogin });
          continue;
        }
      } else {
        if (labels.includes(L.pending)) continue;
        const at = await lastRunningAt(n);
        if (at === null || now() - at < IDLE_MINUTES * 60_000) continue;
      }
      const heals = ((await gh.listComments(n)) || []).filter((c) => (c.body || '').includes(HEAL_MARKER)).length;
      if (heals >= 1) {
        await gh.addLabels(n, [L.blocked]);
        await gh.comment(n, `${HEAL_MARKER}\n${say("L'agent s'est arrêté deux fois avant d'avoir fini, sans ouvrir de PR ni poser de question. Je mets la carte de côté pour qu'elle ne bloque pas la file. Répondez « réessaie » ici pour le relancer.")}`);
        log(`guard: #${n} blocked after a second stop`);
        continue;
      }
      const stage = labels.includes(L.project) ? 'foundation' : buildStage(labels);
      let started = false;
      try {
        started = await launch({ stage, issue: n, extra: { relaunch: true }, quiet: true, then: {
          comments: [{ n, body: `${HEAL_MARKER}\n${say("L'agent s'était arrêté avant d'avoir fini : je le relance là où il en était. Rien à faire de votre côté.")}` }],
        } });
      } catch (e) {
        log(`guard: relaunch of #${n} failed: ${e}`);
      }
      if (!started) break; // the routine does not start: no use trying the others now
      log(`guard: #${n} relaunched (${stage})`);
    }
  }

  // A lock older than the agent's time limit on any other card (grilling, PR fix…): the agent is gone. Released the
  // way the agent would have, so messages written meanwhile are handled.
  async function releaseStaleLocks(ownerLogin) {
    for (const item of (await gh.listIssues({ labels: L.running })) || []) {
      const labels = await liveLabels(item.number);
      if (!labels.includes(L.running) || (await lockFresh(item.number, labels))) continue;
      await gh.removeLabel(item.number, L.running);
      log(`guard: stale lock released on #${item.number}`);
      await handle({ kind: 'replay', event: 'issues', action: 'unlabeled', removedLabel: L.running, number: item.number, labels: [] }, { ownerLogin });
    }
  }

  // Owner messages (comments and PR reviews) written since the lock was taken, joined into one, or null.
  async function deferredMessage(number, ownerLogin, isPr) {
    const since = await lockStart(number);
    const after = (t) => since === null || Date.parse(t) >= since;
    const comments = ((await gh.listComments(number)) || [])
      .filter((c) => c.user?.login === ownerLogin && !(c.body || '').includes(AGENT_MARKER) && after(c.created_at))
      .map((c) => ({ at: c.created_at, body: c.body }));
    const reviews = isPr ? ((await gh.listReviews(number)) || [])
      .filter((r) => r.user?.login === ownerLogin && r.body && !r.body.includes(AGENT_MARKER) && after(r.submitted_at))
      .map((r) => ({ at: r.submitted_at, body: r.body })) : [];
    const all = [...comments, ...reviews].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return all.length ? all.map((m) => m.body).join('\n\n') : null;
  }

  // Phone alert (ntfy) for each card that starts waiting for the owner. One per wait, no reminder: the wait is
  // identified by the label's latest « labeled » event, kept in a hidden comment on the card. Without
  // NTFY_TOPIC in the project, nothing happens. Never throws.
  async function notifyWaiting() {
    const topic = (env.NTFY_TOPIC || '').trim();
    if (!topic) return;
    try {
      const items = [];
      for (const label of WAIT_LABELS) items.push(...((await gh.listIssues({ labels: label })) || []));
      const project = repo.split('/')[1] || repo;
      const cards = waitingCards(items);
      // The latest label events of the whole repository in one read; a card whose wait began earlier reads its own.
      const recent = cards.length && gh.listRepoEvents ? ((await gh.listRepoEvents().catch((e) => { if (isRateLimited(e)) throw e; return null; })) || []) : [];
      const isWait = (card) => (e) => e.event === 'labeled' && e.label?.name === card.label;
      for (const card of cards) {
        try {
          // A card that only waits for another request's merge needs nothing from the owner (issue #298). If that
          // request is abandoned the link is used up, and this same wait is announced then.
          if (card.label === L.blocked && waitedFor(await cardComments(card)).length) continue;
          const newest = (list) => list.reduce((a, e) => (!a || Number(e.id) > Number(a.id) ? e : a), null);
          const wait = newest(recent.filter((e) => e.issue?.number === card.number && isWait(card)(e)))
            || newest(((await gh.listEvents(card.number)) || []).filter(isWait(card)));
          const key = `${card.label}@${wait?.id ?? 'x'}`;
          // The key of this wait was written after it began: only comments updated since then can hold it.
          const fresh = wait?.created_at && gh.listCommentsSince ? (await gh.listCommentsSince(card.number, wait.created_at)) || [] : null;
          const marked = (list) => list.find((c) => (c.body || '').includes(NOTIFIED_MARKER));
          if (fresh && notifiedKeys(marked(fresh)?.body).includes(key)) continue;
          let mine = (fresh && marked(fresh)) || marked((await gh.listComments(card.number)) || []);
          const keys = notifiedKeys(mine?.body);
          if (keys.includes(key)) continue;
          // Write the key first: a crash or a failed write after the send would otherwise repeat the alert forever.
          const text = notifiedComment([...keys, key].slice(-10));
          if (mine) await gh.updateComment(mine.id, text); else mine = await gh.comment(card.number, text);
          if (!(await sendAlert({ topic, message: alertText(project, card.label), click: card.url, fetchImpl }))) {
            log(`alert #${card.number} not sent`);
            if (mine?.id) await gh.updateComment(mine.id, notifiedComment(keys)); // retried at the next tick
          }
        } catch (e) { log(`alert #${card.number}: ${e.message}`); }
      }
    } catch (e) { log(`alerts: ${e.message}`); }
  }


  return { unstickConflicts, dropCard, closeAsked, reopenCard, heal, retryRateLimited, retryOutages, syncIfBehind, outageBlockedPr, reportLost, KNOWN, meant, repairLabels, closeMerged, relaunchIdle, releaseStaleLocks, deferredMessage, notifyWaiting };
}
