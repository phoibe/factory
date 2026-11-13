#!/usr/bin/env node
// The factory's orchestrator, run by .github/workflows/relay.yml on every project event.
//   node scripts/relay.mjs decide
//   node scripts/relay.mjs report --result success|failure --pr 12
//   node scripts/relay.mjs release            (end of an Actions agent run: PAYLOAD env)
import { appendFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, afterChecks } from './lib/decide.mjs';
import { L, closeReason, CLOSE_REASONS, AGENT_MARKER, CHECKS_FAILED_MARKER, CHECKS_RESET_MARKER, UPDATE_BRANCH_MARKER, SESSION_MARKER, VISUAL_OK_MARKER, NOTHING_TO_TEST_MARKER, REVERT_MARKER, PROD_BUG_MARKER, isIdea, buildStage, releaseNote } from './lib/labels.mjs';
import { runTitle, stageName } from './lib/run-title.mjs';
import { resolveConfig, parseRawConfig } from './lib/config.mjs';
import { effectiveProduction, workBranch, PREPROD_BRANCH } from './lib/config-core.mjs';
import { github } from './lib/github.mjs';
import { mergeBranchesSettling, MergeConflict } from './lib/merge-generated.mjs';
import { isRateLimited } from './lib/ratelimit.mjs';
import { syncFingerprint } from './lib/fingerprint.mjs';
import { withLock } from './lib/lock.mjs';
import { mirrorAttachments } from './lib/attachments.mjs';
import { WAIT_LABELS, waitingCards, alertText, sendAlert, NOTIFIED_MARKER, notifiedKeys, notifiedComment } from './lib/notify.mjs';
import { CATCH_UP, FABRICATION_MARKER, parseJournal, smallChange, summarize, uiChanged } from './lib/fabrication.mjs';
import { readOutage, writeOutage, outageStep, isRetry, syncStep, isNetworkFailure, OUTAGE_TOLD, SERVER_TOLD, OUTAGE_GIVE_UP_MS } from './lib/outage.mjs';
import { readRelaunch, writeRelaunch, relaunchStep, isTransientStatus, RELAUNCH_TOLD, RELAUNCH_BLOCKED, QUESTION_RETRY_MS, QUESTION_BUSY } from './lib/relaunch.mjs';
import { toJobOutput, fromJobOutput } from './lib/job-output.mjs';
import { readWatch, writeWatch, watchStep } from './lib/watch.mjs';
import { forwardedAnswer } from './lib/answer.mjs';
import { deliveryOf, DELIVERY_SECTION } from '../panel/stack.mjs';
import { CHANGELOG_PATHS, readChangelog, versionProblem, cutVersion, sectionOf, versionOf } from '../panel/changelog.mjs';
import { trustedAuthor } from './lib/trust.mjs';
import { markdownTable, brokenShotRows } from '../agent/scripts/shots.mjs';
import { readSiteTag, tagConcerned, VERSION_TAG_MARKER } from './lib/version-tag.mjs';
import { siteLink } from '../panel/lib.mjs';
import { waitedFor, mergedWaits, mergedMarker, requestState, WAITS_DONE_MARKER, RESUMED_MARKER } from './lib/waits.mjs';

const SKILLS_FIX_MARKER = '<!-- factory-skills-fix -->';
const STEP_NAMES = { 'requesting-code-review': 'la revue de code', impeccable: 'la passe design', screenshots: 'les captures avant/après' };
// The shots table written by `shots.mjs publish` links images on this branch: its presence proves captures were shown.
const SHOTS_BRANCH = 'claude/factory-assets';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Just under the checks job's timeout-minutes (30) in relay.yml.
const CHECKS_TIMEOUT_MS = 28 * 60_000;
export const LOCK_MINUTES = 150; // longer than the agent's 120-minute job timeout
export const PROJECT_WORKFLOW = 'factory.yml';
// The branch the host publishes on projects whose production waits for the owner (issue #294).
export const PROD_BRANCH = 'production';
// The card that completes an older stack sheet with its « Mise en production » section (opened once per project).
export const DELIVERY_MARKER = '<!-- factory-stack-delivery -->';

// After a merge on a project whose production is manual (its stack sheet says so): the factory stops at the merge.
export function manualMergeText() {
  return "C'est fusionné ✅. Mise en production externe : la factory s'arrête ici.";
}
export const MAX_BRANCH_UPDATES = 2;
// A branch update is marked with the commit it started from. Only the tries on the PR's current code count: a PR
// updated successfully twice (two other features merged meanwhile) is not given up on at its third conflict.
const updateMark = (sha) => `<!-- factory-update-sha:${sha || ''} -->`;
export const branchUpdates = (comments, sha) => (comments || [])
  .filter((c) => (c.body || '').includes(UPDATE_BRANCH_MARKER) && Boolean(sha) && (c.body || '').includes(updateMark(sha))).length;
// A building card with no agent, no PR and no question for this long is stuck: the guard relaunches it once.
export const IDLE_MINUTES = 30;
const HEAL_MARKER = '<!-- factory-heal -->';
// Name of the step relay.yml fails when GitHub's rate limit stopped the relay: the next tick re-runs that run.
export const RATE_LIMIT_STEP = 'Rate limited: retried at the next tick';
export const MAX_RATE_LIMIT_ATTEMPTS = 3;
// The commands whose step in relay.yml is followed by RATE_LIMIT_STEP: only they may end quietly on the limit.
export const rateLimitHandled = (command) => ['decide', 'release', 'report'].includes(command);
// A retry of checks that hit an outage, started but never reported (the run was lost): the tick starts it again then.
// Longer than the checks job's 30-minute limit.
const OUTAGE_LOST_MS = 45 * 60_000;
// Saved at the end of a request's description when the agent closes it by itself: the step to resume and its PRs.
const REOPEN_MARKER = '<!-- factory-reopen';
const REOPEN_LABELS = [L.grilling, L.specReview, L.queued, L.building, L.resumeQueued, L.autoGo];
// A PR comes back only at the steps where it waits for the owner; at any other step the end of the agent's run
// restarts its checks.
const REOPEN_PR_LABELS = [L.visualReview, L.acceptance];
const stripReopen = (body) => String(body || '').replace(/\n*<!-- factory-reopen \{.*?\} -->\s*$/s, '');
// GitHub's own close reason for each of the agent's reasons.
const CLOSE_STATE = { [L.alreadyDone]: 'completed', [L.duplicate]: 'duplicate', [L.obsolete]: 'not_planned' };
// In an undo PR's body: the issue that redoes the delivery, started once the undo is merged.
const REVERT_REDO = '<!-- factory-revert-redo #';
// On a « Remettre en ligne » card: the delivery it redoes (issue #227). Older cards only say it in their text.
const REDO_OF = '<!-- factory-redo-of #';
const RECHECK_MARKER = '<!-- factory-redo-recheck ';
const REDO_STUCK_MS = 60 * 60_000;
const STILL_LIVE = '**Mise à jour de la factory :**';
export function redoOf(body) {
  const text = String(body || '');
  if (!text.includes(PROD_BUG_MARKER)) return null;
  const m = /<!-- factory-redo-of #(\d+) ([0-9a-f]{7,40}) -->/.exec(text);
  if (m) return { pr: Number(m[1]), sha: m[2] };
  const pr = Number(/la PR #(\d+)/.exec(text)?.[1]);
  const sha = /cherry-pick ([0-9a-f]{7,40})/.exec(text)?.[1] || null;
  return pr ? { pr, sha } : null;
}
// The deployments that are the live site (not a PR preview). Vercel names it « Production », or « Production – <its
// project> » when the repository is linked to more than one Vercel project (yoldmewhen2's is « …-skyk »).
export const isLiveEnv = (env) => /^(production(\s+[–—-]\s+\S.*)?|github-pages)$/i.test(String(env || '').trim());
// The issue a factory branch was made for (claude/issue-<n>-…), even when its PR forgot « Closes #n ».
const branchIssue = (pr) => Number(/^claude\/issue-(\d+)-/.exec(pr?.head?.ref || '')?.[1]) || null;
// The issue a PR delivers: its « Closes #n », else the one its branch was made for.
const prIssue = (pr) => linkedIssue(pr?.body) || branchIssue(pr);
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

// Files a documentation PR may carry: the glossary and the decision records, nothing else.
export const isDocFile = (f) => /^(GLOSSARY(-MAP)?\.md|docs\/adr\/[^/]+\.md)$/.test(f);

export function createRelay({ gh, repo, config, env = {}, fetchImpl = fetch, now = () => Date.now(), log = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
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
  let dequeues = 0; // queue checks made during this relay run (see refilling)
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
    dequeues += 1;
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

  // The documents written during the questions (glossary, decisions) are merged as soon as their PR opens, but only
  // when it touches nothing else: a doc PR that carries code is left for the owner.
  async function mergeDocsPr(prNumber) {
    const pr = await gh.getPr(prNumber);
    const sha = pr?.head?.sha;
    const def = (await gh.getRepo?.())?.default_branch || 'main';
    // Only the factory's own branch, in this repo, aimed at the branch the factory merges into.
    if (!pr || pr.state !== 'open' || pr.draft || ![def, workBranch(config.production, def)].includes(pr.base?.ref) || (pr.head?.repo?.full_name && pr.head.repo.full_name !== repo)) {
      log(`docs PR #${prNumber}: not a plain docs PR of this repo, left alone`); return;
    }
    const list = (await gh.listPrFiles(prNumber)) || [];
    if (!list.length || !list.every((f) => f.status !== 'renamed' && !f.previous_filename && isDocFile(f.filename))) { log(`docs PR #${prNumber}: not only documents, left alone`); return; }
    try {
      await gh.merge(prNumber, sha);
      log(`docs PR #${prNumber} merged`);
    } catch (e) {
      log(`docs PR #${prNumber} not merged: ${e.message || e}`);
      await gh.comment(prNumber, say("Je n'ai pas pu fusionner ces documents (glossaire et décisions) tout seul, sans doute un conflit. Rien n'est cassé : le projet continue sans eux pour l'instant.")).catch(() => {});
    }
  }

  async function mergePr(prNumber, sha) {
    const pr = await gh.getPr(prNumber);
    const issue = prIssue(pr);
    // Where the change lands. External production (chosen in the settings, or by default when the stack sheet says
    // « Manuelle »: a merge deploys nothing, as on Pulsar Wheel): main, and the factory stops there. On approval
    // (« Sur mon accord »): preprod, until « Mise en production » merges it into main. An undo of a broken delivery
    // goes to main at once, unless other changes already wait: publishing them without the owner's accord is worse.
    const isUndo = String(pr?.body || '').includes(REVERT_MARKER);
    const othersWait = async () => ((await gh.listAwaiting?.().catch(() => [])) || []).some((p) => p.number !== prNumber && names(p.labels).includes(L.awaitingProd));
    const mode = effectiveProduction(config, config.production ? null : await readDelivery());
    const manual = mode === 'external';
    const held = mode === 'approval' && (!isUndo || await othersWait());
    const def = (await gh.getRepo?.().catch(() => null))?.default_branch || 'main';
    const target = held ? PREPROD_BRANCH : def;
    // A PR opened before the mode changed is moved onto the right branch before its merge.
    if (pr?.base?.ref && pr.base.ref !== target && [def, PREPROD_BRANCH].includes(pr.base.ref) && gh.setPrBase) {
      try {
        if (held) await ensurePreprod(def);
        await gh.setPrBase(prNumber, target);
        log(`PR #${prNumber} moved from ${pr.base.ref} to ${target}`);
      } catch (e) { log(`PR #${prNumber} not moved to ${target}: ${e.message || e}`); }
    }
    try {
      await gh.merge(prNumber, sha);
    } catch (e) {
      if (isRateLimited(e)) throw e; // not a refused merge: the event is taken up again once the limit is over
      // The merge may have gone through behind a 5xx: a merged PR is a success, not a refusal.
      const fresh = await gh.getPr(prNumber);
      if (fresh?.merged) log(`merge reported as failed (${e}) but PR #${prNumber} is merged`);
      else {
        log(`merge failed: ${e}`);
        const state = fresh?.mergeable_state;
        const head = sha || pr?.head?.sha;
        const updates = branchUpdates(await gh.listComments(prNumber), head);
        if ((state === 'behind' || state === 'dirty') && updates < MAX_BRANCH_UPDATES) {
          await fireOrBlock({ stage: 'update-branch', issue, pr: prNumber, why: 'La branche doit être mise à jour avant la fusion', then: {
            labels: [{ n: prNumber, remove: [L.acceptance, L.checks], add: [L.fixing] }],
            comments: [{ n: prNumber, body: `${UPDATE_BRANCH_MARKER}\n${updateMark(head)}\n${say("Je n'ai pas pu fusionner : la branche n'est plus à jour avec la version en ligne (une autre feature est sans doute passée entre-temps). L'agent la met à jour, puis les contrôles repartent. Rien à faire de votre côté.")}` }],
          } });
          return;
        }
        for (const l of [L.acceptance, L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
        if (issue) await gh.addLabels(issue, [L.blocked]);
        await gh.comment(issue || prNumber, say(`Je n'arrive pas à fusionner la PR #${prNumber} (GitHub répond : « ${String(e.message || e).slice(0, 200)} »). Ce n'est pas un problème de code : souvent une règle du dépôt (protection de branche, revue obligatoire) ou une branche impossible à remettre à jour automatiquement. Dites-moi « réessaie » une fois la règle ajustée, ou fusionnez la PR vous-même.`));
        return;
      }
    }
    for (const l of [L.acceptance, L.checks, L.fixing, L.running, L.blocked]) await gh.removeLabel(prNumber, l);
    await afterMerge(prNumber, { held });
    if (manual) {
      await gh.comment(prNumber, say(manualMergeText()));
    } else if (held) {
      await holdForApproval(prNumber).catch((e) => log(`hold for approval: ${e.message}`));
      await gh.comment(prNumber, say("C'est fusionné ✅. Le site en ligne ne change pas encore : cette modification attend que vous cliquiez sur « Mise en production », en haut du projet dans le tableau de bord."));
    } else {
      await followMain(prNumber).catch((e) => log(`production branch: ${e.message}`));
      await checkLive(prNumber).catch((e) => log(`live check not started: ${e.message}`));
    }
    await redoAfterRevert(pr).catch((e) => log(`redo after revert: ${e.message}`));
    if (!held && !manual) await gh.comment(prNumber, say("C'est fusionné ✅. La version en ligne se met à jour automatiquement dans quelques minutes."));
    if (issue) for (const l of [L.building, L.blocked]) await gh.removeLabel(issue, l);
    // A merge made with the workflow's token does not close the issues the PR names (« Closes #n »): close it here.
    if (issue) await gh.closeIssue(issue).catch((e) => log(`close #${issue}: ${e.message}`));
    await dequeue({ freed: issue });
    await unstickConflicts().catch((e) => log(`conflicts: ${e.message}`));
  }

  // How the project goes to production, read in its stack sheet (STACK.md, « Mise en production »). null when the sheet
  // is missing, says neither, or cannot be read: the factory then keeps its former ways (automatic).
  async function readDelivery() {
    if (!gh.getContent) return null;
    const file = await gh.getContent('STACK.md').catch(() => null);
    if (!file?.content) return null;
    return deliveryOf(Buffer.from(file.content, 'base64').toString('utf8'));
  }

  // A merge made with the workflow's own token starts no workflow, so the panel deploy (GitHub Pages) and the
  // skills sync that the push would have started are started by hand. A project without them is skipped.
  async function afterMerge(prNumber, { held = false } = {}) {
    let files = [];
    try { files = ((await gh.listPrFiles(prNumber)) || []).map((f) => f.filename); } catch { /* deploy anyway */ }
    const ref = (await gh.getRepo())?.default_branch || 'main';
    // A held change is not published: GitHub Pages is deployed at « Mise en production » instead.
    const wanted = [...(held ? [] : ['pages.yml']), ...(files.includes('factory.config.json') ? ['factory-sync.yml'] : [])];
    for (const wf of wanted) {
      try { await gh.dispatch(wf, ref, {}); } catch (e) { log(`after merge: ${wf} not started (${String(e.message || e).slice(0, 80)})`); }
    }
  }

  // ---- Production on approval (issue #294) ----
  // Validated changes are merged into `preprod`; « Mise en production » merges preprod into the default branch, which
  // the host publishes as usual: nothing to set up at the host. The `production` branch of the first version (the host
  // was set to publish it) is still moved along with main when a project has one, so that such a host keeps working.
  async function moveProduction(sha) {
    const cur = (await gh.getBranch(PROD_BRANCH).catch(() => null))?.object?.sha;
    if (cur === sha) return false;
    if (cur) await gh.updateRef(PROD_BRANCH, sha); else await gh.createRef(PROD_BRANCH, sha);
    log(`production branch moved to ${String(sha).slice(0, 7)}`);
    return true;
  }

  async function followMain(prNumber) {
    if (!gh.getBranch || !(await gh.getBranch(PROD_BRANCH).catch(() => null))) return;
    const sha = (await gh.getPr(prNumber))?.merge_commit_sha;
    if (sha) await moveProduction(sha);
  }

  // A held change: labelled for the board's button.
  async function holdForApproval(prNumber) {
    await gh.addLabels(prNumber, [L.awaitingProd]);
  }

  // The preprod branch, created on the default branch the first time it is needed.
  async function ensurePreprod(def) {
    if (await gh.getBranch(PREPROD_BRANCH).catch(() => null)) return;
    const sha = (await gh.getBranch(def))?.object?.sha;
    if (sha) { await gh.createRef(PREPROD_BRANCH, sha); log(`${PREPROD_BRANCH} created on ${def} (${sha.slice(0, 7)})`); }
  }

  // On approval, what lands on main without going through preprod (the panel's settings, the factory's own syncs) is
  // brought into preprod, so that the agent starts from it and the next « Mise en production » does not undo it.
  async function syncPreprod() {
    if (config.production !== 'approval' || !gh.mergeBranches) return;
    const def = (await gh.getRepo())?.default_branch || 'main';
    if (!(await gh.getBranch(PREPROD_BRANCH).catch(() => null))) return ensurePreprod(def);
    let res;
    try {
      res = await mergeBranchesSettling(gh, PREPROD_BRANCH, def, `chore(factory): bring ${def} into ${PREPROD_BRANCH}`, { prefer: def });
    } catch (e) {
      if (!(e instanceof MergeConflict)) throw e;
      return log(`::warning::${def} ne peut pas être ramenée dans ${PREPROD_BRANCH} : ${e.message}. Un humain doit régler ce conflit.`);
    }
    if (res?.settled) log(`${PREPROD_BRANCH}: conflit réglé sur les fichiers de la factory (${res.settled.join(', ')})`);
    if (res?.sha) log(`${def} brought into ${PREPROD_BRANCH} (${res.sha.slice(0, 7)})`);
  }

  // The project's versioned CHANGELOG on `branch`: { path, text } of the first one with a « Non publié » section.
  async function findChangelog(branch) {
    for (const path of CHANGELOG_PATHS) {
      const c = await gh.getContent(path, branch).catch(() => null);
      const text = c?.content ? Buffer.from(c.content, 'base64').toString('utf8') : null;
      if (readChangelog(text)) return { path, text };
    }
    return null;
  }
  // Cuts « Non publié » into « [version] - date » on the branch that goes live (preprod, else the default branch).
  // Returns why it cannot (a sentence for the owner), or null once the cut is committed (or was already).
  async function cutChangelog(version, ref) {
    const branch = (await gh.getBranch(PREPROD_BRANCH).catch(() => null)) ? PREPROD_BRANCH : ref;
    const cl = await findChangelog(branch);
    if (!cl) return `le numéro de version ${version} a été donné, mais le projet n'a pas de CHANGELOG avec une section « Non publié ».`;
    const problem = versionProblem(cl.text, version);
    if (problem) return `le numéro de version ne convient pas : ${problem}`;
    if (await gh.getTagRef(`v${version}`).catch(() => null)) return `le tag v${version} existe déjà.`;
    const date = new Date(now()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const text = cutVersion(cl.text, version, date);
    if (text === cl.text) return null;
    const parent = (await gh.getBranch(branch))?.object?.sha;
    const tree = await gh.createTree((await gh.getCommit(parent))?.tree?.sha, [{ path: cl.path, mode: '100644', type: 'blob', content: text }]);
    const commit = await gh.createGitCommit(`chore(release): v${version}`, tree.sha, [parent]);
    await gh.updateRef(branch, commit.sha);
    return null;
  }
  // Tags the commit that went live and publishes its notes (the CHANGELOG section). The sentence for the owner.
  async function tagRelease(version, head, ref) {
    const tag = `v${version}`;
    try {
      const notes = sectionOf((await findChangelog(ref))?.text, version);
      const obj = await gh.createTagObject(tag, `Version ${version}`, head);
      await gh.createTagRef(tag, obj.sha);
      await gh.createRelease(tag, tag, notes.slice(0, 120000));
      return `Version ${version} : le tag \`${tag}\` est posé sur ce qui part, et ses notes sont publiées dans les versions du projet.`;
    } catch (e) {
      log(`release: tag ${tag} failed (${String(e.message || e).slice(0, 120)})`);
      return `⚠️ Le tag \`${tag}\` n'a pas pu être posé (GitHub répond : « ${String(e.message || e).slice(0, 160)} »).`;
    }
  }

  const mergedAt = (p) => Date.parse(p.pull_request?.merged_at || p.merged_at || p.closed_at || 0);
  // « Mise en production » (the board's button opens an issue with L.production): every pending change goes live
  // together, the live site is checked as after any merge, and the owner is told what left.
  async function releaseToProduction(issueNumber) {
    const pending = ((await gh.listAwaiting()) || []).filter((p) => names(p.labels).includes(L.awaitingProd)).sort((a, b) => mergedAt(a) - mergedAt(b));
    const ref = (await gh.getRepo())?.default_branch || 'main';
    if (!pending.length) {
      if (issueNumber) {
        await endRelease(issueNumber, "Rien n'attendait d'être mis en production : le site en ligne est déjà à jour.", { state: 'nothing' });
      }
      return;
    }
    // The version number the owner gave in the dialog (a project whose CHANGELOG has a « Non publié » section): the
    // section is cut on preprod before it goes to main, and the release is tagged there. A refusal changes nothing.
    const version = issueNumber ? versionOf((await gh.getIssue(issueNumber))?.body) : null;
    if (version) {
      const refused = await cutChangelog(version, ref);
      if (refused) {
        const todo = 'Recliquez sur « Mise en production » avec un autre numéro.';
        await endRelease(issueNumber, `Je n'ai pas mis en production : ${refused} Rien n'a changé ; ${todo.charAt(0).toLowerCase()}${todo.slice(1)}`, { state: 'failed', reason: `${refused.charAt(0).toUpperCase()}${refused.slice(1)}`, todo });
        return;
      }
    }
    let head = null;
    let from = null;
    try {
      from = (await gh.getBranch(ref))?.object?.sha;
      if (!from) throw new Error(`branche ${ref} introuvable`);
      // preprod into main: the host publishes main. Nothing in preprod (changes merged before preprod existed): main
      // already holds them.
      const merged = (await gh.getBranch(PREPROD_BRANCH).catch(() => null))
        ? await mergeBranchesSettling(gh, ref, PREPROD_BRANCH, `Mise en production : ${pending.map((p) => `#${p.number}`).join(', ')}`, { prefer: ref })
        : null;
      head = merged?.sha || from;
      if (await gh.getBranch(PROD_BRANCH).catch(() => null)) {
        from = (await gh.getBranch(PROD_BRANCH))?.object?.sha || from;
        await moveProduction(head);
      }
    } catch (e) {
      if (issueNumber && e instanceof MergeConflict) {
        await endRelease(issueNumber, `Je n'ai pas pu mettre en production : ${PREPROD_BRANCH} et ${ref} ont modifié les mêmes fichiers, et je ne règle seul que les miens. Fichiers en conflit : ${e.files.slice(0, 10).map((f) => `\`${f}\``).join(', ')}${e.files.length > 10 ? ` (et ${e.files.length - 10} autres)` : ''}. Rien n'a changé en ligne ; il faut régler ce conflit avant de recliquer sur « Mise en production ».`,
          { state: 'failed', reason: 'Des modifications en attente touchent les mêmes fichiers que la version en ligne.', todo: 'Ce conflit doit être réglé avant de recliquer sur « Mise en production ».' });
        throw e;
      }
      if (issueNumber) {
        await endRelease(issueNumber, `Je n'ai pas pu mettre en production (GitHub répond : « ${String(e.message || e).slice(0, 200)} »). Rien n'a changé en ligne ; recliquez sur « Mise en production » dans quelques minutes.`,
          { state: 'failed', reason: 'GitHub n\'a pas répondu comme prévu.', todo: 'Recliquez sur « Mise en production » dans quelques minutes.' });
      }
      throw e;
    }
    try { await gh.dispatch('pages.yml', ref, {}); } catch (e) { log(`release: pages.yml not started (${String(e.message || e).slice(0, 80)})`); }
    const tagged = version ? await tagRelease(version, head, ref) : null;
    for (const p of pending) await gh.removeLabel(p.number, L.awaitingProd);
    const release = { from, prs: pending.map((p) => p.number), issue: issueNumber || null, ...(version ? { version } : {}) };
    const checking = await checkLive(pending.at(-1).number, head, { release }).catch((e) => { log(`live check not started: ${e.message}`); return false; });
    const list = pending.map((p) => `- ${p.title} (#${p.number})`).join('\n');
    const n = pending.length;
    const prs = pending.map((p) => ({ number: p.number, title: p.title }));
    const extra = { ...(version ? { version } : {}) };
    if (!issueNumber) return;
    // The request stays open (the board's card « en cours ») until the live site is checked: prodReport ends it.
    if (checking) {
      // Noted on the request, so that the tick checks the site again if that check never reports (issue #396).
      await noteWatch(issueNumber, { kind: 'production', check: checking, at: now(), tries: 0 }).catch((e) => log(`release watch: ${e.message}`));
      await gh.comment(issueNumber, say(`${n === 1 ? 'Cette modification part' : `Ces ${n} modifications partent`} en ligne :\n\n${list}\n\nLe site se met à jour dans quelques minutes ; je le vérifie ensuite, et je vous dis ici quand c'est fait.${tagged ? `\n\n${tagged}` : ''}\n\n${releaseNote({ state: 'deploying', prs, ...extra })}`));
      return;
    }
    // Nothing tells when the new version is online (no deployment, no site address): it cannot be checked.
    await endRelease(issueNumber, `En production ✅ : ${n === 1 ? 'cette modification part' : `ces ${n} modifications partent`} en ligne.\n\n${list}\n\nJe ne peux pas vérifier le site en ligne : l'hébergeur ne dit pas quand la nouvelle version est publiée.${tagged ? `\n\n${tagged}` : ''}`,
      { state: 'live', prs, ...extra, unchecked: true });
  }

  // The end of a « Mise en production »: the owner's message, with the outcome the board reads, then the request closes.
  // `checking`: the request may carry the second step's label (after the new version went online).
  async function endRelease(issueNumber, text, note, { checking = false } = {}) {
    if (!issueNumber) return;
    await gh.comment(issueNumber, say(`${text}\n\n${releaseNote(note)}`));
    if (checking) await gh.removeLabel(issueNumber, L.releaseChecking).catch(() => {});
    await gh.closeIssue(issueNumber).catch(() => {});
  }

  // The new version of a release is online: its card moves on to « Vérification du site en ligne » (production-step job).
  async function releaseChecking(check) {
    const n = Number(check?.release?.issue);
    if (n) await gh.addLabels(n, [L.releaseChecking]);
  }

  // The live site works (or could not be opened) after a release: « En production ✅ », only now.
  async function releaseLive({ release, url, result, detail }) {
    const prs = [];
    for (const n of release.prs || []) prs.push({ number: n, title: (await gh.getPr(n).catch(() => null))?.title || 'Modification' });
    const list = prs.map((p) => `- ${p.title} (#${p.number})`).join('\n');
    const checked = result === 'passed';
    const text = `En production ✅ : ${prs.length === 1 ? 'cette modification est' : `ces ${prs.length} modifications sont`} en ligne.\n\n${list}\n\n${checked ? 'J\'ai vérifié le site en ligne : il marche.' : `Je n'ai pas pu vérifier le site en ligne (${detail || 'vérification sautée'}).`}${url ? ` [Voir le site en ligne](${url})` : ''}`;
    await endRelease(release.issue, text, { state: 'live', prs, ...(release.version ? { version: release.version } : {}), ...(url ? { site: url } : {}), ...(checked ? {} : { unchecked: true }) }, { checking: true });
  }

  // The live site broke after a « Mise en production »: main goes back to what was live before (preprod keeps the
  // changes: nothing is lost), the released changes wait again, and an urgent bug fixes them.
  async function rollbackRelease({ release, sha, detail, runId }) {
    const link = runId ? ` ([détail](https://github.com/${repo}/actions/runs/${runId}))` : '';
    const def = (await gh.getRepo())?.default_branch || 'main';
    const legacy = await gh.getBranch(PROD_BRANCH).catch(() => null);
    const ref = legacy ? PROD_BRANCH : def;
    const prs = release.prs || [];
    // Main is only put back when it is still at the released commit: a delivery merged since would be erased.
    const head = (await gh.getBranch(ref).catch(() => null))?.object?.sha;
    if (head && sha && head !== sha) {
      const body = [AGENT_MARKER,
        `Après la mise en production${release.issue ? ` (#${release.issue})` : ''}, la version en ligne ne marchait plus : ${detail}${link}.`, '',
        `La factory n'a pas remis la version d'avant en ligne : la branche \`${ref}\` a avancé depuis la mise en production (elle est à \`${head}\`, la mise en production était \`${sha}\`), et la remettre en arrière effacerait ce qui a été livré depuis. Répare directement la version en ligne.`, '',
        `Les modifications parties sont : ${prs.map((n) => `#${n}`).join(', ') || 'aucune'} ; l'ancienne version en ligne était \`${release.from}\`. Trouve ce qui casse la version en ligne, corrige-le, et vérifie la version déployée de ta PR avant de la rendre.`].join('\n');
      const bug = await gh.createIssue("Corriger la mise en production : le site en ligne ne marchait plus", body, [L.bug, L.urgent, L.kept]);
      await endRelease(release.issue, `Après cette mise en production, le site en ligne ne marchait plus : ${detail}${link}.\n\nJe n'ai pas pu remettre la version d'avant en ligne : d'autres livraisons sont passées depuis et seraient effacées. La demande #${bug?.number} répare directement le site. Rien à faire de votre côté pour l'instant.`,
        { state: 'broken', fix: bug?.number || null, reason: detail }, { checking: true });
      if (bug?.number) await startRedo(bug.number).catch((e) => log(`correction not started: ${e.message}`));
      return log(`release broke the live site, but ${ref} moved on (${String(head).slice(0, 7)}): not rolled back`);
    }
    await gh.resetRef(ref, release.from);
    try { await gh.dispatch('pages.yml', ref, {}); } catch { /* no GitHub Pages workflow */ }
    for (const n of prs) await gh.addLabels(n, [L.awaitingProd]);
    const titles = [];
    for (const n of prs) titles.push(`- ${(await gh.getPr(n).catch(() => null))?.title || 'Modification'} (#${n})`);
    const body = [AGENT_MARKER,
      `Après la mise en production${release.issue ? ` (#${release.issue})` : ''}, la version en ligne ne marchait plus : ${detail}${link}.`, '',
      "La factory a remis en ligne la version d'avant. Les modifications parties attendent de nouveau :", '', ...titles, '',
      `Trouve laquelle casse la version en ligne (commit \`${sha}\`, l'ancienne version en ligne est \`${release.from}\`), corrige-la, et vérifie la version déployée de ta PR avant de la rendre.`].join('\n');
    const bug = await gh.createIssue("Corriger la mise en production : le site en ligne ne marchait plus", body, [L.bug, L.urgent, L.kept]);
    await endRelease(release.issue, `Après cette mise en production, le site en ligne ne marchait plus : ${detail}${link}.\n\nJ'ai remis la version d'avant en ligne. Les modifications attendent de nouveau (le bouton « Mise en production » les compte), et la demande #${bug?.number} les corrige. Rien à faire de votre côté pour l'instant.`,
      { state: 'undone', fix: bug?.number || null, reason: detail }, { checking: true });
    if (bug?.number) await startRedo(bug.number).catch((e) => log(`correction not started: ${e.message}`));
    log(`release broke the live site: production back to ${String(release.from).slice(0, 7)}`);
  }

  // After a merge, the live site is opened as soon as its new version is deployed (production job of relay.yml).
  // Only for a project its host deploys (Vercel, Netlify, GitHub Pages…): elsewhere there is nothing to open.
  // A host that tells GitHub nothing (Vercel without deployments, as on yoldmewhen2) is still checked when the site's
  // address is known (siteUrl, or the repository's website) and the host builds the project (it comments the PRs).
  async function checkLive(prNumber, releasedSha = null, extra = {}) {
    const envs = ((await gh.recentDeployments?.().catch(() => null)) || []).map((d) => d.environment);
    let url = null;
    if (!envs.some(isLiveEnv)) {
      const repoInfo = await gh.getRepo().catch(() => null);
      const site = config.siteUrl || (/^https:\/\/\S+$/.test(repoInfo?.homepage || '') ? repoInfo.homepage : null);
      const hosted = envs.some((e) => e && e !== 'github-pages') || ((await gh.listComments(prNumber).catch(() => [])) || []).some((c) => c.user?.login === 'vercel[bot]');
      if (!site || !hosted) {
        log(`live check: no live deployment${envs.length ? ` (seen: ${[...new Set(envs)].join(', ')})` : ''}${site ? '' : ', no site address'}`);
        return false;
      }
      url = site;
    }
    const sha = releasedSha || (await gh.getPr(prNumber))?.merge_commit_sha;
    if (!sha) return false;
    const ref = (await gh.getRepo())?.default_branch || 'main';
    const check = { pr: prNumber, sha, ...(url ? { url } : {}), ...extra };
    await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ prodCheck: check }) });
    log(`live check started for #${prNumber} (${sha.slice(0, 7)})${url ? ` on ${url}` : ''}`);
    return check;
  }

  // The factory undid a broken delivery (prodReport): once the undo is live, the issue that redoes it can start.
  async function redoAfterRevert(pr) {
    const n = Number(new RegExp(`${REVERT_REDO}(\\d+)`).exec(pr?.body || '')?.[1]);
    if (n) await startRedo(n);
  }

  // A « Remettre en ligne » card leaves no-pick and starts like any urgent bug (or waits first in line).
  async function startRedo(n) {
    await gh.removeLabel(n, L.noPick);
    const labels = await liveLabels(n);
    await handle({ kind: 'issue', event: 'issues', action: 'opened', number: n, labels, fromOwner: true, fromAgent: false, openedRecently: false });
  }

  // The new version of the live site, once its host reports it deployed (polls up to `attempts` × `delayMs`).
  // A deploy the host cancelled because a newer push started its own (GitHub Pages marks it "error") is not a
  // broken delivery: the newer deploy of the same environment, which contains this commit, decides instead. That
  // newer deploy is created a moment after the cancel, so a lone failure is only believed after a few polls.
  // A failure gives the host's message and, when the host is GitHub Actions, the run to re-run (issue #227). After
  // that re-run, `since` ignores the deploys made before it: the old failure must not answer for the new attempt.
  // `url`: the site's address when the host reports no deployment (checkLive). Its new version is given
  // `blindPolls` polls to go live (Vercel publishes in about a minute); smoke.mjs then retries a failure for 5 minutes.
  async function liveUrl(sha, { attempts = 30, delayMs = 20_000, lonePolls = 3, since = 0, url = null, blindPolls = 6 } = {}) {
    const outcome = async (d) => {
      const statuses = (await gh.deploymentStatuses(d.id)) || [];
      const ok = statuses.find((s) => s.state === 'success');
      if (ok) return ok.environment_url || ok.target_url || config.siteUrl || null;
      const bad = statuses.find((s) => ['failure', 'error'].includes(s.state));
      if (!bad) return undefined;
      const detail = String(bad.description || '').slice(0, 300);
      const runId = Number(/\/actions\/runs\/(\d+)/.exec(`${bad.log_url || ''} ${bad.target_url || ''}`)?.[1]) || null;
      return { failed: true, ...(detail ? { detail } : {}), ...(runId ? { runId } : {}) };
    };
    const fresh = (d) => !since || Date.parse(d.created_at || 0) >= since;
    let lone = 0;
    let seen = false; // a deployment of this commit was reported: the host is followed, never the blind wait
    let failure = { failed: true };
    for (let i = 0; i < attempts; i++) {
      let failedAlone = false; // a failure with no newer deploy that went live or is still deploying
      const live = ((await gh.deployments(sha).catch(() => [])) || []).filter((x) => isLiveEnv(x.environment) && fresh(x));
      if (live.length) seen = true;
      for (const d of live) {
        const result = await outcome(d);
        if (result === undefined) continue;
        if (!result?.failed) return result;
        // Deployment ids only grow: the highest one of the same environment is the newest.
        const newest = ((await gh.recentDeployments?.().catch(() => null)) || [])
          .filter((x) => x.environment === d.environment && Number(x.id) > Number(d.id))
          .sort((a, b) => Number(b.id) - Number(a.id))[0];
        if (!newest) { failedAlone = true; failure = result; continue; }
        const next = await outcome(newest);
        if (next?.failed) { failedAlone = true; failure = next; continue; }
        if (next !== undefined) return next;
      }
      if (url && !seen && i >= blindPolls) return url;
      lone = failedAlone ? lone + 1 : 0;
      if (failedAlone && (lone >= lonePolls || i === attempts - 1)) return failure;
      if (i < attempts - 1) await sleep(delayMs);
    }
    return null;
  }

  // The host did not publish the new version: the old one still runs, nothing is broken. The publication is run
  // once more and the live site checked again; a second failure is only reported, never undone (issue #227).
  async function deployFailed({ pr: prNumber, sha, detail = '', runId = null, retried = false, release = null }) {
    if (release?.issue && await releaseEnded(release.issue)) return log(`publication of release #${release.issue} reported late: already ended`);
    const def = (await gh.getRepo())?.default_branch || 'main';
    // After a « Mise en production » on a project of the first version (its host publishes the production branch),
    // main may already be further ahead: the production branch is the one to compare with. Otherwise main is.
    const ref = release && await gh.getBranch?.(PROD_BRANCH).catch(() => null) ? PROD_BRANCH : def;
    // A newer delivery was merged since: re-running this one would publish an older version over it, and the newer
    // one's own live check covers the site (its deploy carries this commit too).
    const head = gh.getBranch ? (await gh.getBranch(ref).catch(() => null))?.object?.sha : sha;
    const newest = !head || head === sha;
    if (!retried && runId && gh.rerunFailed && newest) {
      try {
        const retriedAt = now() - 60_000; // a minute of slack: GitHub's clock, rounded to the second
        await gh.rerunFailed(runId);
        const check = { pr: prNumber, sha, deployRetried: true, retriedAt, ...(release ? { release } : {}) };
        await gh.dispatch(PROJECT_WORKFLOW, def, { payload: JSON.stringify({ prodCheck: check }) });
        // The release's note follows the new attempt: the tick waits for it before checking again (issue #396).
        if (release?.issue) {
          const body = (await gh.getIssue(release.issue).catch(() => null))?.body;
          const st = readWatch(body);
          if (st) await noteWatch(release.issue, { ...st, check, at: now() }, body).catch((e) => log(`release watch: ${e.message}`));
        }
        return log(`live deploy of #${prNumber} failed: run ${runId} re-run`);
      } catch (e) { log(`live deploy re-run failed: ${String(e.message || e).slice(0, 80)}`); }
    }
    const said = detail ? ` Son message : « ${detail} ».` : '';
    await gh.comment(prNumber, say(`Cette version n'a pas été mise en ligne : l'hébergeur refuse de la publier${retried ? ', même après une nouvelle tentative' : ''}.${said} ${newest ? "L'ancienne version reste en ligne et marche : je ne retire rien." : 'Je ne retire rien : une livraison plus récente, qui la contient, est en cours de publication et la mettra en ligne si elle passe.'}`));
    if (release?.issue) {
      await endRelease(release.issue, `Cette mise en production n'a pas été publiée : l'hébergeur refuse de publier la nouvelle version${retried ? ', même après une nouvelle tentative' : ''}.${said} ${newest ? "L'ancienne version reste en ligne et marche." : 'Une livraison plus récente, qui la contient, est en cours de publication.'}`,
        { state: 'unpublished', reason: `L'hébergeur refuse de publier la nouvelle version${detail ? ` (« ${detail} »)` : ''}.`, todo: newest ? "L'ancienne version reste en ligne et marche." : 'Une livraison plus récente, qui la contient, est en cours de publication.' }, { checking: true });
    }
    log(`live deploy of #${prNumber} failed, reported`);
  }

  // The live site does not work after a merge: undo the delivery at once (a PR that goes live on green checks), and
  // open an urgent bug that redoes it properly once the undo is live. Never undoes an undo.
  async function prodReport({ pr: prNumber, sha, url, result, detail = '', runId = null, git, redo: stuckCard = null, release = null }) {
    if (stuckCard) return recheckedRedo(Number(stuckCard), { result, detail });
    // A release already ended (a check the tick started again, reporting after the first one): nothing more (#396).
    // Except a broken site still at the released commit (the request closed by hand): it is put back as usual.
    if (release?.issue && await releaseEnded(release.issue) && !(result === 'failed' && await liveAt(sha))) return log(`live check of release #${release.issue} reported late: already ended`);
    if (result !== 'failed' && release?.issue) return releaseLive({ release, url, result, detail });
    if (result !== 'failed') return log(`live site ${result} after #${prNumber}: ${detail}`);
    if (release?.from) return rollbackRelease({ release, sha, detail, runId });
    const pr = await gh.getPr(prNumber);
    const link = runId ? ` ([détail](https://github.com/${repo}/actions/runs/${runId}))` : '';
    if (String(pr?.body || '').includes(REVERT_MARKER)) {
      await gh.comment(prNumber, say(`Même après ce retour en arrière, la version en ligne ne marche pas : ${detail}${link}. Le problème ne vient donc sans doute pas de la dernière livraison (hébergeur, base de données…). Je ne retire rien d'autre.`));
      return;
    }
    const branch = `claude/revert-pr-${prNumber}`;
    // An undo already open is done, unless a passing error stopped the run right after opening it (no card marker):
    // then the run goes on from there, without a second undo branch.
    const open = ((await gh.listPulls?.().catch(() => null)) || []).find((p) => !fromFork(p) && p.head?.ref === branch);
    if (open && String(open.body || '').includes(REVERT_REDO)) return log('already undone');
    // A relaunch after an undo that was never opened reuses the card it left behind (issue #227); a card already
    // started (the undo was refused) repairs the live site itself: nothing more to do.
    const found = await findRedo(prNumber);
    if (found && !names(found.labels).includes(L.noPick)) return log(`redo #${found.number} already started`);
    const def = (await gh.getRepo())?.default_branch || 'main';
    const title = `Retirer « ${pr.title} » : la version en ligne ne marchait plus`;
    const why = `Retour à la version d'avant la PR #${prNumber} : après sa mise en ligne, ${detail}.`;
    const issueNumber = prIssue(pr);
    const facts = { prNumber, issueNumber, sha, url, detail, link };
    // The undo is not possible (the revert conflicts, or GitHub refuses to open its PR): nothing was undone, so no card
    // may say it was. The redo card starts at once as a normal urgent fix that repairs the live site directly.
    const cannotUndo = async (msg, { gitFailed = false } = {}) => {
      const blockedBySetting = /not permitted to create or approve pull requests/i.test(msg);
      const reason = /"message"\s*:\s*"([^"]{1,160})/.exec(msg)?.[1] || '';
      const body = redoBody({ ...facts, undone: false });
      const redo = found || await gh.createIssue(`Remettre en ligne « ${pr.title} » sans casser l'appli`, body, [L.bug, L.urgent, L.kept]);
      if (found) await gh.updateIssue(found.number, { body });
      await gh.comment(prNumber, say([
        `Après cette mise en ligne, la version en ligne ne marchait plus : ${detail}${link}.`,
        '',
        gitFailed
          ? `**Je n'ai pas pu la retirer** : le retour en arrière automatique a échoué (sans doute un conflit avec ce qui a été livré depuis). La correction urgente #${redo.number} démarre donc tout de suite pour réparer directement la version en ligne.`
          : `**Je n'ai pas pu la retirer** : GitHub a refusé que la factory ouvre le retour en arrière${blockedBySetting || !reason ? '' : ` (« ${reason} »)`}. La correction urgente #${redo.number} démarre donc tout de suite pour réparer directement la version en ligne.`,
        ...(!gitFailed && (blockedBySetting || !reason) ? ['', `Pour que la factory puisse retirer une livraison la prochaine fois : dans [Settings → Actions → General](https://github.com/${repo}/settings/actions), cochez « Allow GitHub Actions to create and approve pull requests » puis « Save ».`] : []),
      ].join('\n')));
      log(`live site broken after #${prNumber}: undo ${gitFailed ? 'failed' : 'PR refused'} (${msg.slice(0, 120)}), redo #${redo.number} started`);
      await startRedo(redo.number);
    };
    if (!open) {
      try {
        git(['fetch', 'origin', def]);
        git(['checkout', '-B', branch, `origin/${def}`]);
        git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'revert', '--no-edit', sha]);
        git(['push', '--force', 'origin', `HEAD:refs/heads/${branch}`]);
      } catch (e) {
        try { git(['revert', '--abort']); } catch { /* no revert in progress */ }
        return cannotUndo(String(e?.message || e), { gitFailed: true });
      }
    }
    // The undo PR is opened first: when GitHub refuses it (the repository does not let workflows open PRs, #231),
    // nothing was undone, so no card may say it was (#227).
    let revert = open;
    try {
      revert ??= await gh.createPr(title, branch, def, [REVERT_MARKER, why].join('\n'));
    } catch (e) {
      return cannotUndo(String(e?.message || e));
    }
    // A relaunch after an undo that was never opened reuses the card it left behind.
    const undoneBody = redoBody({ ...facts, undone: true, revert: revert.number });
    const redo = found || await gh.createIssue(`Remettre en ligne « ${pr.title} » sans casser l'appli`, undoneBody, [L.bug, L.urgent, L.kept, L.noPick]);
    if (found) await gh.updateIssue(found.number, { body: undoneBody });
    await gh.updateIssue(revert.number, { body: [
      REVERT_MARKER,
      `${REVERT_REDO}${redo.number} -->`,
      `${why} Mis en ligne dès que les contrôles sont verts ; la demande #${redo.number} refait ensuite la livraison proprement.`,
    ].join('\n') });
    await gh.addLabels(revert.number, [L.checks]);
    await gh.dispatch(PROJECT_WORKFLOW, def, { payload: JSON.stringify({ checksFor: revert.number }) });
    await gh.comment(prNumber, say(`Après cette mise en ligne, la version en ligne ne marchait plus : ${detail}${link}.\n\nJe la retire tout de suite (PR #${revert.number}), puis la factory la refait en corrigeant le problème (#${redo.number}). Rien à faire de votre côté.`));
    log(`live site broken after #${prNumber}: undo #${revert.number}, redo #${redo.number}`);
  }

  // The card that redoes a delivery: what broke, and how to redo it. `undone`: the live site went back to the old
  // version; otherwise the delivery is still live and is repaired directly.
  function redoBody({ prNumber, issueNumber, sha, url, detail, link, undone, revert = null }) {
    return [
      PROD_BUG_MARKER,
      `${REDO_OF}${prNumber} ${sha} -->`,
      `Après la mise en ligne de la PR #${prNumber}${issueNumber ? ` (demande #${issueNumber})` : ''}, la version en ligne ne marchait plus : ${detail}${link}.`,
      '',
      undone
        ? `La factory retire cette livraison (retour à la version d'avant${revert ? `, PR #${revert}` : ''}). Il faut la refaire : reprends les changements de la PR #${prNumber} (\`git cherry-pick ${sha}\`), trouve pourquoi ils cassaient la version en ligne (\`${url}\`), corrige, et vérifie la version déployée de ta PR avant de la rendre.`
        : `La factory n'a pas pu retirer cette livraison (GitHub a refusé le retour en arrière) : elle est toujours en ligne. Répare directement la version en ligne (\`${url}\`) : trouve pourquoi les changements de la PR #${prNumber} (commit \`${sha}\`) la cassent, corrige, et vérifie la version déployée de ta PR avant de la rendre.`,
    ].join('\n');
  }

  // The open card that redoes the delivery of PR `prNumber`, if any (its marker, or the sentence of older cards).
  async function findRedo(prNumber) {
    const open = (await gh.listOpenIssues?.().catch(() => null)) || [];
    return open.find((i) => !i.pull_request && redoOf(i.body)?.pr === prNumber) || null;
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
    await retryLostChecks();
    await unstickRedos().catch((e) => log(`stuck redo cards: ${e.message}`));
    await syncIfBehind();
    await ensureStackSheet().catch((e) => log(`stack sheet: ${e.message}`));
    await syncPreprod().catch((e) => log(`${PREPROD_BRANCH}: ${e.message}`));
    await syncVersionTag().catch((e) => log(`version tag: ${e.message}`));
  }

  // Issue #372: a site whose host tells GitHub nothing (external production, a silent host) says itself which commit it
  // runs. Read on every tick, it moves refs/factory/live, which the panel reads to show the production gap. A tag that
  // cannot be read removes the ref: the panel then says « version inconnue », never a stale « à jour ».
  async function syncVersionTag() {
    if (!gh.setLiveRef || !gh.getRepo) return;
    const repoInfo = await gh.getRepo();
    // The same rule as the panel's: a project it shows a line for is one the tick reads.
    const site = siteLink(config.siteUrl, repoInfo?.homepage);
    if (!site) return;
    const mode = effectiveProduction(config, config.production ? null : await readDelivery());
    const liveEnvs = mode === 'external' ? [] : ((await gh.liveDeployments()) || []).map((d) => d.environment);
    if (!tagConcerned({ mode, site, liveEnvs })) return;
    const tag = await readSiteTag(site, fetchImpl);
    const sha = (tag && (await gh.resolveCommit(tag))?.sha) || null;
    if (sha !== await gh.getLiveRef()) {
      await gh.setLiveRef(sha);
      log(`version tag: live ${sha ? sha.slice(0, 7) : 'unknown'}`);
    }
    if (!sha) await ensureVersionTagCard();
  }

  // A project concerned whose site has no tag gets one card that adds it, once (remembered in a state ref, so a card
  // closed or abandoned is never reopened by itself). Never before the project is framed, nor during its framing.
  async function ensureVersionTagCard() {
    if (!gh.getState || !gh.createIssue) return;
    if ((await gh.getState('version-tag'))?.card) return;
    if (!(await gh.getContent?.('PRODUCT.md')) && !(await gh.getContent?.('docs/PRODUCT.md'))) return;
    if (((await gh.listIssues({ labels: L.project })) || []).some((i) => !i.pull_request)) return;
    const body = [AGENT_MARKER, VERSION_TAG_MARKER,
      'Le tableau de la factory affiche sous le nom du projet si le site en ligne est à jour (« En ligne : à jour ») ou combien de modifications validées n\'y sont pas encore. Pour ce projet, l\'hébergeur ne le dit pas à GitHub : le site doit le dire lui-même, avec une **étiquette de version** invisible pour les visiteurs.', '',
      'Rien à régler de votre côté : ni serveur, ni clé d\'accès.', '',
      '### For the agent',
      '- The site publishes the commit it was built from, filled in automatically at each publication (never by hand): `<meta name="factory-version" content="<commit sha>">` in the `<head>` of the page at the site address, in the HTML as the server sends it (not added later by JavaScript), or, when that address serves no HTML page, a `factory-version.txt` file at the site root containing only the sha (full, or its first 7 characters or more).',
      '- Use what the host or the build gives (for example `VERCEL_GIT_COMMIT_SHA`, `git rev-parse HEAD` at build time). A tag that would be wrong is worse than none.',
      '- The factory reads it every 5 minutes from GitHub Actions (server side, no CORS needed) and points `refs/factory/live` at that commit.',
      '- Acceptance: after the next publication, the board shows « En ligne : à jour » under the project name.'].join('\n');
    // Remembered first: a failure once the card exists must never open another one at each tick.
    await gh.setState('version-tag', { card: 'opening' });
    let card;
    try { card = await gh.createIssue('Ajouter l\'étiquette de version au site', body, [L.feature, L.kept]); } catch (e) {
      // GitHub may have opened it all the same (the answer was lost): kept if so, otherwise tried again next tick.
      const opened = ((await gh.listIssues({ labels: L.feature, state: 'all' }).catch(() => [])) || []).find((i) => String(i.body || '').includes(VERSION_TAG_MARKER));
      await gh.setState('version-tag', opened ? { card: opened.number } : null).catch(() => {});
      throw e;
    }
    await gh.setState('version-tag', { card: card.number }).catch((e) => log(`version tag: ${e.message}`));
    log(`version tag: card #${card.number} opened`);
    const labels = await liveLabels(card.number);
    await handle({ kind: 'issue', event: 'issues', action: 'opened', number: card.number, labels, fromOwner: true, fromAgent: false, openedRecently: false });
  }

  // Issue #242: every framed project keeps a stack sheet (STACK.md). One without it gets an « Établir la fiche » card,
  // once (a card closed or abandoned is never reopened by itself), as soon as its synced agent instructions have the
  // `stack` stage, and it starts like a bug: at once, or first free place. Never while the framing is under way.
  async function ensureStackSheet() {
    if (!gh.getContent || !gh.createIssue) return;
    // A missing file is null (404); any other error throws and the guard simply tries again at the next tick.
    // The two cheap answers that settle it for good come first: the sheet exists, or its card was already opened.
    const exists = async (path) => Boolean(await gh.getContent(path));
    const sheet = await gh.getContent('STACK.md');
    if (sheet) return ensureDeliveryLine(sheet);
    if (((await gh.listIssues({ labels: L.stack, state: 'all' })) || []).length) return;
    if (!(await exists('PRODUCT.md')) && !(await exists('docs/PRODUCT.md'))) return;
    if (!(await exists('.factory/stages/stack.md'))) return;
    if (((await gh.listIssues({ labels: L.project })) || []).some((i) => !i.pull_request)) return;
    const body = [AGENT_MARKER, 'La factory établit la **fiche stack technique** de ce projet : les technologies, la façon dont les données sont stockées, les bibliothèques et les services nécessaires.', '',
      'Elle s\'affiche ensuite avec le bouton « Stack technique » du panneau, et l\'agent la tient à jour à chaque construction.'].join('\n');
    const card = await gh.createIssue('Établir la fiche stack technique', body, [L.stack, L.kept]);
    log(`stack sheet: card #${card.number} opened`);
    const labels = await liveLabels(card.number);
    await handle({ kind: 'issue', event: 'issues', action: 'opened', number: card.number, labels, fromOwner: true, fromAgent: false, openedRecently: false });
  }

  // A sheet written before the « Mise en production » section (or without a readable first line) gets one card that
  // completes it, once, as soon as the synced agent instructions know the section: the factory then knows by itself
  // whether a merge puts the project in production. Never while the framing is under way.
  async function ensureDeliveryLine(sheet) {
    if (!sheet.content || deliveryOf(Buffer.from(sheet.content, 'base64').toString('utf8'))) return;
    const stage = await gh.getContent('.factory/stages/stack.md');
    if (!stage?.content || !Buffer.from(stage.content, 'base64').toString('utf8').includes(`## ${DELIVERY_SECTION}`)) return;
    if (((await gh.listIssues({ labels: L.stack, state: 'all' })) || []).some((i) => String(i.body || '').includes(DELIVERY_MARKER))) return;
    if (((await gh.listIssues({ labels: L.project })) || []).some((i) => !i.pull_request)) return;
    const body = [AGENT_MARKER, DELIVERY_MARKER, `La factory ajoute à la fiche stack la partie « ${DELIVERY_SECTION} » : automatique ou manuelle.`].join('\n');
    const card = await gh.createIssue('Compléter la fiche stack : la mise en production', body, [L.stack, L.kept]);
    log(`stack sheet: delivery card #${card.number} opened`);
    const labels = await liveLabels(card.number);
    await handle({ kind: 'issue', event: 'issues', action: 'opened', number: card.number, labels, fromOwner: true, fromAgent: false, openedRecently: false });
  }

  // Safety net (issue #227): a « Remettre en ligne » card in no-pick for over an hour with no undo PR open would wait
  // forever. The live site is checked again (prodReport with `redo`): it works, the card is closed as obsolete;
  // it does not, the card starts. A re-check that never reports back within an hour starts the card all the same.
  async function unstickRedos() {
    const stuck = ((await gh.listIssues({ labels: L.noPick })) || []).filter((i) => !i.pull_request && redoOf(i.body)
      && now() - Date.parse(i.created_at || 0) > REDO_STUCK_MS && !names(i.labels).includes(L.running));
    let live = null;
    for (const card of stuck) {
      try {
        const { pr, sha } = redoOf(card.body);
        // Every undo of that delivery, however old (an error here skips the card until the next tick).
        const all = (await gh.pullsByHead(`claude/revert-pr-${pr}`)) || [];
        const undos = all.filter((p) => String(p.body || '').includes(`${REVERT_REDO}${card.number} -->`));
        // Any open undo of that delivery is under way, even one a passing error left without its card marker.
        if (all.some((p) => p.state === 'open')) continue;
        // The undo went live without the factory's own merge (merged by hand): the card redoes it, as planned.
        if (undos.some((p) => p.merged_at)) { await startRedo(card.number); continue; }
        const asked = Number(new RegExp(`${RECHECK_MARKER}(\\d+) -->`).exec(card.body || '')?.[1]) || 0;
        if (live === null) {
          const deploys = gh.recentDeployments ? await gh.recentDeployments() : [];
          live = (deploys || []).some((d) => isLiveEnv(d.environment));
        }
        if (asked && now() - asked > REDO_STUCK_MS || !live || !sha) {
          log(`guard: redo card #${card.number} stuck in no-pick, started`);
          await startUndoneRedo(card);
          continue;
        }
        if (asked) continue; // re-check under way
        await gh.updateIssue(card.number, { body: `${card.body}\n\n${RECHECK_MARKER}${now()} -->` });
        const ref = (await gh.getRepo())?.default_branch || 'main';
        await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ prodCheck: { pr, sha, redo: card.number } }) });
        log(`guard: redo card #${card.number} stuck in no-pick, live site checked again`);
      } catch (e) { log(`guard: redo card #${card.number}: ${String(e.message || e).slice(0, 120)}`); }
    }
  }

  // A stuck card whose undo never went live: its text (older cards) may still say the delivery was removed. The
  // agent is told it is still live, so it repairs it instead of redoing it.
  async function startUndoneRedo(card) {
    if (!String(card.body || '').includes(STILL_LIVE)) {
      await gh.updateIssue(card.number, { body: `${card.body}\n\n${STILL_LIVE} Le retour en arrière n'a pas été mis en ligne : cette livraison est toujours en ligne. Ne refais pas de cherry-pick : répare directement la version en ligne.` });
    }
    await startRedo(card.number);
  }

  // The re-check of a stuck card (unstickRedos): a live site that works means a false alarm, the card is obsolete.
  async function recheckedRedo(n, { result, detail }) {
    const card = await gh.getIssue(n);
    if (!card || card.state !== 'open' || !names(card.labels).includes(L.noPick)) return;
    if (result !== 'passed') return startUndoneRedo(card);
    await gh.comment(n, say(`Obsolète : la version en ligne marche (vérifiée à nouveau : ${detail}). Cette alerte était fausse, il n'y a rien à refaire. En cas de désaccord, écrivez ici : la demande se rouvrira et reprendra là où elle en était.`));
    await gh.removeLabel(n, L.noPick);
    await gh.addLabels(n, [L.obsolete, L.close]);
    await dropCard(n);
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

  // Issue #396: a preview or live-site check started by the factory whose report never came (its run stopped on a
  // GitHub limit, a time limit, a lost runner) left the card « en contrôle » until the owner wrote. The tick starts it
  // again, a few times, then goes on without it: the recette with whatever preview is known, or a release that ends as
  // live but unchecked. Never while an agent works on the PR, nor once the PR left its checks or changed code.
  async function liveAt(sha) {
    const ref = (await gh.getBranch?.(PROD_BRANCH).catch(() => null)) ? PROD_BRANCH : ((await gh.getRepo())?.default_branch || 'main');
    return Boolean(sha) && (await gh.getBranch?.(ref).catch(() => null))?.object?.sha === sha;
  }
  async function releaseEnded(n) {
    return (await gh.getIssue(n).catch(() => null))?.state === 'closed';
  }
  async function noteWatch(n, state, body) {
    if (!gh.updateIssue) return;
    const current = body ?? (await gh.getIssue(n))?.body;
    await gh.updateIssue(n, { body: writeWatch(current, state) });
  }
  async function retryLostChecks() {
    // One card that fails every time must not stop the rest of the guard: logged, tried again at the next tick.
    const each = async (n, fn) => { try { await fn(); } catch (e) { if (isRateLimited(e)) throw e; log(`guard: lost check of #${n}: ${e.message}`); } };
    for (const p of (await gh.listPulls?.().catch(() => null)) || []) await each(p.number, async () => {
      const st = readWatch(p.body);
      if (st?.kind !== 'preview') return;
      const step = watchStep(st, now());
      if (step === 'wait') return;
      const labels = await liveLabels(p.number);
      if (!labels.includes(L.checks) || labels.includes(L.running)) return;
      const pr = await gh.getPr(p.number);
      if (pr?.state === 'closed' || pr?.head?.sha !== st.sha) return;
      if (step === 'retry') {
        await noteWatch(p.number, { ...st, at: now(), tries: (st.tries || 0) + 1 }, pr.body);
        const ref = (await gh.getRepo())?.default_branch || 'main';
        await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ previewCheck: { pr: p.number, sha: st.sha } }) });
        log(`guard: preview check of #${p.number} never reported, started again (try ${(st.tries || 0) + 1})`);
        return;
      }
      log(`guard: preview check of #${p.number} never reported after ${st.tries} tries: the recette goes on without it`);
      const url = await previewUrl(st.sha, p.number, { attempts: 1 });
      await report({ result: 'success', pr: p.number, sha: st.sha, preview: { result: 'skipped', detail: "la vérification de la preview n'a pas pu aller au bout", url } });
    });
    for (const issue of (await gh.listIssues({ labels: L.production }).catch(() => null)) || []) await each(issue.number, async () => {
      if (issue.pull_request) return;
      const st = readWatch(issue.body);
      if (st?.kind !== 'production' || !st.check?.release) return;
      const step = watchStep(st, now());
      if (step === 'wait') return;
      if (step === 'retry') {
        await noteWatch(issue.number, { ...st, at: now(), tries: (st.tries || 0) + 1 }, issue.body);
        const ref = (await gh.getRepo())?.default_branch || 'main';
        await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ prodCheck: st.check }) });
        log(`guard: live check of release #${issue.number} never reported, started again (try ${(st.tries || 0) + 1})`);
        return;
      }
      log(`guard: live check of release #${issue.number} never reported after ${st.tries} tries: ended as unchecked`);
      await prodReport({ pr: st.check.pr, sha: st.check.sha, result: 'skipped', detail: "la vérification du site en ligne n'a pas pu aller au bout", release: st.check.release });
    });
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
    // A preview report for a PR no longer waiting for it (closed, or past its checks with no check noted) comes late:
    // the slow first run of a check the tick started again, or a duplicate. It must not move the card twice (#396).
    if (preview && (pr.state === 'closed' || (!readWatch(pr.body) && !live.includes(L.checks)))) return log('stale preview report: the PR no longer waits for it');
    // A report answers the preview check the PR waited for, or starts its cycle again: the note is cleared (issue #396).
    if (readWatch(pr.body)) {
      pr = { ...pr, body: writeWatch(pr.body, null) };
      await gh.updateIssue(prNumber, { body: pr.body });
    }
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
      // Noted first: a check whose run dies before reporting is started again by the tick (issue #396).
      await noteWatch(prNumber, { kind: 'preview', sha: pr.head.sha, at: now(), tries: 0 }, pr.body);
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
    const before = dequeues;
    const result = await step(...args);
    // Never throws, rate limit included, on purpose: the step itself is done, and re-running it would be worse.
    // The place is then filled by the next event or tick, as before #384.
    if (dequeues === before) await dequeue().catch((e) => log(`queue check: ${e.message}`));
    return result;
  };

  // The queue check after a step that ran outside the lock (release): never throws, like the one in refilling.
  const refill = () => dequeue().catch((e) => log(`queue check: ${e.message}`));

  return { handle, report: refilling(report), retrySoon, relaunchSoon, retryLaunches, dequeue, refill, release, fabrication, notifyWaiting, prodReport: refilling(prodReport), deployFailed: refilling(deployFailed), releaseChecking, liveUrl, previewWait, outputs };
}

// The smoke check's result file (smoke.mjs --out). A missing or broken file means the check could not run.
function readResult(file) {
  try { const r = JSON.parse(readFileSync(file, 'utf8')); if (['passed', 'failed', 'skipped'].includes(r.result)) return r; } catch { /* below */ }
  return { result: 'skipped', detail: "la vérification n'a pas pu tourner" };
}

// The check a dispatch asked for (decide's preview or production output, see lib/job-output.mjs).
function readCheck() {
  try { return JSON.parse(fromJobOutput(process.env.CHECK) || '{}') || {}; } catch { return {}; }
}

export function writeOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return console.log(outputs);
  for (const [k, v] of Object.entries(outputs)) {
    const eof = `ghadelim_${randomUUID()}`; // the value is raw input: a fixed delimiter could be written in it
    appendFileSync(file, `${k}<<${eof}\n${v}\n${eof}\n`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  // An empty value must never swallow the next option (« --sha --started 12 » would read « --started » as the sha).
  const arg = (name) => { const i = rest.indexOf(`--${name}`); const v = i >= 0 ? rest[i + 1] : undefined; return v?.startsWith('--') ? undefined : v; };
  const repo = process.env.GITHUB_REPOSITORY;
  const ownerLogin = process.env.GITHUB_REPOSITORY_OWNER;
  const gh = github({ token: process.env.GITHUB_TOKEN, repo });
  const catalog = JSON.parse(readFileSync(join(ROOT, 'packs/catalog.json'), 'utf8'));
  const file = await gh.getContent('factory.config.json');
  const parsed = parseRawConfig(file ? Buffer.from(file.content, 'base64').toString('utf8') : null);
  const { config, warnings } = resolveConfig(parsed.raw, catalog);
  if (parsed.warning) warnings.push(parsed.warning);
  for (const w of warnings) console.log(`::warning::${w}`);
  const relay = createRelay({ gh, repo, config, env: process.env });
  if (command === 'decide') {
    const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    // One decision at a time in the whole repository: see lib/lock.mjs.
    await withLock(gh.queueLock, () => relay.handle(eventFromPayload(process.env.GITHUB_EVENT_NAME, payload), { ownerLogin }));
  } else if (command === 'report') {
    // A report may merge and then dequeue: same lock as the decisions.
    await withLock(gh.queueLock, () => relay.report({ result: arg('result'), pr: Number(arg('pr')), runId: process.env.GITHUB_RUN_ID, sha: arg('sha'), started: Number(arg('started')) || null, transient: arg('transient') === 'server' ? 'server' : arg('transient') === 'true' }));
    await relay.retrySoon(Number(arg('pr'))); // first retry after an outage, outside the lock
    await relay.relaunchSoon(); // a fix whose launch failed for a passing reason: first relaunch, outside the lock
    await withLock(gh.queueLock, () => relay.notifyWaiting()); // the recette may just have started waiting for the owner
  } else if (command === 'release') {
    // The lock and the replay need no queue lock: done first, they never wait behind it. Then the place the run may
    // have freed is filled at once (issue #384), under the same lock as the decisions.
    await relay.release(JSON.parse(process.env.PAYLOAD || '{}'));
    await withLock(gh.queueLock, () => relay.refill()).catch((e) => console.log(`queue check after the run: ${e.message}`));
  } else if (command === 'relaunch-soon') {
    // Its own job after a decision whose launch failed for a passing reason (issue #383): the first relaunch, 2 min later.
    await relay.relaunchSoon(Number(arg('ms')) || 0);
    return;
  } else if (command === 'preview-report') {
    // After the preview check (smoke.mjs): the report goes on, with the preview's result.
    const check = readCheck();
    const url = fromJobOutput(arg('url')) || check.url || null;
    const res = url ? readResult(arg('result-file')) : { result: 'skipped', detail: "la preview n'est pas apparue" };
    await withLock(gh.queueLock, () => relay.report({ result: 'success', pr: Number(check.pr), sha: check.sha, preview: { ...res, url, runId: process.env.GITHUB_RUN_ID } }));
    await relay.relaunchSoon(); // a fix whose launch failed for a passing reason: first relaunch, outside the lock
    await withLock(gh.queueLock, () => relay.notifyWaiting());
  } else if (command === 'preview-url') {
    // The preview job waits for the preview here, without the queue lock: minutes that block no decision.
    const url = await relay.previewWait(readCheck());
    writeOutputs({ url: toJobOutput(url) });
    return;
  } else if (command === 'release-step') {
    // The new version of a release is online: move its card to « Vérification du site en ligne » (issue #370).
    await relay.releaseChecking(readCheck());
    return;
  } else if (command === 'live-url') {
    const check = readCheck();
    let url = await relay.liveUrl(check.sha, { since: Number(check.retriedAt) || 0, url: check.url || null });
    // The re-run of a failed publication published nothing at all: as good as a second failure.
    if (url === null && check.deployRetried) url = { failed: true, detail: "la nouvelle tentative n'a rien publié en 10 minutes" };
    writeOutputs({ url: toJobOutput(typeof url === 'string' ? url : ''), deployFailed: url?.failed ? 'true' : 'false', deployFailure: url?.failed ? toJobOutput(JSON.stringify(url)) : '' });
    return;
  } else if (command === 'prod-report') {
    const check = readCheck();
    // The re-check of a stuck card could not open the site: the card starts (never a re-run of an old version).
    if (check.redo && arg('deploy-failed') === 'true') {
      await withLock(gh.queueLock, () => relay.prodReport({ pr: Number(check.pr), sha: check.sha, result: 'skipped', detail: "la version en ligne n'a pas pu être ouverte", redo: check.redo }));
      return;
    }
    if (arg('deploy-failed') === 'true') {
      let failure = {};
      try { failure = JSON.parse(fromJobOutput(process.env.DEPLOY_FAILURE) || '{}') || {}; } catch { /* no details */ }
      await withLock(gh.queueLock, () => relay.deployFailed({ pr: Number(check.pr), sha: check.sha, detail: failure.detail, runId: failure.runId, retried: Boolean(check.deployRetried), release: check.release || null }));
      return;
    }
    // Issue #370: a release reached the production job without any deployment ever observed (no site opened, no
    // failure). End it as live-but-unchecked so the request closes and the button is freed, instead of staying open.
    if (!fromJobOutput(arg('url')) && check.release?.issue) {
      await withLock(gh.queueLock, () => relay.prodReport({ pr: Number(check.pr), sha: check.sha, result: 'skipped', detail: "l'hébergeur n'a pas signalé la nouvelle version", release: check.release }));
      return;
    }
    const res = readResult(arg('result-file'));
    const dir = arg('dir') || '.';
    const git = (args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
    await withLock(gh.queueLock, () => relay.prodReport({ pr: Number(check.pr), sha: check.sha, url: fromJobOutput(arg('url')), ...res, runId: process.env.GITHUB_RUN_ID, git, redo: check.redo || null, release: check.release || null }));
  } else if (command === 'dequeue') {
    await withLock(gh.queueLock, () => relay.dequeue());
  } else {
    throw new Error(`unknown command ${command}`);
  }
  writeOutputs({ checks: 'false', agent: 'false', pr: '', payload: '', preview: '', production: '', previewSha: '', productionSha: '', releaseIssue: '', checksMinutes: String(config.checksMinutes || 30), ...relay.outputs });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    // GitHub's « too many requests » for longer than a pause: the step `RATE_LIMIT_STEP` of relay.yml fails on this
    // output, and the next tick re-runs the run (retryRateLimited), so the event is taken up instead of lost.
    if (isRateLimited(e) && rateLimitHandled(process.argv[2])) { writeOutputs({ checks: 'false', agent: 'false', pr: '', payload: '', preview: '', production: '', ratelimited: 'true' }); return; }
    process.exit(1);
  });
}
