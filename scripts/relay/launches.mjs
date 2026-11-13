// Part of the relay engine (scripts/relay.mjs): launching the agent, relaunching it after a failure, the queue and picking the next card when a place is free.
// Its functions reach the other parts through the shared context `ctx` built by createRelay.
import { L, CLOSE_REASONS, AGENT_MARKER, SESSION_MARKER, isIdea, buildStage } from '../lib/labels.mjs';
import { runTitle, stageName } from '../lib/run-title.mjs';
import { github } from '../lib/github.mjs';
import { isRateLimited } from '../lib/ratelimit.mjs';
import { mirrorAttachments } from '../lib/attachments.mjs';
import { isRetry, isNetworkFailure } from '../lib/outage.mjs';
import { readRelaunch, writeRelaunch, relaunchStep, isTransientStatus, RELAUNCH_TOLD, RELAUNCH_BLOCKED, QUESTION_RETRY_MS, QUESTION_BUSY } from '../lib/relaunch.mjs';
import { waitedFor, mergedWaits, mergedMarker, requestState, WAITS_DONE_MARKER, RESUMED_MARKER } from '../lib/waits.mjs';
import { PROJECT_WORKFLOW, prIssue, say, names, linkedIssue } from './shared.mjs';

export function launchesPart(ctx) {
  const { gh, repo, config, env, fetchImpl, now, log, sleep, outputs, woken, commentCache } = ctx;
  const liveLabels = (...a) => ctx.liveLabels(...a);
  const cardComments = (...a) => ctx.cardComments(...a);
  const inFlight = (...a) => ctx.inFlight(...a);

  // Starts an agent run. Labels the targets `factory:running` first (re-added, so the lock's start time is
  // fresh); on failure, removes it, explains (unless quiet), and throws.
  async function fireAgent({ stage, issue, pr, extra = {}, quiet = false }) {
    const targets = [issue, pr].filter(Boolean);
    for (const n of targets) {
      await gh.removeLabel(n, L.running);
      await gh.addLabels(n, [L.running]);
    }
    let attachments = [];
    try {
      attachments = await mirrorAttachments({ gh, fetchImpl, numbers: [issue, pr], owner: repo.split('/')[0], isPr: (n) => n === pr, log });
    } catch (e) { log(`attachments: ${e.message}`); }
    const payload = { repo, issue, pr: pr || null, stage, factory: 'phoibe/factory', ...(attachments.length ? { attachments } : {}), ...extra };
    log(`fire ${stage} ${JSON.stringify(payload)}`);
    const fail = async (message, error) => {
      for (const n of targets) await gh.removeLabel(n, L.running);
      if (!quiet) await gh.comment(targets[targets.length - 1], say(message));
      throw new Error(error);
    };
    // A failure that passes by itself (issue #383): nothing is said here, the caller saves the launch to retry it.
    const passing = async (error) => {
      for (const n of targets) await gh.removeLabel(n, L.running);
      throw Object.assign(new Error(error), { transient: true });
    };
    // Without its instructions the agent stops at once and says nothing on the card (Pulsar Novae #173: every sync
    // had failed). Only a file known to be absent stops the run; a GitHub hiccup lets it go.
    if (gh.getContent && !(await gh.getContent('.factory/AGENT.md').catch(() => true))) {
      try { await gh.dispatch('factory-sync.yml', (await gh.getRepo())?.default_branch || 'main', {}); }
      catch (e) { log(`sync not started (${String(e.message || e).slice(0, 80)})`); }
      await fail("Je n'ai pas lancé l'agent : la factory n'est pas encore installée dans ce projet (sa mise à jour, « Factory sync » dans l'onglet Actions, n'a pas abouti). "
        + 'Je la relance. Écrivez « réessaie » ici dans quelques minutes.', 'factory not installed');
    }
    if (config.runner === 'github-actions') {
      try {
        const ref = (await gh.getRepo())?.default_branch || 'main';
        await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify(payload) });
      } catch (e) {
        if (isRateLimited(e)) {
          for (const n of targets) await gh.removeLabel(n, L.running);
          throw e;
        }
        // No HTTP answer at all (fetch failed, reset) or a server error: passing. A 4xx (workflow disabled, no right), or any
        // other error, is a setting the owner is told about.
        if (isNetworkFailure(String(e)) || /-> 5\d\d\b/.test(String(e.message || e)) || /fetch failed/i.test(String(e.message || e))) await passing(`dispatch failed: ${e}`);
        await fail("Je n'ai pas pu lancer l'agent sur GitHub Actions. Réécrivez votre message dans quelques minutes ; si ça se répète, vérifiez que le workflow « Factory » est activé (onglet Actions).", String(e));
      }
      return;
    }
    if (!env.FACTORY_ROUTINE_URL || !env.FACTORY_ROUTINE_TOKEN) {
      await fail("Je n'ai pas pu lancer l'agent : je ne trouve pas les secrets de la routine Claude **dans ce dépôt**.\n\n"
        + `Ouvrez https://github.com/${repo}/settings/secrets/actions (la page des secrets de ce dépôt-ci, pas de factory-template) `
        + 'et créez, dans **Repository secrets**, `FACTORY_ROUTINE_URL` et `FACTORY_ROUTINE_TOKEN` (étape 5 du README). Puis écrivez « réessaie » ici.', 'routine secrets missing');
    }
    let res;
    try {
      res = await fetchImpl(env.FACTORY_ROUTINE_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.FACTORY_ROUTINE_TOKEN}`,
          'anthropic-beta': 'experimental-cc-routine-2026-04-01',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        // The first line names the run, so the owner tells the sessions apart in the routine's list.
        body: JSON.stringify({ text: `${runTitle(payload)}\n\n${JSON.stringify(payload)}` }),
      });
    } catch (e) { await passing(`routine unreachable: ${e}`); }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Saturated service, daily limit, server error: retried by the factory alone.
      if (isTransientStatus(res.status)) await passing(`routine fire failed: ${res.status} ${detail}`);
      await fail(`Je n'ai pas pu lancer l'agent : la routine Claude refuse le lancement (réponse ${res.status}). C'est un problème de réglage, qui ne passera pas tout seul. `
        + `Vérifiez les secrets \`FACTORY_ROUTINE_URL\` et \`FACTORY_ROUTINE_TOKEN\` sur https://github.com/${repo}/settings/secrets/actions (étape 5 du README), puis écrivez « réessaie » ici. Vous pouvez aussi passer ce projet sur le moteur « GitHub Actions » dans le panneau.`,
      `routine fire failed: ${res.status} ${detail}`);
    }
    const body = await res.json().catch(() => ({}));
    log(`session: ${body.claude_code_session_url || '?'}`);
    if (body.claude_code_session_url && stage !== 'question') {
      await noteSession(pr || issue, stage, body.claude_code_session_url).catch((e) => log(`session note: ${e.message}`));
    }
  }

  // One comment per card, kept up to date, with a link to the agent's latest session (the board shows it too).
  async function noteSession(n, stage, url) {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
    const text = `${SESSION_MARKER}\n${AGENT_MARKER}\nDernier lancement de l'agent : **${stageName(stage)}**, à ${time}. [Voir ce qu'il fait](${url})`;
    const mine = ((await gh.listComments(n)) || []).find((c) => (c.body || '').includes(SESSION_MARKER));
    if (mine) await gh.updateComment(mine.id, text); else await gh.comment(n, text);
  }

  // Issue #383. Starts the agent, then does `then`: what the caller does once the agent really started (labels to move,
  // messages to post). A failure that passes by itself (saturated service, network) saves the whole launch on the card
  // and returns false: the guard starts it again later (retryLaunches), quietly. Any other failure throws, as before.
  // The question chat gets one quick retry, then a clear message: the owner waits for an answer there.
  // `owner`: started by the owner's message; such a launch, once saved, is never replaced nor cleared by an automatic one.
  async function launch({ stage, issue, pr = null, extra = {}, then = {}, quiet = false, owner = false }) {
    try {
      await fireAgent({ stage, issue, pr, extra, quiet });
    } catch (e) {
      if (!e.transient) throw e;
      log(`launch failed for a passing reason: ${e.message}`);
      if (stage === 'question') {
        await sleep(QUESTION_RETRY_MS);
        try { await fireAgent({ stage, issue, pr, extra, quiet }); } catch (again) {
          if (!again.transient) throw again;
          await gh.comment(issue || pr, say(QUESTION_BUSY));
          return false;
        }
      } else {
        await waitRelaunch({ stage, issue, pr, extra, then, ...(owner ? { owner: true } : {}) });
        return false;
      }
    }
    // Cleared before anything else can fail, so that a started launch is never started twice. The same launch saved
    // earlier is now done; an automatic one is superseded. A launch the owner started for another step stays: it starts
    // once this agent is done (retryLaunch waits while the card is running).
    try {
      const card = await gh.getIssue(issue || pr);
      const kept = readRelaunch(card?.body);
      if (!kept?.owner || sameLaunch(kept, { stage, pr })) await clearRelaunch(issue || pr, card, { followUp: true });
    } catch (e) { if (isRateLimited(e)) throw e; log(`relaunch not cleared: ${e.message}`); }
    await afterLaunch(then);
    return true;
  }

  const sameLaunch = (a, b) => a?.stage === b?.stage && (a?.pr || null) === (b?.pr || null);
  // What a saved launch needs to start again.
  const launchOf = ({ stage, issue, pr = null, extra, then, owner, unblock }) => ({ stage, issue, pr, extra, then, ...(owner ? { owner } : {}), ...(unblock ? { unblock } : {}) });

  // The messages first: a message that uses a link up (« je reprends ») must be posted before anything can fail.
  async function afterLaunch(then = {}) {
    for (const { n, body } of then.comments || []) await gh.comment(n, body);
    for (const { n, add = [], remove = [] } of then.labels || []) {
      for (const l of remove) await gh.removeLabel(n, l);
      if (add.length) await gh.addLabels(n, add);
    }
  }

  // A saved launch that would start a build takes a place, like the build itself (the owner's « go »).
  // The project's foundation never waits for a place (owner's rule).
  const takesPlace = (saved) => saved?.stage !== 'foundation' && (saved?.then?.labels || []).some((l) => (l.add || []).includes(L.building));

  // Saves a launch that failed for a passing reason on its card (the issue, else the PR), with its schedule. The PR
  // gets a copy of the time only ({ next, of }), for the board, which shows the PR in place of its request.
  // `prior`: the schedule that goes on (undefined: the card's own; null: a fresh one, after the owner's « réessaie »).
  async function waitRelaunch(saved, prior) {
    const card = saved.issue || saved.pr;
    const item = await gh.getIssue(card);
    const existing = readRelaunch(item?.body);
    if (prior === undefined && existing?.owner && !saved.owner && !sameLaunch(existing, saved)) {
      // Kept behind it: started once the owner's launch has started (clearRelaunch with followUp), never dropped.
      log(`launch of #${card} (${saved.stage}) waits behind the owner's waiting launch (${existing.stage})`);
      const state = { ...existing, after: launchOf(saved) };
      await gh.updateIssue(card, { body: writeRelaunch(item?.body, state) });
      return { action: 'kept', state, tell: false };
    }
    const step = relaunchStep(prior === undefined ? existing : prior, { launch: saved, now: now() });
    await gh.updateIssue(card, { body: writeRelaunch(item?.body, step.state) });
    if (saved.pr && saved.pr !== card) await copyOnPr(saved.pr, card, step.state);
    for (const n of new Set([card, saved.pr].filter(Boolean))) await gh.addLabels(n, [L.relaunch]);
    if (step.firstInMs) outputs.relaunchInMs = step.firstInMs;
    log(`launch of #${card} (${saved.stage}) ${step.action === 'block' ? 'given up after 3 hours' : `retried at ${new Date(step.state.next).toISOString()}`}`);
    if (step.action === 'block') {
      await gh.addLabels(card, [L.blocked]);
      await gh.comment(card, say(RELAUNCH_BLOCKED));
    } else if (step.tell) {
      await gh.comment(card, say(RELAUNCH_TOLD));
    }
    return step;
  }

  async function copyOnPr(prNumber, card, state) {
    const pr = await gh.getPr(prNumber);
    if (pr) await gh.updateIssue(prNumber, { body: writeRelaunch(pr.body, { next: state.next, of: card, ...(state.blocked ? { blocked: true } : {}) }) });
  }

  // Forgets the launch saved on card `n` (and the copy on its PR). Reads the card unless given.
  // `followUp`: the saved launch has just started; an automatic launch kept behind it (`after`) now waits in its place,
  // started at the first tick once this agent is done.
  async function clearRelaunch(n, item = null, { followUp = false } = {}) {
    const card = item || await gh.getIssue(n);
    const saved = readRelaunch(card?.body);
    const labelled = names(card?.labels).includes(L.relaunch);
    if (!saved && !labelled) return;
    if (followUp && saved?.after) {
      const next = { ...saved.after, since: now(), failures: 1, next: now() };
      await gh.updateIssue(n, { body: writeRelaunch(card.body, next) });
      if (saved.pr && saved.pr !== n && saved.pr !== next.pr) await gh.removeLabel(saved.pr, L.relaunch);
      if (next.pr && next.pr !== n) { await copyOnPr(next.pr, n, next); await gh.addLabels(next.pr, [L.relaunch]); }
      if (!labelled) await gh.addLabels(n, [L.relaunch]);
      return;
    }
    if (saved) await gh.updateIssue(n, { body: writeRelaunch(card.body, null) });
    if (labelled) await gh.removeLabel(n, L.relaunch);
    if (saved?.pr && saved.pr !== n) {
      const pr = await gh.getPr(saved.pr);
      if (pr && readRelaunch(pr.body)) await gh.updateIssue(saved.pr, { body: writeRelaunch(pr.body, null) });
      await gh.removeLabel(saved.pr, L.relaunch);
    }
  }

  // Starts the launch saved on card `n` again. Returns 'started', 'failed' (passing failure, rescheduled), 'queued'
  // (the factory is full: the card waits for a place like any other) or 'dropped' (nothing to start any more, an
  // agent already on it, or a setting problem the owner was told about).
  async function retryLaunch(n) {
    const item = await gh.getIssue(n);
    const saved = readRelaunch(item?.body);
    if (!saved || saved.of) return 'dropped';
    if (item.state === 'closed') { await clearRelaunch(n, item); return 'dropped'; }
    const labels = names(item.labels);
    if (labels.includes(L.running)) return 'dropped'; // an agent already works on it
    const { stage, issue, pr, then } = saved;
    if (pr && (await gh.getPr(pr))?.state === 'closed') { await clearRelaunch(n, item); return 'dropped'; }
    // The places may have been taken meanwhile: a build never starts past the limit, it queues (owner's rule).
    if (takesPlace(saved) && !labels.includes(L.building) && config.maxParallel - (await inFlight(n)) <= 0) {
      await clearRelaunch(n, item);
      const resume = stage === 'resume';
      for (const l of [L.blocked, ...(then?.labels || []).filter((x) => x.n === n).flatMap((x) => x.remove || [])]) if (labels.includes(l)) await gh.removeLabel(n, l);
      await gh.addLabels(n, resume ? [L.queued, L.resumeQueued] : [L.queued]);
      if (!labels.includes(L.queued)) await gh.comment(n, say(`C'est noté. ${config.maxParallel} feature(s) sont déjà en construction, c'est le maximum réglé pour ce projet : celle-ci est en file d'attente et démarrera toute seule dès qu'une place se libère.`));
      log(`relaunch of #${n}: the factory is full, queued`);
      return 'queued';
    }
    try {
      await fireAgent({ stage, issue, pr, extra: saved.extra });
    } catch (e) {
      if (isRateLimited(e)) throw e; // not a setting problem: the launch stays saved, retried after the limit
      if (!e.transient) {
        // A setting broke meanwhile: fireAgent explained it. The launch stays saved for the owner's « réessaie »; its PR
        // leaves its step like any blocked card's (fireOrBlock).
        log(`relaunch of #${n} refused: ${e.message}`);
        const state = { ...saved, next: null, blocked: true };
        await gh.updateIssue(n, { body: writeRelaunch(item.body, state) });
        if (pr && pr !== n) {
          await copyOnPr(pr, n, state);
          for (const l of [L.checks, L.fixing, L.acceptance]) await gh.removeLabel(pr, l);
        }
        await gh.addLabels(n, [L.blocked]);
        return 'dropped';
      }
      // After the owner's « réessaie » on a blocked card, its schedule starts afresh and « Bloqué » goes at the start.
      await waitRelaunch(saved.blocked ? { ...launchOf(saved), unblock: true } : launchOf(saved), saved.blocked ? null : saved);
      return 'failed';
    }
    // Cleared first: a GitHub hiccup in what follows must never start the same launch a second time.
    await clearRelaunch(n, item, { followUp: true });
    log(`relaunch of #${n} (${stage}) started`);
    if (saved.blocked || saved.unblock) await gh.removeLabel(n, L.blocked);
    await afterLaunch(then);
    return 'started';
  }

  // The launches saved on cards, oldest first: not the copies on PRs, not the ones blocked (they wait for the owner),
  // not a card an agent already works on.
  async function waitingLaunches() {
    const items = (await gh.listIssues({ labels: L.relaunch })) || [];
    return items.map((item) => ({ item, saved: readRelaunch(item.body) }))
      .filter((x) => x.saved && !x.saved.of && !x.saved.blocked && !names(x.item.labels).includes(L.running))
      .sort((a, b) => (a.saved.since || 0) - (b.saved.since || 0));
  }

  // Run by the guard at every tick, and 2 minutes after a first failure (relaunch-soon). When one is due, the oldest
  // is tried first; if it fails again, the others are not tried during the outage: the failure counts for them too
  // (told at their third, blocked after 3 hours) and they move to its next time.
  async function retryLaunches() {
    const waiting = await waitingLaunches();
    if (!waiting.some((x) => x.saved.next <= now())) return;
    for (let k = 0; k < waiting.length; k++) {
      const result = await retryLaunch(waiting[k].item.number);
      if (result !== 'failed') continue;
      const next = readRelaunch((await gh.getIssue(waiting[k].item.number))?.body)?.next;
      for (const { item, saved } of waiting.slice(k + 1)) {
        const step = await waitRelaunch(launchOf(saved), saved);
        if (step.action === 'wait' && next && step.state.next < next) {
          const fresh = await gh.getIssue(item.number);
          await gh.updateIssue(item.number, { body: writeRelaunch(fresh?.body, { ...step.state, next }) });
        }
      }
      break;
    }
  }

  // A « relaunch » label with no readable saved launch (lost body edit, launch cleared by hand) would keep the card out of
  // every automatic path for good: it is removed, unless an agent works on the card.
  async function dropStaleRelaunchLabels() {
    for (const item of (await gh.listIssues({ labels: L.relaunch })) || []) {
      if (names(item.labels).includes(L.running)) continue;
      try {
        const saved = readRelaunch(item.body);
        if (saved?.of) {
          // A PR's copy: kept while its open request still holds the launch for this PR, cleared with its label otherwise.
          const request = await gh.getIssue(saved.of);
          const held = request?.state !== 'closed' && readRelaunch(request?.body);
          if (held && (held.pr === item.number || held.after?.pr === item.number)) continue;
          await gh.updateIssue(item.number, { body: writeRelaunch(item.body, null) });
        } else if (saved) continue;
        await gh.removeLabel(item.number, L.relaunch);
        log(`#${item.number}: stale « relaunch » label removed (no saved launch)`);
      } catch (e) {
        if (isRateLimited(e)) throw e;
        log(`#${item.number}: stale « relaunch » check skipped (${e.message})`); // one bad card never stops the others
      }
    }
  }

  // An owner's message on a card whose launch waits. A message that moves the card (« go », « ok ») replaces the saved
  // launch: the usual handling goes on. Any other (« réessaie », a remark) starts the saved launch at once; the agent
  // reads the new message with the others. Returns true when the event is handled this way.
  async function relaunchOnMessage(ev, action, said) {
    if (!ev.fromOwner || ev.fromAgent || !said || !(ev.labels || []).includes(L.relaunch)) return false;
    if (['drop', 'defer'].includes(action.type)) return false; // closing wins; a running agent reads it anyway
    let target = ev.number;
    const own = readRelaunch((await gh.getIssue(ev.number))?.body);
    if (own?.of) target = own.of;
    else if (!own && ev.kind === 'pr') target = prIssue(await gh.getPr(ev.number)) || ev.number;
    const saved = target === ev.number ? own : readRelaunch((await gh.getIssue(target))?.body);
    // A message that moves the card, or starts another step while an automatic launch waits (a remark while a fix
    // waits), is the owner's latest word. A remark after his own waiting launch goes with it (spec: « avec votre message »).
    const moves = ['merge', 'queue', 'checks', 'visual-ok', 'docs-merge'].includes(action.type)
      || (action.type === 'fire' && (action.add?.length || (saved && !saved.owner && action.stage !== saved.stage)));
    if (moves && !isRetry(said)) {
      log(`owner message on #${ev.number}: it replaces the waiting launch`);
      await clearRelaunch(target);
      return false;
    }
    const result = await retryLaunch(target);
    if (result === 'dropped' && !(await liveLabels(target)).includes(L.blocked)) return false; // nothing waited: usual handling
    log(`owner message on #${ev.number}: its waiting launch ${result}`);
    return true;
  }

  // For runs no owner message started (checks, merge): a setting failure parks the issue as blocked so that
  // « réessaie » resumes it, instead of leaving a state where comments are ignored. A passing failure waits for its
  // relaunch (false too: the caller stops, `then` is done once the agent starts).
  async function fireOrBlock({ stage, issue, pr, extra, why, then }) {
    try {
      return await launch({ stage, issue, pr, extra, then, quiet: true });
    } catch (e) {
      if (isRateLimited(e)) throw e; // not a setting problem: the event is taken up again once the limit is over
      log(`fire failed: ${e}`);
      for (const l of [L.checks, L.fixing, L.acceptance]) if (pr) await gh.removeLabel(pr, l);
      if (issue) await gh.addLabels(issue, [L.blocked]);
      await gh.comment(issue || pr, say(`${why}, mais je n'ai pas pu lancer l'agent (limite quotidienne de la routine Claude atteinte, ou moteur mal configuré). Répondez « réessaie » ici quand vous voulez relancer.`));
      return false;
    }
  }

  // Blocked cards that wait for the merge of other requests (issue #298): once all are merged, the card resumes
  // (or queues when the factory is full, like an owner's answer); one abandoned, the owner is told and decides.
  // A card an agent is still working on is left for the end of its run.
  async function wakeWaiters(freed = null) {
    // A card whose resume waits for its relaunch is not woken twice.
    const blocked = ((await gh.listIssues({ labels: L.blocked })) || []).filter((i) => !i.pull_request && !names(i.labels).some((l) => [L.running, L.relaunch].includes(l)));
    let free = null; // places left, counted once: GitHub's lists lag behind the cards resumed here
    // The issues a merged PR closes: the latest closed PRs first, older pages only for an issue closed before them.
    let mergedIssues = null;
    let pages = 0;
    let oldest = Infinity; // update time of the oldest closed PR read so far
    const addPulls = (pulls) => {
      for (const p of pulls) {
        if (p.merged_at && prIssue(p)) mergedIssues.add(prIssue(p));
        if (p.updated_at) oldest = Math.min(oldest, Date.parse(p.updated_at));
      }
    };
    const readMerged = async (issue) => {
      if (!mergedIssues) { mergedIssues = new Set(); addPulls((await gh.listClosedPulls?.()) || []); }
      // A PR is updated when it is merged, and the factory closes the issue right after: no need to read further back.
      const since = Date.parse(issue?.closed_at || 0) - 3_600_000;
      while (issue?.state === 'closed' && !issue.pull_request && !mergedIssues.has(issue.number) && gh.listClosedPullsPage && pages < 5 && !(oldest < since)) {
        const page = (await gh.listClosedPullsPage(pages + 1)) || [];
        pages += 1;
        addPulls(page);
        if (page.length < 100) { pages = 5; break; }
      }
    };
    // A 404 gives null (the request is gone), and so does a 410 (deleted); any other error throws and the card is
    // looked at again next time.
    const readRequest = (n) => gh.getIssue(n).catch((e) => { if (/-> 410\b/.test(String(e.message))) return null; throw e; });
    const tell = async (n, text) => {
      await gh.comment(n, text);
      commentCache.delete(n); // the card's thread changed: never act on the old copy again in this run
    };
    for (const item of blocked) {
      try {
        const waits = waitedFor(await cardComments(item)).filter((w) => w !== item.number);
        if (!waits.length) continue;
        const states = new Map();
        for (const w of waits) {
          const req = await readRequest(w);
          await readMerged(req);
          states.set(w, requestState(req, mergedIssues));
        }
        const abandoned = waits.filter((w) => states.get(w) === 'abandoned');
        if (!abandoned.length && waits.some((w) => states.get(w) !== 'merged')) continue;
        const labels = await liveLabels(item.number);
        if (!labels.includes(L.blocked) || labels.includes(L.running)) continue; // another relay run took it
        const list = (ns) => ns.map((w) => `#${w}`).join(', ');
        if (abandoned.length) {
          const verb = abandoned.length > 1 ? 'ont été abandonnées' : 'a été abandonnée';
          await tell(item.number, `${WAITS_DONE_MARKER}\n${say(`${list(abandoned)} ${verb} : que voulez-vous faire ?`)}`);
          continue;
        }
        const merged = `${list(waits)} ${waits.length > 1 ? 'sont fusionnées' : 'est fusionnée'}`;
        const holdsPlace = labels.includes(L.building) && !labels.includes(L.project);
        if (holdsPlace && free === null) free = config.maxParallel - (await inFlight(freed));
        if (holdsPlace && free <= 0) {
          for (const l of [L.blocked, L.building]) await gh.removeLabel(item.number, l);
          await gh.addLabels(item.number, [L.queued, L.resumeQueued]);
          await tell(item.number, `${WAITS_DONE_MARKER}\n${mergedMarker(waits)}\n${say(`${merged}. La factory est pleine : je reprends dès qu'une place se libère.`)}`);
          continue;
        }
        let started;
        try {
          // The link is used up first (the message comes before the label): the agent is never sent back twice for it.
          started = await launch({ stage: 'resume', issue: item.number, extra: { merged: waits }, quiet: true, then: {
            comments: [{ n: item.number, body: `${WAITS_DONE_MARKER}\n${say(`${merged} : je reprends.`)}` }],
            labels: [{ n: item.number, remove: [L.blocked] }],
          } });
        } catch (e) {
          // Told once (the link is used up): the card becomes a normal block that his « réessaie » resumes.
          log(`waits #${item.number}: resume failed: ${e.message}`);
          await tell(item.number, `${WAITS_DONE_MARKER}\n${say(`${merged}, mais je n'ai pas pu relancer l'agent (moteur mal configuré). Répondez « réessaie » ici quand vous voulez relancer.`)}`);
          continue;
        }
        commentCache.delete(item.number);
        if (!started) break; // its relaunch is planned: no other card is started during the outage
        woken.add(item.number);
        if (holdsPlace) free -= 1;
      } catch (e) { log(`waits #${item.number}: ${e.message}`); }
    }
  }

  async function dequeue({ freed = null } = {}) {
    ctx.dequeues += 1;
    // While a launch waits for its relaunch, the service is down: no other card is started on top of it (issue #383).
    if ((await waitingLaunches()).length) return log('a launch waits for its relaunch: nothing new is started');
    await wakeWaiters(freed).catch((e) => log(`waits: ${e.message}`));
    let free = config.maxParallel - (await inFlight(freed));
    if (free <= 0) return;
    const queued = ((await gh.listIssues({ labels: L.queued, sort: 'created', direction: 'asc' })) || []).filter((i) => !i.pull_request && !names(i.labels).includes(L.relaunch));
    let failed = false; // a queued issue could not start: the factory is in trouble, do not pick on top of it
    for (const issue of queued) {
      if (free <= 0) break;
      const labels = await liveLabels(issue.number);
      if (!labels.includes(L.queued)) continue; // another relay run took it
      const resumed = labels.includes(L.resumeQueued);
      // Queued by wakeWaiters once its awaited requests were merged (issue #298), not by an owner's answer.
      const merged = resumed ? mergedWaits((await gh.listComments(issue.number)) || []) : [];
      let started = false;
      try {
        started = await launch({ stage: resumed ? 'resume' : buildStage(labels), issue: issue.number, quiet: true, extra: merged.length ? { merged } : {}, then: {
          labels: [{ n: issue.number, remove: [L.queued, L.resumeQueued], add: [L.building] }],
          comments: [{ n: issue.number, body: merged.length ? `${RESUMED_MARKER}\n${say("Une place s'est libérée : je reprends.")}`
            : say(resumed ? "Une place s'est libérée : je reprends la construction avec votre réponse." : "Une place s'est libérée : je démarre la construction.") }],
        } });
      } catch (e) {
        log(`dequeue fire failed, the issue stays queued: ${e}`);
      }
      if (!started) { failed = true; break; } // it stays queued (its relaunch planned, or a setting to fix)
      free -= 1;
    }
    if (free > 0 && !failed) await autoPick(free, freed);
  }

  // With the autoPick setting on, free slots and an empty queue: starts existing issues, urgent first,
  // then bugs, then the rest, oldest first. Ideas the agent proposed are left for the owner to sort. An issue is picked only once (`auto-picked` stays on it). Never touches issues that wait for the owner or are held back.
  async function autoPick(free, freed = null) {
    if (!config.autoPick) return;
    const SKIP = [L.close, ...CLOSE_REASONS, L.noPick, L.question, L.project, L.audit, L.stack, L.release, L.autoPicked, L.grilling, L.specReview, L.queued,
      L.building, L.blocked, L.running, L.pending];
    const open = async (label) => ((await gh.listIssues({ labels: label, sort: 'created', direction: 'asc' })) || []).filter((i) => !i.pull_request);
    // Picked features still waiting for the owner's answers (questions or spec): at most `maxQuestions` of them.
    const waitingList = (await open(L.autoPicked)).filter((i) => i.number !== freed && [L.grilling, L.specReview].some((l) => names(i.labels).includes(l)));
    // A picked card that waits for the owner still holds its place.
    free -= waitingList.length;
    if (free <= 0) return;
    // A card that already has an open PR is not new work; neither is the one whose build just ended.
    const withPr = new Set();
    for (const l of [L.visualReview, L.checks, L.acceptance, L.fixing]) {
      for (const i of (await gh.listIssues({ labels: l })) || []) if (i.pull_request) { const n = linkedIssue(i.body); if (n) withPr.add(n); }
    }
    const seen = new Set();
    const candidates = [...(await open(L.bug)), ...(await open(L.feature))].filter((i) => !seen.has(i.number) && seen.add(i.number))
      .filter((i) => !names(i.labels).some((l) => SKIP.includes(l)))
      // An idea the agent proposed waits for the owner's sorting (« Garder » on the board, or a message in it).
      .filter((i) => !isIdea(i))
      .filter((i) => i.number !== freed && !withPr.has(i.number));
    const rank = (i) => (names(i.labels).includes(L.urgent) ? 0 : 2) + (names(i.labels).includes(L.bug) ? 0 : 1);
    candidates.sort((a, b) => rank(a) - rank(b) || Date.parse(a.created_at) - Date.parse(b.created_at) || a.number - b.number);
    let featureRoom = (config.maxQuestions ?? 2) - waitingList.length;
    for (const issue of candidates) {
      if (free <= 0) break;
      const labels = await liveLabels(issue.number);
      if (labels.some((l) => SKIP.includes(l))) continue; // another run took it
      const isBug = labels.includes(L.bug);
      if (!isBug && featureRoom <= 0) continue;
      const grilling = !isBug && config.stages.grilling;
      const stage = isBug ? 'bugfix' : grilling ? 'grilling' : 'spec';
      // Claim first (the labels also keep a second run from picking it again), release if the agent does not start.
      const claim = [...(isBug ? [L.building] : grilling ? [L.grilling] : []), L.autoPicked];
      await gh.addLabels(issue.number, claim);
      let started;
      try {
        started = await launch({ stage, issue: issue.number, quiet: true, then: { comments: [{ n: issue.number, body: say("La factory l'a prise d'elle-même car une place était libre.") }] } });
      } catch (e) {
        log(`auto-pick fire failed: ${e}`);
        for (const l of claim) await gh.removeLabel(issue.number, l);
        break;
      }
      if (!started) break; // claimed, its relaunch planned: no other card during the outage
      free -= 1;
      if (!isBug) featureRoom -= 1;
    }
  }


  return { fireAgent, noteSession, launch, sameLaunch, launchOf, afterLaunch, takesPlace, waitRelaunch, copyOnPr, clearRelaunch, retryLaunch, waitingLaunches, retryLaunches, dropStaleRelaunchLabels, relaunchOnMessage, fireOrBlock, wakeWaiters, dequeue, autoPick };
}
