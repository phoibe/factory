#!/usr/bin/env node
// The factory's orchestrator, run by .github/workflows/relay.yml on every project event.
//   node scripts/relay.mjs decide
//   node scripts/relay.mjs report --result success|failure --pr 12
//   node scripts/relay.mjs release            (end of an Actions agent run: PAYLOAD env)
import { appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, afterChecks } from './lib/decide.mjs';
import { L, AGENT_MARKER, CHECKS_FAILED_MARKER, CHECKS_RESET_MARKER, UPDATE_BRANCH_MARKER, SESSION_MARKER } from './lib/labels.mjs';
import { runTitle, stageName } from './lib/run-title.mjs';
import { resolveConfig } from './lib/config.mjs';
import { github } from './lib/github.mjs';
import { withLock } from './lib/lock.mjs';
import { mirrorAttachments } from './lib/attachments.mjs';
import { CATCH_UP, FABRICATION_MARKER, parseJournal, summarize, uiChanged } from './lib/fabrication.mjs';

const SKILLS_FIX_MARKER = '<!-- factory-skills-fix -->';
const STEP_NAMES = { 'requesting-code-review': 'la revue de code', impeccable: 'la passe design' };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Just under the checks job's timeout-minutes (30) in relay.yml.
const CHECKS_TIMEOUT_MS = 28 * 60_000;
export const LOCK_MINUTES = 150; // longer than the agent's 120-minute job timeout
export const PROJECT_WORKFLOW = 'factory.yml';
export const MAX_BRANCH_UPDATES = 2;
const FOOTER = '\n\n---\n_Message automatique de la software factory_';
const say = (text) => `${AGENT_MARKER}\n${text}${FOOTER}`;
const names = (labels = []) => labels.map((l) => (typeof l === 'string' ? l : l.name));

export function linkedIssue(body) {
  const m = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body || '');
  return m ? Number(m[1]) : null;
}

// Normalises a GitHub webhook payload into the shape decide() expects.
// The preview link of the latest Vercel bot comment, once its deployment is "Ready".
export function vercelPreview(comments) {
  const body = [...comments].reverse().find((c) => c.user?.login === 'vercel[bot]')?.body || '';
  if (!/Ready\]\(|\/ready\.svg/i.test(body)) return null;
  return /\[Preview\]\((https:\/\/[^)\s]+)\)/.exec(body)?.[1] || null;
}

export function eventFromPayload(eventName, p, now = Date.now()) {
  const owner = p.repository?.owner?.login;
  const isOwnerOrApp = (login) => Boolean(login) && (login === owner || login === 'claude[bot]');
  const base = { event: eventName, action: p.action, addedLabel: p.label?.name, removedLabel: p.label?.name, fromAgent: false, text: '' };
  if (eventName === 'workflow_dispatch') {
    const payload = p.inputs?.payload || '';
    let replay = null;
    let tick = false;
    try { ({ replay = null, tick = false } = JSON.parse(payload) || {}); } catch {}
    // Sent by the panel when the number of parallel features goes up, so the new place is used at once.
    if (tick === true) return { ...base, kind: 'tick', number: null, labels: [], fromOwner: false };
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
      merged: Boolean(p.pull_request.merged), open: p.pull_request.state === 'open', fromOwner: isOwnerOrApp(p.sender?.login),
    };
  }
  return { ...base, kind: 'none', number: null, labels: [], fromOwner: false };
}

export function createRelay({ gh, repo, config, env = {}, fetchImpl = fetch, now = () => Date.now(), log = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const outputs = {};
  const liveLabels = async (n) => names((await gh.getIssue(n))?.labels);

  // `freed`: an issue whose build just ended. GitHub's issue list can still show its old label for a few
  // seconds, which used to keep its place taken until the next regular tick.
  async function inFlight(freed = null) {
    const open = await gh.listIssues({ labels: L.building });
    // A blocked card has given up its place: it needs a free one again when the owner answers.
    return (open || []).filter((i) => !i.pull_request && i.number !== freed && !names(i.labels).includes(L.blocked)).length;
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
    if (config.runner === 'github-actions') {
      try {
        const ref = (await gh.getRepo())?.default_branch || 'main';
        await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify(payload) });
      } catch (e) {
        await fail("Je n'ai pas pu lancer l'agent sur GitHub Actions. Réécris ton message dans quelques minutes ; si ça se répète, vérifie que le workflow « Factory » est activé (onglet Actions).", String(e));
      }
      return;
    }
    if (!env.FACTORY_ROUTINE_URL || !env.FACTORY_ROUTINE_TOKEN) {
      await fail("Je n'ai pas pu lancer l'agent : je ne trouve pas les secrets de la routine Claude **dans ce dépôt**.\n\n"
        + `Ouvre https://github.com/${repo}/settings/secrets/actions (la page des secrets de ce dépôt-ci, pas de factory-template) `
        + 'et crée, dans **Repository secrets**, `FACTORY_ROUTINE_URL` et `FACTORY_ROUTINE_TOKEN` (étape 5 du README). Puis écris « réessaie » ici.', 'routine secrets missing');
    }
    const res = await fetchImpl(env.FACTORY_ROUTINE_URL, {
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
    if (!res.ok) {
      const detail = await res.text();
      await fail(`Je n'ai pas pu lancer l'agent (la routine Claude a répondu ${res.status}). `
        + "Ça arrive quand la limite quotidienne de lancements est atteinte. Réécris ton dernier message plus tard (rien n'a changé entre-temps), ou passe ce projet sur le moteur « GitHub Actions » dans le panneau.",
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

  // For runs no owner message started (checks, merge): on failure, park the issue as blocked so that
  // « réessaie » resumes it, instead of leaving a state where comments are ignored.
  async function fireOrBlock({ stage, issue, pr, extra, why }) {
    try {
      await fireAgent({ stage, issue, pr, extra, quiet: true });
      return true;
    } catch (e) {
      log(`fire failed: ${e}`);
      for (const l of [L.checks, L.fixing, L.acceptance]) if (pr) await gh.removeLabel(pr, l);
      if (issue) await gh.addLabels(issue, [L.blocked]);
      await gh.comment(issue || pr, say(`${why}, mais je n'ai pas pu lancer l'agent (limite quotidienne de la routine Claude atteinte, ou moteur mal configuré). Réponds « réessaie » ici quand tu veux relancer.`));
      return false;
    }
  }

  async function dequeue({ freed = null } = {}) {
    let free = config.maxParallel - (await inFlight(freed));
    if (free <= 0) return;
    const queued = ((await gh.listIssues({ labels: L.queued, sort: 'created', direction: 'asc' })) || []).filter((i) => !i.pull_request);
    let failed = false; // a queued issue could not start: the factory is in trouble, do not pick on top of it
    for (const issue of queued) {
      if (free <= 0) break;
      const labels = await liveLabels(issue.number);
      if (!labels.includes(L.queued)) continue; // another relay run took it
      const resumed = labels.includes(L.resumeQueued);
      try {
        await fireAgent({ stage: resumed ? 'resume' : labels.includes(L.bug) ? 'bugfix' : labels.includes(L.audit) ? 'audit' : 'build', issue: issue.number, quiet: true });
      } catch (e) {
        log(`dequeue fire failed, the issue stays queued: ${e}`);
        failed = true;
        break;
      }
      await gh.removeLabel(issue.number, L.queued);
      await gh.removeLabel(issue.number, L.resumeQueued);
      await gh.addLabels(issue.number, [L.building]);
      await gh.comment(issue.number, say(resumed ? "Une place s'est libérée : je reprends la construction avec ta réponse." : "Une place s'est libérée : je démarre la construction."));
      free -= 1;
    }
    if (free > 0 && !failed) await autoPick(free, freed);
  }

  // With the autoPick setting on, free slots and an empty queue: starts existing issues, urgent first,
  // then bugs, then the rest, oldest first. An issue is picked only once (`auto-picked` stays on it). Never touches issues that wait for the owner or are held back.
  async function autoPick(free, freed = null) {
    if (!config.autoPick) return;
    const SKIP = [L.noPick, L.question, L.project, L.audit, L.release, L.autoPicked, L.grilling, L.specReview, L.queued,
      L.building, L.blocked, L.running, L.pending];
    const open = async (label) => ((await gh.listIssues({ labels: label, sort: 'created', direction: 'asc' })) || []).filter((i) => !i.pull_request);
    // A picked feature still waiting for the owner's answers: no more features until it moves on.
    const waitingList = (await open(L.autoPicked)).filter((i) => i.number !== freed && [L.grilling, L.specReview].some((l) => names(i.labels).includes(l)));
    const waiting = waitingList.length > 0;
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
      .filter((i) => i.number !== freed && !withPr.has(i.number));
    const rank = (i) => (names(i.labels).includes(L.urgent) ? 0 : 2) + (names(i.labels).includes(L.bug) ? 0 : 1);
    candidates.sort((a, b) => rank(a) - rank(b) || Date.parse(a.created_at) - Date.parse(b.created_at) || a.number - b.number);
    let stopFeatures = waiting;
    for (const issue of candidates) {
      if (free <= 0) break;
      const labels = await liveLabels(issue.number);
      if (labels.some((l) => SKIP.includes(l))) continue; // another run took it
      const isBug = labels.includes(L.bug);
      if (!isBug && stopFeatures) continue;
      const grilling = !isBug && config.stages.grilling;
      const stage = isBug ? 'bugfix' : grilling ? 'grilling' : 'spec';
      // Claim first (the labels also keep a second run from picking it again), release if the agent does not start.
      const claim = [...(isBug ? [L.building] : grilling ? [L.grilling] : []), L.autoPicked];
      await gh.addLabels(issue.number, claim);
      try {
        await fireAgent({ stage, issue: issue.number, quiet: true });
      } catch (e) {
        log(`auto-pick fire failed: ${e}`);
        for (const l of claim) await gh.removeLabel(issue.number, l);
        break;
      }
      await gh.comment(issue.number, say("La factory l'a prise d'elle-même car une place était libre."));
      free -= 1;
      if (!isBug) stopFeatures = true;
    }
  }

  async function mergePr(prNumber, sha) {
    const pr = await gh.getPr(prNumber);
    const issue = linkedIssue(pr.body);
    try {
      await gh.merge(prNumber, sha);
    } catch (e) {
      log(`merge failed: ${e}`);
      const state = (await gh.getPr(prNumber))?.mergeable_state;
      const updates = ((await gh.listComments(prNumber)) || []).filter((c) => (c.body || '').includes(UPDATE_BRANCH_MARKER)).length;
      if ((state === 'behind' || state === 'dirty') && updates < MAX_BRANCH_UPDATES) {
        if (!(await fireOrBlock({ stage: 'update-branch', issue, pr: prNumber, why: 'La branche doit être mise à jour avant la fusion' }))) return;
        for (const l of [L.acceptance, L.checks]) await gh.removeLabel(prNumber, l);
        await gh.addLabels(prNumber, [L.fixing]);
        await gh.comment(prNumber, `${UPDATE_BRANCH_MARKER}\n${say("Je n'ai pas pu fusionner : la branche n'est plus à jour avec la version en ligne (une autre feature est sans doute passée entre-temps). L'agent la met à jour, puis les contrôles repartent. Rien à faire de ton côté.")}`);
        return;
      }
      for (const l of [L.acceptance, L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
      if (issue) await gh.addLabels(issue, [L.blocked]);
      await gh.comment(issue || prNumber, say(`Je n'arrive pas à fusionner la PR #${prNumber} (GitHub répond : « ${String(e.message || e).slice(0, 200)} »). Ce n'est pas un problème de code : souvent une règle du dépôt (protection de branche, revue obligatoire) ou une branche impossible à remettre à jour automatiquement. Dis-moi « réessaie » une fois la règle ajustée, ou fusionne la PR toi-même.`));
      return;
    }
    for (const l of [L.acceptance, L.checks, L.fixing, L.running, L.blocked]) await gh.removeLabel(prNumber, l);
    await afterMerge(prNumber);
    await gh.comment(prNumber, say("C'est fusionné ✅. La version en ligne se met à jour automatiquement dans quelques minutes."));
    if (issue) for (const l of [L.building, L.blocked]) await gh.removeLabel(issue, l);
    await dequeue({ freed: issue });
    await unstickConflicts().catch((e) => log(`conflicts: ${e.message}`));
  }

  // A merge made with the workflow's own token starts no workflow, so the panel deploy (GitHub Pages) and the
  // skills sync that the push would have started are started by hand. A project without them is skipped.
  async function afterMerge(prNumber) {
    let files = [];
    try { files = ((await gh.listPrFiles(prNumber)) || []).map((f) => f.filename); } catch { /* deploy anyway */ }
    const ref = (await gh.getRepo())?.default_branch || 'main';
    const wanted = ['pages.yml', ...(files.includes('factory.config.json') ? ['factory-sync.yml'] : [])];
    for (const wf of wanted) {
      try { await gh.dispatch(wf, ref, {}); } catch (e) { log(`after merge: ${wf} not started (${String(e.message || e).slice(0, 80)})`); }
    }
  }

  // Right after a push to main GitHub has not computed mergeability yet ("unknown"): ask again for a while.
  async function settledPr(number, { attempts = 6, delayMs = 5_000 } = {}) {
    let pr = await gh.getPr(number);
    for (let i = 1; i < attempts && pr?.state === 'open' && (!pr.mergeable_state || pr.mergeable_state === 'unknown'); i++) {
      await sleep(delayMs);
      pr = await gh.getPr(number);
    }
    return pr;
  }

  // GitHub runs no pull_request workflow for a PR in conflict with main: a PR waiting for its checks would
  // wait forever. Checked right after every merge (that is when a PR falls into conflict) and on every tick.
  async function unstickConflicts() {
    const waiting = ((await gh.listIssues({ labels: L.checks })) || []).filter((i) => i.pull_request);
    for (const item of waiting) {
      if (names(item.labels).includes(L.running)) continue;
      const pr = await settledPr(item.number);
      if (pr?.state !== 'open' || pr.mergeable_state !== 'dirty') continue;
      if (!(await liveLabels(item.number)).includes(L.checks)) continue; // another relay run took it
      const updates = ((await gh.listComments(item.number)) || []).filter((c) => (c.body || '').includes(UPDATE_BRANCH_MARKER)).length;
      const issue = linkedIssue(pr.body);
      if (updates >= MAX_BRANCH_UPDATES) {
        await gh.removeLabel(item.number, L.checks);
        if (issue) await gh.addLabels(issue, [L.blocked]);
        await gh.comment(issue || item.number, say(`La PR #${item.number} est en conflit avec la version en ligne et l'agent n'a pas réussi à la remettre à jour. Réponds « réessaie » ici pour une nouvelle tentative.`));
        continue;
      }
      if (!(await fireOrBlock({ stage: 'update-branch', issue, pr: item.number, why: 'La branche est en conflit avec la version en ligne' }))) continue;
      await gh.removeLabel(item.number, L.checks);
      await gh.addLabels(item.number, [L.fixing]);
      await gh.comment(item.number, `${UPDATE_BRANCH_MARKER}\n${say("Les contrôles ne pouvaient pas démarrer : la branche est en conflit avec la version en ligne (une autre feature est passée entre-temps). L'agent la met à jour, puis les contrôles repartent. Rien à faire de ton côté pour l'instant.")}`);
    }
  }

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

  async function handle(ev, { ownerLogin } = {}) {
    if (ev.kind === 'dispatch') {
      outputs.agent = 'true';
      outputs.payload = ev.payload;
      return { action: { type: 'agent' }, outputs };
    }
    const ctx = { inFlight: 0, lockFresh: false };
    if (ev.kind === 'replay') {
      const issue = await gh.getIssue(ev.number);
      ev = { ...ev, kind: issue?.pull_request ? 'pr' : 'issue' };
    }
    if (ev.kind !== 'none' && ev.number) {
      ev = { ...ev, labels: await liveLabels(ev.number) }; // webhook labels can be stale
      ctx.lockFresh = await lockFresh(ev.number, ev.labels);
      ctx.inFlight = await inFlight();
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
    if (action.type === 'replay') {
      await gh.removeLabel(n, L.pending);
      const text = await deferredMessage(n, ownerLogin, ev.kind === 'pr');
      if (!text) return { action, outputs };
      const replayed = { ...ev, event: 'issue_comment', action: 'created', text, fromOwner: true, fromAgent: false, labels: await liveLabels(n) };
      action = decide(replayed, config, { ...ctx, lockFresh: false, inFlight: await inFlight() });
      log(`replayed decision: ${action.type}${action.stage ? ` ${action.stage}` : ''}`);
    }
    const applyLabels = async () => {
      for (const l of action.remove || []) await gh.removeLabel(n, l);
      if (action.add?.length) await gh.addLabels(n, action.add);
    };
    switch (action.type) {
      case 'fire': {
        const pr = ev.kind === 'pr' ? await gh.getPr(n) : null;
        const issue = pr ? linkedIssue(pr.body) : n;
        await fireAgent({ stage: action.stage, issue, pr: pr ? n : null });
        await applyLabels(); // only once the agent really started
        // A blocked PR is often blocked on its issue too: the owner's answer unblocks both.
        if (pr && issue && action.remove?.includes(L.blocked)) await gh.removeLabel(issue, L.blocked);
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
      case 'merge':
        await mergePr(n);
        break;
      case 'dequeue':
        await dequeue({ freed: ev.kind === 'issue' ? n : null });
        // A PR merged by hand (or any closed one): the PRs still waiting may now be in conflict.
        if (ev.kind === 'tick' || ev.kind === 'pr') await unstickConflicts().catch((e) => log(`conflicts: ${e.message}`));
        break;
      default:
        break;
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
    const { body, alerts, missing } = summarize(parseJournal(texts), { stages: config.stages, ui: uiChanged(changed) });
    const mine = ((await gh.listComments(prNumber)) || []).find((c) => (c.body || '').includes(FABRICATION_MARKER));
    const text = say(body);
    if (mine) await gh.updateComment(mine.id, text); else await gh.comment(prNumber, text);
    if (alerts.length) await gh.addLabels(prNumber, [L.skillsAlert]); else await gh.removeLabel(prNumber, L.skillsAlert);
    return Object.assign(alerts, { missing });
  }

  async function report({ result, pr: prNumber, runId, sha, started = null, now = Date.now() }) {
    const pr = await gh.getPr(prNumber);
    if (sha && pr.head.sha !== sha) return log('stale report: the PR changed since these checks ran');
    // Same commit but cancelled: the checks hit their time limit (a hung test). Treat it as red, with its reason.
    if (result === 'cancelled' && !sha) return log('checks cancelled before they started: nothing to report');
    // A newer checks run on the same commit cancels the older one (two events asked for checks). Only a run that
    // reached the time limit is a hung test; a cancelled run that stopped early leaves the report to the newer run.
    // A run cancelled without a known start time never got going: it was replaced too.
    if (result === 'cancelled' && !(started && now - started * 1000 >= CHECKS_TIMEOUT_MS)) {
      return log('checks replaced by a newer run on the same commit: it reports instead');
    }
    const timedOut = result === 'cancelled';
    if (timedOut) result = 'failure';
    let missing = [];
    try { ({ missing } = await fabrication(prNumber, pr)); } catch (e) { log(`fabrication: ${e.message}`); }
    const issueNumber = linkedIssue(pr.body);
    // A skipped review or design pass is caught up once, by a dedicated run, before the owner is asked anything.
    const catchUp = (missing || []).filter((s) => CATCH_UP.includes(s));
    if (result === 'success' && catchUp.length) {
      const done = ((await gh.listComments(prNumber)) || []).some((c) => (c.body || '').includes(SKILLS_FIX_MARKER));
      if (!done) {
        if (!(await fireOrBlock({ stage: 'skills-fix', issue: issueNumber, pr: prNumber, extra: { missing: catchUp }, why: "L'agent a sauté une étape" }))) return;
        await gh.removeLabel(prNumber, L.checks);
        await gh.addLabels(prNumber, [L.fixing]);
        const steps = catchUp.map((s) => STEP_NAMES[s]).join(' et ');
        await gh.comment(prNumber, `${SKILLS_FIX_MARKER}\n${say(`L'agent a sauté ${steps}. Il ${catchUp.length > 1 ? 'les' : 'la'} rattrape maintenant, puis les contrôles repartent : rien à faire de ton côté pour l'instant. Si ça change l'apparence, je te remontrerai les captures.`)}`);
        return;
      }
    }
    const issue = issueNumber ? await gh.getIssue(issueNumber) : null;
    const isBug = names(issue?.labels).includes(L.bug);
    const comments = (await gh.listComments(prNumber)) || [];
    const lastReset = comments.map((c) => (c.body || '').includes(CHECKS_RESET_MARKER)).lastIndexOf(true);
    const failures = comments.slice(lastReset + 1).filter((c) => (c.body || '').includes(CHECKS_FAILED_MARKER)).length;
    const next = afterChecks({ result, isBug, acceptanceOn: config.stages.acceptance, failures, maxLoops: config.review.maxLoops });
    log(`checks ${result} -> ${next}`);
    if (next === 'merge') return mergePr(prNumber, pr.head.sha);
    if (next === 'acceptance') {
      // No preview, nothing to try: the spec and any captures were already validated, so it goes live (owner's rule).
      if (!(await hasPreviews(prNumber))) {
        await gh.comment(prNumber, say("Les contrôles automatiques sont tous verts ✅\n\nCe projet n'a pas de preview à tester et tu as déjà validé la spec (et les captures s'il y en avait) : je mets en ligne directement."));
        return mergePr(prNumber, pr.head.sha);
      }
      // The preview can take minutes to appear: the card moves to « Teste la preview » only with the message.
      const url = await previewUrl(pr.head.sha, prNumber);
      for (const l of [L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
      await gh.addLabels(prNumber, [L.acceptance]);
      const where = url
        ? `Tu peux tester la nouvelle version ici : ${url}`
        : "Je n'ai pas trouvé de preview pour cette PR. Vérifie que Vercel est bien connecté au dépôt (voir le README).";
      await gh.comment(prNumber, say(`Les contrôles automatiques sont tous verts ✅\n\n${where}\n\nVérifie les critères d'acceptation de la spec. Réponds « ok » pour mettre en ligne, ou décris ce qui ne va pas.`));
      return;
    }
    if (next === 'fix') {
      if (!(await fireOrBlock({ stage: 'fix-checks', issue: issueNumber, pr: prNumber, extra: { checksRun: runId || null }, why: 'Un contrôle automatique a échoué' }))) return;
      await gh.removeLabel(prNumber, L.checks);
      await gh.addLabels(prNumber, [L.fixing]);
      const link = runId ? ` ([détail](https://github.com/${repo}/actions/runs/${runId}))` : '';
      const what = timedOut ? 'Les contrôles automatiques ont tourné trop longtemps (un test bloqué), je les ai arrêtés' : 'Un contrôle automatique a échoué';
      await gh.comment(prNumber, `${CHECKS_FAILED_MARKER}\n${say(`${what}${link}. L'agent corrige (tentative ${failures + 1} sur ${config.review.maxLoops}), rien à faire de ton côté.`)}`);
      return;
    }
    // blocked: the next failure count starts again from zero once the owner unblocks it.
    for (const l of [L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
    if (issueNumber) await gh.addLabels(issueNumber, [L.blocked]);
    await gh.comment(prNumber, `${CHECKS_RESET_MARKER}\n${say("Les contrôles restent rouges : j'ai mis la construction en pause et expliqué la situation sur l'issue.")}`);
    await gh.comment(issueNumber || prNumber, say(`Les contrôles automatiques échouent encore après ${config.review.maxLoops} tentatives de correction, donc je m'arrête pour ne pas tourner en rond.\n\nLe détail technique est dans la PR #${prNumber}. Tu peux répondre ici par « réessaie » pour relancer une tentative, ou me dire de simplifier la feature.`));
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

  return { handle, report, dequeue, release, fabrication, outputs };
}

function writeOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return console.log(outputs);
  for (const [k, v] of Object.entries(outputs)) appendFileSync(file, `${k}<<__EOF__\n${v}\n__EOF__\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const repo = process.env.GITHUB_REPOSITORY;
  const ownerLogin = process.env.GITHUB_REPOSITORY_OWNER;
  const gh = github({ token: process.env.GITHUB_TOKEN, repo });
  const catalog = JSON.parse(readFileSync(join(ROOT, 'packs/catalog.json'), 'utf8'));
  const file = await gh.getContent('factory.config.json');
  const raw = file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : {};
  const { config, warnings } = resolveConfig(raw, catalog);
  for (const w of warnings) console.log(`::warning::${w}`);
  const relay = createRelay({ gh, repo, config, env: process.env });
  if (command === 'decide') {
    const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    // One decision at a time in the whole repository: see lib/lock.mjs.
    await withLock(gh.queueLock, () => relay.handle(eventFromPayload(process.env.GITHUB_EVENT_NAME, payload), { ownerLogin }));
  } else if (command === 'report') {
    // A report may merge and then dequeue: same lock as the decisions.
    await withLock(gh.queueLock, () => relay.report({ result: arg('result'), pr: Number(arg('pr')), runId: process.env.GITHUB_RUN_ID, sha: arg('sha'), started: Number(arg('started')) || null }));
  } else if (command === 'release') {
    await relay.release(JSON.parse(process.env.PAYLOAD || '{}'));
  } else if (command === 'dequeue') {
    await withLock(gh.queueLock, () => relay.dequeue());
  } else {
    throw new Error(`unknown command ${command}`);
  }
  writeOutputs({ checks: 'false', agent: 'false', pr: '', payload: '', ...relay.outputs });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
