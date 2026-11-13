// Part of the relay engine (scripts/relay.mjs): reacting to events (a message, a « go », a label, the end of a run), previews, captures and the end-of-run report.
// Its functions reach the other parts through the shared context `ctx` built by createRelay.
import { decide, afterChecks } from '../lib/decide.mjs';
import { L, closeReason, CLOSE_REASONS, AGENT_MARKER, CHECKS_FAILED_MARKER, CHECKS_RESET_MARKER, VISUAL_OK_MARKER, NOTHING_TO_TEST_MARKER, REVERT_MARKER } from '../lib/labels.mjs';
import { isRateLimited } from '../lib/ratelimit.mjs';
import { CATCH_UP, FABRICATION_MARKER, parseJournal, smallChange, summarize, uiChanged } from '../lib/fabrication.mjs';
import { readOutage, writeOutage, outageStep, isRetry, OUTAGE_TOLD, SERVER_TOLD } from '../lib/outage.mjs';
import { toJobOutput } from '../lib/job-output.mjs';
import { forwardedAnswer } from '../lib/answer.mjs';
import { markdownTable, brokenShotRows } from '../../agent/scripts/shots.mjs';
import { SKILLS_FIX_MARKER, STEP_NAMES, SHOTS_BRANCH, CHECKS_TIMEOUT_MS, PROJECT_WORKFLOW, OUTAGE_LOST_MS, branchIssue, prIssue, say, names, linkedIssue, vercelPreview } from './shared.mjs';

// Normalises a GitHub webhook payload into the shape decide() expects.
export function eventFromPayload(eventName, p, now = Date.now()) {
  const owner = p.repository?.owner?.login;
  const isOwnerOrApp = (login) => Boolean(login) && (login === owner || login === 'claude[bot]');
  const base = { event: eventName, action: p.action, addedLabel: p.label?.name, removedLabel: p.label?.name, fromAgent: false, text: '' };
  if (eventName === 'workflow_dispatch') {
    const payload = p.inputs?.payload || '';
    let replay = null;
    let tick = false;
    let previewCheck = null;
    let prodCheck = null;
    let checksFor = null;
    try { ({ replay = null, tick = false, previewCheck = null, prodCheck = null, checksFor = null } = JSON.parse(payload) || {}); } catch {}
    // Sent by the panel when the number of parallel features goes up, so the new place is used at once.
    if (tick === true) return { ...base, kind: 'tick', number: null, labels: [], fromOwner: false };
    // Sent by the factory itself: open a preview before the recette, or the live site after a merge (see smoke.mjs).
    if (previewCheck?.pr) return { ...base, kind: 'preview-check', check: previewCheck, number: null, labels: [] };
    if (prodCheck?.pr) return { ...base, kind: 'prod-check', check: prodCheck, number: null, labels: [] };
    // A PR the factory opened itself (its token starts no workflow): its checks are asked for this way.
    if (checksFor) return { ...base, kind: 'pr', event: 'pull_request', action: 'labeled', addedLabel: L.checks, number: Number(checksFor), labels: [L.checks], fromOwner: true };
    if (replay) return { ...base, kind: 'replay', event: 'issues', action: 'unlabeled', removedLabel: L.running, number: Number(replay), labels: [] };
    return { ...base, kind: 'dispatch', payload, labels: [] };
  }
  if (eventName === 'schedule') return { ...base, kind: 'tick', number: null, labels: [], fromOwner: false };
  if (eventName === 'issues') {
    return {
      ...base, kind: 'issue', number: p.issue.number, labels: names(p.issue.labels),
      fromAgent: (p.issue.body || '').includes(AGENT_MARKER), fromOwner: isOwnerOrApp(p.sender?.login),
      // An issue form with labels sends "opened" and "labeled" together: the "labeled" one must not start it twice.
      openedRecently: now - Date.parse(p.issue.created_at || 0) < 60_000,
    };
  }
  if (eventName === 'issue_comment') {
    const body = p.comment?.body || '';
    return {
      ...base, kind: p.issue.pull_request ? 'pr' : 'issue', number: p.issue.number, labels: names(p.issue.labels),
      text: body, commentId: p.comment?.id, fromAgent: body.includes(AGENT_MARKER), fromOwner: p.comment?.user?.login === owner,
    };
  }
  if (eventName === 'pull_request_review') {
    // A bare « Approve » (no text) is an approval ; a review with only inline comments and no text says nothing.
    const body = p.review?.body || (p.review?.state === 'approved' ? 'ok' : '');
    return {
      ...base, kind: 'pr', number: p.pull_request.number, labels: names(p.pull_request.labels),
      text: body, fromAgent: body.includes(AGENT_MARKER), fromOwner: p.review?.user?.login === owner,
    };
  }
  if (eventName === 'pull_request') {
    return {
      ...base, kind: 'pr', number: p.pull_request.number, labels: names(p.pull_request.labels),
      merged: Boolean(p.pull_request.merged), headRef: p.pull_request.head?.ref, open: p.pull_request.state === 'open', fromOwner: isOwnerOrApp(p.sender?.login),
    };
  }
  return { ...base, kind: 'none', number: null, labels: [], fromOwner: false };
}


export function eventsPart(ctx) {
  const { gh, repo, config, now, log, sleep, outputs } = ctx;
  const liveLabels = (...a) => ctx.liveLabels(...a);
  const postedCaptures = (...a) => ctx.postedCaptures(...a);
  const inFlight = (...a) => ctx.inFlight(...a);
  const lockFresh = (...a) => ctx.lockFresh(...a);
  const launch = (...a) => ctx.launch(...a);
  const relaunchOnMessage = (...a) => ctx.relaunchOnMessage(...a);
  const fireOrBlock = (...a) => ctx.fireOrBlock(...a);
  const dequeue = (...a) => ctx.dequeue(...a);
  const mergeDocsPr = (...a) => ctx.mergeDocsPr(...a);
  const mergePr = (...a) => ctx.mergePr(...a);
  const releaseToProduction = (...a) => ctx.releaseToProduction(...a);
  const unstickConflicts = (...a) => ctx.unstickConflicts(...a);
  const dropCard = (...a) => ctx.dropCard(...a);
  const reopenCard = (...a) => ctx.reopenCard(...a);
  const heal = (...a) => ctx.heal(...a);
  const syncIfBehind = (...a) => ctx.syncIfBehind(...a);
  const outageBlockedPr = (...a) => ctx.outageBlockedPr(...a);
  const repairLabels = (...a) => ctx.repairLabels(...a);
  const closeMerged = (...a) => ctx.closeMerged(...a);
  const deferredMessage = (...a) => ctx.deferredMessage(...a);
  const notifyWaiting = (...a) => ctx.notifyWaiting(...a);

  // The captures table, built from the images the agent pushed on the assets branch (latest folder of the PR) and
  // posted by the factory's own bot (issue #378): on #373 the agent's tool wrote a right table, yet its dark rows
  // reached GitHub as broken links after leaving the agent's environment. Posted once per folder.
  // Never throws but on a rate limit, so that the relay run is retried (a missed post is caught up when checks end).
  async function postCaptures(n) {
    try { await postLatestCaptures(n); } catch (e) {
      if (isRateLimited(e)) throw e;
      log(`captures: ${e.message}`);
    }
  }
  async function postLatestCaptures(n) {
    if (!gh.getContent) return;
    // A missing folder reads as nothing; a rate limit goes up, so that the run is retried.
    const soft = (p) => p.catch((e) => { if (isRateLimited(e)) throw e; return null; });
    const runs = await soft(gh.getContent(`pr-${n}`, SHOTS_BRANCH));
    const latest = (Array.isArray(runs) ? runs : []).filter((e) => e.type === 'dir').map((e) => e.name).sort().pop();
    if (!latest) return;
    const dir = `pr-${n}/${latest}`;
    const mark = `<!-- factory-shots-posted: ${dir} -->`;
    const images = await soft(gh.getContent(`${dir}/compare`, SHOTS_BRANCH));
    const files = (Array.isArray(images) ? images : []).filter((e) => e.type === 'file' && e.name.endsWith('.png')).map((e) => e.name);
    if (!files.length) return;
    // Also skipped when a whole, unbroken table of this folder is already there (posted by an agent not yet given this
    // rule). A table whose dark rows arrived broken (#373) does not count: the factory posts the right one.
    const link = (f) => `![avant · après](https://github.com/${repo}/blob/${SHOTS_BRANCH}/${dir}/compare/${f}?raw=true)`;
    const whole = (c) => postedCaptures(c) && files.every((f) => c.body.includes(link(f))) && !brokenShotRows(c.body).length;
    if (((await gh.listComments(n)) || []).some((c) => (c.body || '').includes(mark) || whole(c))) return;
    const meta = await soft(gh.getContent(`${dir}/shots.json`, SHOTS_BRANCH));
    let unchanged = [];
    try { unchanged = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8')).unchanged || []; } catch { /* an older tool wrote no list: the identical screens are just not named */ }
    const table = markdownTable({ repo, dir, files, unchanged: unchanged.filter((f) => !files.includes(f)) });
    await gh.comment(n, say(`${mark}\nLes captures de l'agent (avant à gauche, après à droite), en clair puis en sombre :\n\n${table}`));
    log(`captures of #${n} posted from ${dir}`);
  }

  // True when the factory's checks job already passed on this commit (they ran while the owner looked at the captures).
  async function checksGreen(sha) {
    const runs = (await gh.checkRuns?.(sha).catch(() => null)) || [];
    const last = runs.filter((r) => /(^|\/ )checks$/.test(r.name)).sort((a, b) => Date.parse(b.started_at || 0) - Date.parse(a.started_at || 0))[0];
    return last?.status === 'completed' && last.conclusion === 'success';
  }

  // The owner said « ok » to the captures after the last ones were posted: that « ok » is also the recette.
  const visualApproved = (comments) => {
    const shots = comments.map(postedCaptures).lastIndexOf(true);
    return shots >= 0 && comments.map((c) => (c.body || '').includes(VISUAL_OK_MARKER)).lastIndexOf(true) > shots;
  };

  const lastRunningAt = async (n) => {
    const last = ((await gh.listEvents(n)) || []).filter((e) => ['labeled', 'unlabeled'].includes(e.event) && e.label?.name === L.running).pop();
    return last ? Date.parse(last.created_at) : null;
  };

  // A project has previews when something other than GitHub Pages (Vercel, Netlify…) deploys it, or when the
  // Vercel bot already comments. The factory itself, for one, has none: nothing to wait for or to test there.
  async function hasPreviews(prNumber) {
    const envs = ((await gh.recentDeployments?.().catch(() => null)) || []).map((d) => d.environment);
    if (envs.some((e) => e && e !== 'github-pages')) return true;
    return Boolean(vercelPreview((await gh.listComments(prNumber)) || []));
  }

  async function previewUrl(sha, prNumber, { attempts = 15, delayMs = 20_000 } = {}) {
    for (let i = 0; i < attempts; i++) {
      for (const d of (await gh.deployments(sha).catch(() => [])) || []) {
        const ok = ((await gh.deploymentStatuses(d.id)) || []).find((s) => s.state === 'success');
        if (ok) return ok.environment_url || ok.target_url;
      }
      // Vercel's GitHub app often reports only a commit status plus a comment it keeps up to date.
      const fromComment = vercelPreview((await gh.listComments(prNumber)) || []);
      if (fromComment) return fromComment;
      if (i < attempts - 1) await sleep(delayMs);
    }
    return null;
  }

  // The preview job's wait for the preview (outside the queue lock): the URL the report found, or the one that appears.
  async function previewWait(check) {
    if (!check?.sha) return check?.url || null;
    return check.url || previewUrl(check.sha, check.pr);
  }

  async function handle(ev, { ownerLogin } = {}) {
    if (!['dispatch', 'preview-check', 'prod-check'].includes(ev.kind)) await repairLabels().catch((e) => log(`labels: ${e.message}`));
    const result = await handleEvent(ev, { ownerLogin });
    // A PR in conflict with main gets no pull_request event at all, and GitHub's scheduled tick is too rare to
    // count on (a few runs a day): every event the relay sees looks for a PR stuck that way.
    const own = ['dispatch', 'preview-check', 'prod-check'].includes(ev.kind); // the factory's own runs: nothing else to look at
    if (!own) await unstickConflicts().catch((e) => log(`conflicts: ${e.message}`));
    // For the same reason, every event also fills the free places: a feature leaving its questions (« go »), an agent's
    // comment or a label change lets a waiting card start now instead of hours later at the next tick.
    if (!own && result?.action?.type !== 'dequeue') await dequeue().catch((e) => log(`queue check: ${e.message}`));
    // And it brings the project's agent instructions up to the stable version: waiting for the tick left yoldmewhen2
    // a day behind (2026-11-06), its agents still announcing 50 min to 2 h for 20-minute builds.
    if (!own) await syncIfBehind().catch((e) => log(`sync check: ${e.message}`));
    await notifyWaiting();
    return result;
  }

  async function handleEvent(ev, { ownerLogin } = {}) {
    if (ev.kind === 'dispatch') {
      outputs.agent = 'true';
      outputs.payload = ev.payload;
      return { action: { type: 'agent' }, outputs };
    }
    if (ev.kind === 'preview-check' || ev.kind === 'prod-check') {
      const which = ev.kind === 'preview-check' ? 'preview' : 'production';
      outputs[which] = toJobOutput(JSON.stringify(ev.check));
      outputs[`${which}Sha`] = String(ev.check?.sha || '');
      // Issue #370: a « Mise en production » always reaches the production job, so it is closed even when no
      // deployment is ever observed (the button would otherwise stay greyed forever).
      if (ev.kind === 'prod-check' && ev.check?.release?.issue) outputs.releaseIssue = String(ev.check.release.issue);
      return { action: { type: ev.kind }, outputs };
    }
    const ctx = { inFlight: 0, lockFresh: false };
    // The panel's « Ok » for a PR, written on its issue because the panel's token cannot comment on PRs: handled as
    // if written on the PR. Only the owner's, and only for the PR that really delivers this issue.
    const fwd = ev.event === 'issue_comment' && ev.kind === 'issue' && ev.fromOwner && !ev.fromAgent ? forwardedAnswer(ev.text) : null;
    if (fwd) {
      const pr = await gh.getPr(fwd.pr);
      if (pr && prIssue(pr) === ev.number) {
        log(`panel answer on #${ev.number} applied to PR #${fwd.pr}`);
        ev = { ...ev, kind: 'pr', number: fwd.pr, text: fwd.text, commentId: undefined };
      } else return { action: { type: 'ignore', reason: `réponse pour une PR #${fwd.pr} qui ne livre pas #${ev.number}` }, outputs };
    }
    if (ev.kind === 'replay') {
      const issue = await gh.getIssue(ev.number);
      ev = { ...ev, kind: issue?.pull_request ? 'pr' : 'issue' };
    }
    if (ev.kind !== 'none' && ev.number) {
      const live = await gh.getIssue(ev.number);
      ev = { ...ev, labels: names(live?.labels), closed: live?.state === 'closed', ...(live && ev.kind === 'pr' ? { open: live.state === 'open' } : {}) }; // webhook labels can be stale
      ctx.lockFresh = await lockFresh(ev.number, ev.labels);
      ctx.inFlight = await inFlight(null, ev.kind === 'issue' ? ev.number : null);
    }
    // Captures to validate: the factory posts their table itself (issue #378), whatever PR event comes first.
    if (ev.kind === 'pr' && ev.event === 'pull_request' && ev.fromOwner && ev.open !== false && ev.labels.includes(L.visualReview)) {
      await postCaptures(ev.number);
    }
    // The board's « Mise en production » (issue #294): an issue the owner opens with L.production.
    if (ev.kind === 'issue' && ev.event === 'issues' && ev.action === 'opened' && ev.labels.includes(L.production)) {
      if (ev.closed) return { action: { type: 'ignore', reason: 'demande de mise en production déjà traitée' }, outputs };
      if (!ev.fromOwner) return { action: { type: 'ignore', reason: 'mise en production demandée par un autre que le propriétaire' }, outputs };
      await releaseToProduction(ev.number);
      return { action: { type: 'release' }, outputs };
    }
    const isComment = ev.event === 'issue_comment' || ev.event === 'pull_request_review';
    if (isComment && !ctx.lockFresh && ev.labels.includes(L.pending) && ev.fromOwner && !ev.fromAgent) {
      // The lock expired without a release: handle the deferred messages together with this one.
      const text = await deferredMessage(ev.number, ownerLogin, ev.kind === 'pr');
      await gh.removeLabel(ev.number, L.pending);
      ev = { ...ev, text: text || ev.text, labels: ev.labels.filter((l) => l !== L.pending) };
    }
    let action = decide(ev, config, ctx);
    log(`decision: ${action.type}${action.stage ? ` ${action.stage}` : ''} (${action.reason || ''})`);
    const n = ev.number;
    let said = ev.text;
    // A PR that was not waiting for the owner (checks, fix) goes with the resumed run: at its end, the PR is at no step
    // and its checks start again.
    let reopenedPr = null;
    if (action.type === 'reopen') {
      ({ stepless: reopenedPr } = await reopenCard(n));
      ev = { ...ev, closed: false, labels: await liveLabels(n) };
      action = decide(ev, config, { ...ctx, inFlight: await inFlight() });
      log(`after reopening: ${action.type}${action.stage ? ` ${action.stage}` : ''}`);
    }
    if (action.type === 'replay') {
      await gh.removeLabel(n, L.pending);
      // The agent wanted to close by itself, but the owner wrote meanwhile: his message wins, the card stays open.
      if (closeReason(await liveLabels(n))) for (const l of [L.close, ...CLOSE_REASONS]) await gh.removeLabel(n, l);
      const text = await deferredMessage(n, ownerLogin, ev.kind === 'pr');
      if (!text) return { action, outputs };
      const replayed = { ...ev, event: 'issue_comment', action: 'created', text, fromOwner: true, fromAgent: false, labels: await liveLabels(n) };
      action = decide(replayed, config, { ...ctx, lockFresh: false, inFlight: await inFlight() });
      said = text;
      log(`replayed decision: ${action.type}${action.stage ? ` ${action.stage}` : ''}`);
    }
    if (await relaunchOnMessage(ev, action, said)) return { action: { type: 'relaunch', reason: 'lancement en attente : relancé tout de suite' }, outputs };
    // A card blocked by a long outage: « réessaie » relaunches the checks, there is nothing for the agent to do.
    // Also when the factory is full (the checks need no place) and when he writes it on the PR itself.
    // The PR itself has no factory label left once blocked: the owner's message there is otherwise ignored.
    // Only a short message there (« réessaie », « relance stp »): a change request must not be dropped.
    const ownerOnPr = ev.kind === 'pr' && String(said || '').trim().split(/\s+/).length <= 3 && ev.fromOwner && !ev.fromAgent && !ctx.lockFresh && ['fire', 'ignore'].includes(action.type);
    const resuming = ownerOnPr || (action.type === 'fire' && action.stage === 'resume') || (action.type === 'queue' && action.add?.includes(L.resumeQueued));
    if (resuming && isRetry(said)) {
      const blockedPr = await outageBlockedPr(ev);
      if (blockedPr) action = { type: 'outage-retry', pr: blockedPr, reason: 'panne passée : on relance les contrôles' };
    }
    // A finished card (merged, closed) never starts over: a message written during its last run, or afterwards,
    // would otherwise send a closed issue back to grilling.
    if (action.type === 'fire' && ev.kind === 'issue' && ev.closed && action.stage !== 'question') {
      log('closed issue: nothing is started');
      await gh.comment(n, say("Cette demande est déjà terminée et en ligne, donc je ne relance rien ici. Si votre message demande un changement, ouvrez une nouvelle demande depuis le tableau : elle partira de la version actuelle."));
      return { action: { type: 'ignore', reason: 'issue fermée' }, outputs };
    }
    // A PR closed by hand (GitHub's button keeps its labels): a later « ok » or remark must not merge it or start
    // an agent on it. Only « fermer » (drop) still tidies up.
    if (ev.kind === 'pr' && ev.closed && ev.event !== 'pull_request' && !['ignore', 'drop'].includes(action.type)) {
      log('closed PR: nothing is started');
      if (ev.fromOwner && ev.text) await gh.comment(n, say("Cette PR est fermée, donc je ne relance rien ici. Si votre message demande un changement, ouvrez une nouvelle demande depuis le tableau."));
      return { action: { type: 'ignore', reason: 'PR fermée' }, outputs };
    }
    const applyLabels = async () => {
      for (const l of action.remove || []) await gh.removeLabel(n, l);
      if (action.add?.length) await gh.addLabels(n, action.add);
    };
    switch (action.type) {
      case 'fire': {
        const pr = ev.kind === 'pr' ? await gh.getPr(n) : null;
        const issue = pr ? prIssue(pr) : n;
        // The labels move only once the agent really started (now, or at its relaunch).
        // A blocked PR is often blocked on its issue too: the owner's answer unblocks both.
        await launch({ stage: action.stage, issue, pr: pr ? n : reopenedPr, owner: true, then: { labels: [
          { n, add: action.add || [], remove: action.remove || [] },
          ...(pr && issue && action.remove?.includes(L.blocked) ? [{ n: issue, remove: [L.blocked] }] : []),
        ] } });
        break;
      }
      case 'defer':
        await applyLabels();
        if (ev.commentId) await gh.react(ev.commentId, 'eyes').catch(() => {});
        break;
      case 'queue':
        await applyLabels();
        await gh.comment(n, say(`C'est noté. ${config.maxParallel} feature(s) sont déjà en construction, c'est le maximum réglé pour ce projet : celle-ci est en file d'attente et démarrera toute seule dès qu'une place se libère.`));
        break;
      case 'checks':
        await applyLabels();
        if (!config.stages.checks) {
          await report({ result: 'success', pr: n });
        } else {
          outputs.checks = 'true';
          outputs.pr = String(n);
        }
        break;
      case 'visual-ok': {
        await applyLabels();
        const pr = await gh.getPr(n);
        const labels = await liveLabels(n);
        const running = labels.includes(L.checks) || labels.includes(L.fixing);
        const green = !running && config.stages.checks && Boolean(pr?.head?.sha) && (await checksGreen(pr.head.sha));
        await gh.comment(n, `${VISUAL_OK_MARKER}\n${say(green || !config.stages.checks
          ? 'Captures validées ✅.'
          : 'Captures validées ✅. Je mets en ligne dès que les contrôles automatiques sont verts, sans vous redemander.')}`);
        if (green) {
          await report({ result: 'success', pr: n, sha: pr.head.sha });
        } else if (!running) {
          await gh.addLabels(n, [L.checks]);
          if (!config.stages.checks) await report({ result: 'success', pr: n });
          else { outputs.checks = 'true'; outputs.pr = String(n); }
        }
        break;
      }
      case 'merge':
        await mergePr(n);
        break;
      case 'drop':
        await dropCard(n, ownerLogin);
        break;
      case 'docs-merge':
        await mergeDocsPr(n);
        break;
      case 'outage-retry': {
        const pr = await gh.getPr(action.pr);
        if (!pr) { log(`outage retry: PR #${action.pr} no longer exists`); break; }
        const issue = linkedIssue(pr.body) || branchIssue(pr);
        for (const k of new Set([n, action.pr, issue].filter(Boolean))) await gh.removeLabel(k, L.blocked);
        await gh.updateIssue(action.pr, { body: writeOutage(pr.body, null) }); // a fresh schedule if it fails again
        await gh.addLabels(action.pr, [L.checks]);
        await gh.comment(n, say("C'est noté : je relance les contrôles automatiques."));
        outputs.checks = 'true';
        outputs.pr = String(action.pr);
        break;
      }
      case 'dequeue': {
        if (ev.kind === 'tick') await heal(ownerLogin).catch((e) => log(`guard: ${e.message}`));
        // A PR merged by hand (not by the factory): its issue kept factory:building and held a place until the next
        // tick, hours later (yoldmewhen2 #56, 2026-11-06). Tidy it now, before the places are counted.
        let freed = ev.kind === 'issue' ? n : null;
        if (ev.kind === 'pr' && ev.event === 'pull_request' && ev.action === 'closed') {
          const pr = await gh.getPr(n);
          if (pr?.merged_at) {
            for (const l of [L.acceptance, L.checks, L.fixing, L.visualReview, L.running, L.blocked]) if (ev.labels.includes(l)) await gh.removeLabel(n, l);
            await closeMerged([pr]).catch((e) => log(`close after merge: ${e.message}`));
            freed = prIssue(pr);
          }
        }
        await dequeue({ freed });
        break;
      }
      default:
        break;
    }
    // A PR just opened: its card gives up its place, so the next queued card starts now rather than at the tick.
    if (ev.kind === 'pr' && ev.event === 'pull_request' && ev.action === 'opened' && action.type !== 'dequeue') {
      const built = prIssue(await gh.getPr(n));
      if (built) await dequeue({ freed: built }).catch((e) => log(`dequeue after PR: ${e.message}`));
    }
    return { action, outputs };
  }

  // Posts (or refreshes) the PR's « Fabrication » comment from the journal the hook wrote on the branch.
  async function fabrication(prNumber, pr) {
    // Only the journal files this PR adds or changes: older runs already merged into main are not this PR's.
    const changed = ((await gh.listPrFiles(prNumber)) || []).filter((f) => f.status !== 'removed');
    const files = changed.map((f) => f.filename);
    const texts = [];
    for (const path of files.filter((f) => /^\.factory\/journal\/[^/]+\.jsonl$/.test(f))) {
      const file = await gh.getContent(path, pr.head.sha);
      if (file?.content) texts.push(Buffer.from(file.content, 'base64').toString('utf8'));
    }
    const { body, alerts, missing } = summarize(parseJournal(texts), { stages: config.stages, ui: uiChanged(changed), small: smallChange(changed) });
    const mine = ((await gh.listComments(prNumber)) || []).find((c) => (c.body || '').includes(FABRICATION_MARKER));
    const text = say(body);
    if (mine) await gh.updateComment(mine.id, text); else await gh.comment(prNumber, text);
    if (alerts.length) await gh.addLabels(prNumber, [L.skillsAlert]); else await gh.removeLabel(prNumber, L.skillsAlert);
    return Object.assign(alerts, { missing, ui: uiChanged(changed) });
  }

  // `preview`: the result of the preview check ({ result: passed|failed|skipped, url }) when this report follows it.
  // `transient`: the checks failed on a passing outage (network, GitHub), not on the code (issue #213); 'server' when the
  // project's own machine was away (a check that only runs there).
  async function report({ result, pr: prNumber, runId, sha, started = null, now: nowMs = now(), preview = null, transient = false }) {
    let pr = await gh.getPr(prNumber);
    if (!pr) return log(`report: PR #${prNumber} no longer exists`);
    if (sha && pr.head.sha !== sha) return log('stale report: the PR changed since these checks ran');
    // Same commit but cancelled: the checks hit their time limit (a hung test). Treat it as red, with its reason.
    if (result === 'cancelled' && !sha) return log('checks cancelled before they started: nothing to report');
    // A newer checks run on the same commit cancels the older one (two events asked for checks). Only a run that
    // reached the time limit is a hung test; a cancelled run that stopped early leaves the report to the newer run.
    // A run cancelled without a known start time never got going: it was replaced too.
    if (result === 'cancelled' && !(started && nowMs - started * 1000 >= CHECKS_TIMEOUT_MS)) {
      return log('checks replaced by a newer run on the same commit: it reports instead');
    }
    // An agent was sent on the PR after these checks started (a branch update after a conflict, a fix): new code is
    // coming and its own checks will decide. Merging now raced the update and blocked the card (pulsarwheel #382).
    // The agent hands the PR back with factory:checks when it is done: from then on a report counts again.
    const live = await liveLabels(prNumber);
    if (live.includes(L.fixing) && !live.includes(L.checks)) return log('stale report: an agent is changing the PR, its own checks will report');
    const timedOut = result === 'cancelled';
    if (timedOut) result = 'failure';
    if (result === 'failure' && transient && !timedOut) return onOutage(pr, nowMs, transient);
    // Any other result ends the outage: a later one starts a new schedule.
    if (readOutage(pr.body)) {
      pr = { ...pr, body: writeOutage(pr.body, null) };
      await gh.updateIssue(prNumber, { body: pr.body });
    }
    let missing = [];
    let ui = false;
    try { ({ missing, ui } = await fabrication(prNumber, pr)); } catch (e) { log(`fabrication: ${e.message}`); }
    const issueNumber = prIssue(pr);
    // The factory's own undo of a broken delivery: no agent built it, there is no step to catch up.
    const reverting = String(pr.body || '').includes(REVERT_MARKER);
    // A skipped review or design pass is caught up once, by a dedicated run, before the owner is asked anything.
    const catchUp = reverting ? [] : (missing || []).filter((s) => CATCH_UP.includes(s));
    // A visible change must have been shown to the owner: no captures table on the PR means the step was skipped.
    if (result === 'success' && ui && config.stages.screenshots !== false && !reverting) {
      // Captures pushed but whose table was never posted (a missed event): posted now rather than redone.
      if (live.includes(L.visualReview)) await postCaptures(prNumber);
      const shown = ((await gh.listComments(prNumber)) || []).some(postedCaptures);
      if (!shown) catchUp.push('screenshots');
    }
    if (result === 'success' && catchUp.length) {
      const done = ((await gh.listComments(prNumber)) || []).some((c) => (c.body || '').includes(SKILLS_FIX_MARKER));
      if (!done) {
        const steps = catchUp.map((s) => STEP_NAMES[s]).join(' et ');
        await fireOrBlock({ stage: 'skills-fix', issue: issueNumber, pr: prNumber, extra: { missing: catchUp }, why: "L'agent a sauté une étape", then: {
          labels: [{ n: prNumber, remove: [L.checks], add: [L.fixing] }],
          comments: [{ n: prNumber, body: `${SKILLS_FIX_MARKER}\n${say(`L'agent a sauté ${steps}. Il ${catchUp.length > 1 ? 'les' : 'la'} rattrape maintenant, puis les contrôles repartent : rien à faire de votre côté pour l'instant. Si ça change l'apparence, je vous remontrerai les captures.`)}` }],
        } });
        return;
      }
    }
    const issue = issueNumber ? await gh.getIssue(issueNumber) : null;
    // A bug fix, or the factory undoing a broken delivery, goes live without a recette.
    const isBug = names(issue?.labels).includes(L.bug) || reverting;
    const comments = (await gh.listComments(prNumber)) || [];
    const lastReset = comments.map((c) => (c.body || '').includes(CHECKS_RESET_MARKER)).lastIndexOf(true);
    const failures = comments.slice(lastReset + 1).filter((c) => (c.body || '').includes(CHECKS_FAILED_MARKER)).length;
    const next = afterChecks({ result, isBug, acceptanceOn: config.stages.acceptance, failures, maxLoops: config.review.maxLoops });
    log(`checks ${result} -> ${next}`);
    if (next === 'merge') return mergePr(prNumber, pr.head.sha);
    const inVisual = next === 'acceptance' && (await liveLabels(prNumber)).includes(L.visualReview);
    // Nothing the owner can see or try (the agent said so, and no screen changed): no recette, no alert (owner's rule).
    if (next === 'acceptance' && !inVisual && !ui && String(pr.body || '').includes(NOTHING_TO_TEST_MARKER)) {
      await gh.comment(prNumber, say("Les contrôles automatiques sont tous verts ✅\n\nRien ne change à l'écran ni dans l'usage de l'appli, il n'y a donc rien à tester : je mets en ligne directement."));
      return mergePr(prNumber, pr.head.sha);
    }
    // Before the owner is given a preview, the factory opens it and replays the user journeys on it, in a separate
    // run (a browser and the project's tests are needed): a broken or empty preview goes back to the agent instead.
    // The preview can take minutes to appear: it is looked for once here, then waited for by the preview job, outside
    // the queue lock, so that no decision waits behind it (issue #212). Its report comes back with what it found.
    const previews = next === 'acceptance' && (preview ? true : await hasPreviews(prNumber));
    if (previews && !preview) {
      const url = await previewUrl(pr.head.sha, prNumber, { attempts: 1 });
      const ref = (await gh.getRepo())?.default_branch || 'main';
      await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ previewCheck: { pr: prNumber, sha: pr.head.sha, ...(url ? { url } : {}) } }) });
      log(url ? `preview check started on ${url}` : 'preview check started: it waits for the preview');
      return;
    }
    if (preview?.result === 'failed') {
      if (failures >= config.review.maxLoops) return blockOnRed(prNumber, issueNumber);
      const link = preview.runId ? ` ([détail](https://github.com/${repo}/actions/runs/${preview.runId}))` : '';
      await fireOrBlock({ stage: 'fix-checks', issue: issueNumber, pr: prNumber, extra: { preview: preview.url, previewProblem: preview.detail || null, checksRun: preview.runId || null }, why: 'La preview ne marche pas', then: {
        labels: [{ n: prNumber, remove: [L.checks], add: [L.fixing] }],
        comments: [{ n: prNumber, body: `${CHECKS_FAILED_MARKER}\n${say(`Avant de vous la donner, j'ai ouvert la preview : ${preview.detail || 'quelque chose ne marche pas'}${link}. L'agent corrige (tentative ${failures + 1} sur ${config.review.maxLoops}), rien à faire de votre côté.`)}` }],
      } });
      return;
    }
    const knownUrl = preview?.url || null;
    if (inVisual) {
      // The checks ran while the owner looks at the captures: give him the preview, his « ok » will put it live.
      const url = knownUrl;
      for (const l of [L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
      const where = url ? `\n\nVous pouvez aussi tester la nouvelle version ici : ${url}` : '';
      await gh.comment(prNumber, say(`Les contrôles automatiques sont tous verts ✅${where}\n\nRépondez « ok » pour mettre en ligne directement, ou dites-moi ce qu'il faut retoucher.`));
      return;
    }
    if (next === 'acceptance' && visualApproved(comments)) {
      await gh.comment(prNumber, say('Les contrôles automatiques sont tous verts ✅ et vous avez validé les captures : je mets en ligne.'));
      return mergePr(prNumber, pr.head.sha);
    }
    if (next === 'acceptance') {
      // No preview, nothing to try: the spec and any captures were already validated, so it goes live (owner's rule).
      if (!previews) {
        await gh.comment(prNumber, say("Les contrôles automatiques sont tous verts ✅\n\nCe projet n'a pas de preview à tester et vous avez déjà validé la spec (et les captures s'il y en avait) : je mets en ligne directement."));
        return mergePr(prNumber, pr.head.sha);
      }
      // The card moves to « Testez la preview » only with the message.
      const url = knownUrl;
      for (const l of [L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
      await gh.addLabels(prNumber, [L.acceptance]);
      const where = url
        ? `Vous pouvez tester la nouvelle version ici : ${url}`
        : "Je n'ai pas trouvé de preview pour cette PR. Vérifiez que l'hébergeur est bien branché sur le dépôt ; l'aperçu peut aussi arriver un peu plus tard. Si besoin, dites-le-moi et je vous redonne les liens à cliquer.";
      await gh.comment(prNumber, say(`Les contrôles automatiques sont tous verts ✅\n\n${where}\n\nVérifiez les critères d'acceptation de la spec. Répondez « ok » pour mettre en ligne, ou décrivez ce qui ne va pas.`));
      return;
    }
    if (next === 'fix') {
      const link = runId ? ` ([détail](https://github.com/${repo}/actions/runs/${runId}))` : '';
      const what = timedOut ? `Les contrôles automatiques ont dépassé la durée maximale réglée dans Paramètres (${config.checksMinutes || 30} min), je les ai arrêtés : aucun contrôle n'a échoué, mais un test bloqué peut en être la cause` : 'Un contrôle automatique a échoué';
      await fireOrBlock({ stage: 'fix-checks', issue: issueNumber, pr: prNumber, extra: { checksRun: runId || null }, why: 'Un contrôle automatique a échoué', then: {
        labels: [{ n: prNumber, remove: [L.checks], add: [L.fixing] }],
        comments: [{ n: prNumber, body: `${CHECKS_FAILED_MARKER}\n${say(`${what}${link}. L'agent corrige (tentative ${failures + 1} sur ${config.review.maxLoops}), rien à faire de votre côté.`)}` }],
      } });
      return;
    }
    return blockOnRed(prNumber, issueNumber, timedOut);
  }

  // Checks that failed on an outage: silent retries, then one sentence on the PR, then blocked after 3 hours. The agent
  // is never sent and no fix attempt is counted (no CHECKS_FAILED_MARKER). The first retry, about 2 minutes later, is
  // started by the report job itself once the lock is released (outputs.retryInMs); the next ones by the tick.
  async function onOutage(pr, nowMs, cause) {
    const step = outageStep(readOutage(pr.body), { sha: pr.head.sha, now: nowMs });
    let st = step.state;
    const server = cause === 'server' || (cause === true && st.server);
    if (server) st = { ...st, server: true };
    if (step.retryInMs) {
      st = { ...st, tries: st.tries + 1, next: nowMs + step.retryInMs + OUTAGE_LOST_MS };
      outputs.retryInMs = step.retryInMs;
    }
    await gh.updateIssue(pr.number, { body: writeOutage(pr.body, st) });
    log(`checks failed on an outage -> ${step.action} (retries so far: ${st.tries})`);
    if (step.action === 'block') {
      const issueNumber = linkedIssue(pr.body) || branchIssue(pr);
      for (const l of [L.checks, L.fixing]) await gh.removeLabel(pr.number, l);
      await gh.addLabels(issueNumber || pr.number, [L.blocked]);
      const why = server ? 'parce que votre serveur de développement est déconnecté' : "à cause d'une panne de GitHub ou du réseau";
      await gh.comment(issueNumber || pr.number, say(`Les contrôles automatiques de la PR #${pr.number} ne passent pas depuis 3 heures ${why}. Ça ne ressemble pas à un problème de code, donc je n'ai pas envoyé l'agent corriger.\n\nRépondez « réessaie » ici quand vous voulez que je relance les contrôles.`));
    } else if (step.tell) {
      await gh.comment(pr.number, say(server ? SERVER_TOLD : OUTAGE_TOLD));
    }
  }

  // Still red after the last try: pause. The next failure count starts again from zero once the owner unblocks it.
  // `timedOut`: the last run was stopped by the time limit (checksMinutes), not by a failing check: said as such.
  async function blockOnRed(prNumber, issueNumber, timedOut = false) {
    for (const l of [L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
    if (issueNumber) await gh.addLabels(issueNumber, [L.blocked]);
    const minutes = config.checksMinutes || 30;
    await gh.comment(prNumber, `${CHECKS_RESET_MARKER}\n${say(timedOut
      ? `Les contrôles dépassent encore la durée maximale réglée (${minutes} min) : j'ai mis la construction en pause et expliqué la situation sur l'issue.`
      : "Les contrôles restent rouges : j'ai mis la construction en pause et expliqué la situation sur l'issue.")}`);
    await gh.comment(issueNumber || prNumber, say(timedOut
      ? `Les contrôles automatiques de la PR #${prNumber} dépassent encore la durée maximale réglée dans Paramètres (${minutes} min) après ${config.review.maxLoops} tentatives de correction. Aucun contrôle n'a échoué : ils ont été arrêtés avant la fin. Je m'arrête pour ne pas tourner en rond.\n\nS'ils sont seulement lents, augmentez « Durée maximale des contrôles » dans Paramètres, puis répondez ici « réessaie ».`
      : `Les contrôles automatiques échouent encore après ${config.review.maxLoops} tentatives de correction, donc je m'arrête pour ne pas tourner en rond.\n\nLe détail technique est dans la PR #${prNumber}. Vous pouvez répondre ici par « réessaie » pour relancer une tentative, ou me dire de simplifier la feature.`));
  }

  // End of an agent run on GitHub Actions. Releases the lock if the agent did not, and asks for a replay of
  // deferred messages in a fresh workflow run (which has the checks and report jobs a replay may need).
  async function release(payload) {
    for (const n of [payload.issue, payload.pr].filter(Boolean)) {
      const labels = await liveLabels(n);
      if (!labels.includes(L.running)) continue; // the agent released it itself: its unlabeled event replays
      await gh.removeLabel(n, L.running);
      if (labels.includes(L.pending)) {
        const ref = (await gh.getRepo())?.default_branch || 'main';
        await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ replay: n }) });
      }
    }
  }

  // The first retry after an outage, about 2 minutes later: run by the report job once the lock is released, so that
  // the other decisions go on meanwhile. Never throws: GitHub may still be down, and the tick starts it again later.
  async function retrySoon(prNumber) {
    const ms = outputs.retryInMs;
    if (!ms) return;
    delete outputs.retryInMs;
    try {
      await sleep(ms);
      const ref = (await gh.getRepo())?.default_branch || 'main';
      await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ checksFor: prNumber }) });
      log(`checks of #${prNumber} retried after an outage`);
    } catch (e) { log(`retry after an outage not started (${String(e.message || e).slice(0, 80)}): the tick will`); }
  }

  // The first relaunch, 2 minutes after a first failure: run by its own job once the decision is over (relay.yml), so
  // that nothing waits behind it. Never throws: the tick starts it later anyway.
  async function relaunchSoon(ms = outputs.relaunchInMs) {
    if (!ms) return;
    try {
      await sleep(Number(ms));
      const ref = (await gh.getRepo())?.default_branch || 'main';
      await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ tick: true }) });
      log('relaunch of the waiting launches asked for');
    } catch (e) { log(`relaunch not asked for (${String(e.message || e).slice(0, 80)}): the tick will`); }
  }

  // Issue #384: the factory's own steps (a report that merges or blocks a card, a live check) write with the workflow's token, which raises no event: nothing else would fill the place they
  // free before the rare scheduled tick. Each fills it before returning, unless the step already did.
  const refilling = (step) => async (...args) => {
    const before = ctx.dequeues;
    const result = await step(...args);
    // Never throws, rate limit included, on purpose: the step itself is done, and re-running it would be worse.
    // The place is then filled by the next event or tick, as before #384.
    if (ctx.dequeues === before) await dequeue().catch((e) => log(`queue check: ${e.message}`));
    return result;
  };

  // The queue check after a step that ran outside the lock (release): never throws, like the one in refilling.
  const refill = () => dequeue().catch((e) => log(`queue check: ${e.message}`));


  return { postCaptures, postLatestCaptures, checksGreen, visualApproved, lastRunningAt, hasPreviews, previewUrl, previewWait, handle, handleEvent, fabrication, report, onOutage, blockOnRed, release, retrySoon, relaunchSoon, refilling, refill };
}
