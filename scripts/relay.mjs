#!/usr/bin/env node
// The factory's orchestrator, run by .github/workflows/relay.yml on every project event.
//   node scripts/relay.mjs decide
//   node scripts/relay.mjs report --result success|failure --pr 12
//   node scripts/relay.mjs release            (end of an Actions agent run: PAYLOAD env)
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, afterChecks } from './lib/decide.mjs';
import { L, closeReason, CLOSE_REASONS, AGENT_MARKER, CHECKS_FAILED_MARKER, CHECKS_RESET_MARKER, UPDATE_BRANCH_MARKER, SESSION_MARKER, VISUAL_OK_MARKER, NOTHING_TO_TEST_MARKER, REVERT_MARKER, PROD_BUG_MARKER, isIdea } from './lib/labels.mjs';
import { runTitle, stageName } from './lib/run-title.mjs';
import { resolveConfig, parseRawConfig } from './lib/config.mjs';
import { github } from './lib/github.mjs';
import { isRateLimited } from './lib/ratelimit.mjs';
import { syncFingerprint } from './lib/fingerprint.mjs';
import { withLock } from './lib/lock.mjs';
import { mirrorAttachments } from './lib/attachments.mjs';
import { WAIT_LABELS, waitingCards, alertText, sendAlert, NOTIFIED_MARKER, notifiedKeys, notifiedComment } from './lib/notify.mjs';
import { CATCH_UP, FABRICATION_MARKER, parseJournal, smallChange, summarize, uiChanged } from './lib/fabrication.mjs';
import { readOutage, writeOutage, outageStep, isRetry, syncStep, OUTAGE_TOLD, OUTAGE_GIVE_UP_MS } from './lib/outage.mjs';

const SKILLS_FIX_MARKER = '<!-- factory-skills-fix -->';
const STEP_NAMES = { 'requesting-code-review': 'la revue de code', impeccable: 'la passe design', screenshots: 'les captures avant/après' };
// The shots table written by `shots.mjs publish` links images on this branch: its presence proves captures were shown.
const SHOTS_BRANCH = 'claude/factory-assets';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Just under the checks job's timeout-minutes (30) in relay.yml.
const CHECKS_TIMEOUT_MS = 28 * 60_000;
export const LOCK_MINUTES = 150; // longer than the agent's 120-minute job timeout
export const PROJECT_WORKFLOW = 'factory.yml';
export const MAX_BRANCH_UPDATES = 2;
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
export function redoOf(body) {
  const text = String(body || '');
  if (!text.includes(PROD_BUG_MARKER)) return null;
  const m = /<!-- factory-redo-of #(\d+) ([0-9a-f]{7,40}) -->/.exec(text);
  if (m) return { pr: Number(m[1]), sha: m[2] };
  const pr = Number(/la PR #(\d+)/.exec(text)?.[1]);
  const sha = /cherry-pick ([0-9a-f]{7,40})/.exec(text)?.[1] || null;
  return pr ? { pr, sha } : null;
}
// The deployments that are the live site (not a PR preview).
export const isLiveEnv = (env) => /^(production|github-pages)$/i.test(String(env || ''));
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

  // `freed`: an issue whose build just ended. GitHub's issue list can still show its old label for a few
  // seconds, which used to keep its place taken until the next regular tick.
  // A place is taken only while the agent builds: once the card's PR is open (checks, captures, recette), the
  // next card can start (owner's rule). A blocked card has given up its place too, until the owner answers.
  async function inFlight(freed = null) {
    const open = await gh.listIssues({ labels: L.building });
    const withPr = new Set(((await gh.listPulls?.().catch(() => null)) || []).map(prIssue).filter(Boolean));
    return (open || []).filter((i) => !i.pull_request && i.number !== freed && !withPr.has(i.number) && !names(i.labels).includes(L.blocked)).length;
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
        await fail("Je n'ai pas pu lancer l'agent sur GitHub Actions. Réécrivez votre message dans quelques minutes ; si ça se répète, vérifiez que le workflow « Factory » est activé (onglet Actions).", String(e));
      }
      return;
    }
    if (!env.FACTORY_ROUTINE_URL || !env.FACTORY_ROUTINE_TOKEN) {
      await fail("Je n'ai pas pu lancer l'agent : je ne trouve pas les secrets de la routine Claude **dans ce dépôt**.\n\n"
        + `Ouvrez https://github.com/${repo}/settings/secrets/actions (la page des secrets de ce dépôt-ci, pas de factory-template) `
        + 'et créez, dans **Repository secrets**, `FACTORY_ROUTINE_URL` et `FACTORY_ROUTINE_TOKEN` (étape 5 du README). Puis écrivez « réessaie » ici.', 'routine secrets missing');
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
        + "Ça arrive quand la limite quotidienne de lancements est atteinte. Réécrivez votre dernier message plus tard (rien n'a changé entre-temps), ou passez ce projet sur le moteur « GitHub Actions » dans le panneau.",
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
      await gh.comment(issue || pr, say(`${why}, mais je n'ai pas pu lancer l'agent (limite quotidienne de la routine Claude atteinte, ou moteur mal configuré). Répondez « réessaie » ici quand vous voulez relancer.`));
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
      await gh.comment(issue.number, say(resumed ? "Une place s'est libérée : je reprends la construction avec votre réponse." : "Une place s'est libérée : je démarre la construction."));
      free -= 1;
    }
    if (free > 0 && !failed) await autoPick(free, freed);
  }

  // With the autoPick setting on, free slots and an empty queue: starts existing issues, urgent first,
  // then bugs, then the rest, oldest first. Ideas the agent proposed are left for the owner to sort. An issue is picked only once (`auto-picked` stays on it). Never touches issues that wait for the owner or are held back.
  async function autoPick(free, freed = null) {
    if (!config.autoPick) return;
    const SKIP = [L.close, ...CLOSE_REASONS, L.noPick, L.question, L.project, L.audit, L.release, L.autoPicked, L.grilling, L.specReview, L.queued,
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
      try {
        await fireAgent({ stage, issue: issue.number, quiet: true });
      } catch (e) {
        log(`auto-pick fire failed: ${e}`);
        for (const l of claim) await gh.removeLabel(issue.number, l);
        break;
      }
      await gh.comment(issue.number, say("La factory l'a prise d'elle-même car une place était libre."));
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
    // Only the factory's own branch, in this repo, aimed at the default branch.
    if (!pr || pr.state !== 'open' || pr.draft || pr.base?.ref !== def || (pr.head?.repo?.full_name && pr.head.repo.full_name !== repo)) {
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
        await gh.comment(prNumber, `${UPDATE_BRANCH_MARKER}\n${say("Je n'ai pas pu fusionner : la branche n'est plus à jour avec la version en ligne (une autre feature est sans doute passée entre-temps). L'agent la met à jour, puis les contrôles repartent. Rien à faire de votre côté.")}`);
        return;
      }
      for (const l of [L.acceptance, L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
      if (issue) await gh.addLabels(issue, [L.blocked]);
      await gh.comment(issue || prNumber, say(`Je n'arrive pas à fusionner la PR #${prNumber} (GitHub répond : « ${String(e.message || e).slice(0, 200)} »). Ce n'est pas un problème de code : souvent une règle du dépôt (protection de branche, revue obligatoire) ou une branche impossible à remettre à jour automatiquement. Dites-moi « réessaie » une fois la règle ajustée, ou fusionnez la PR vous-même.`));
      return;
    }
    for (const l of [L.acceptance, L.checks, L.fixing, L.running, L.blocked]) await gh.removeLabel(prNumber, l);
    await afterMerge(prNumber);
    await checkLive(prNumber).catch((e) => log(`live check not started: ${e.message}`));
    await redoAfterRevert(pr).catch((e) => log(`redo after revert: ${e.message}`));
    await gh.comment(prNumber, say("C'est fusionné ✅. La version en ligne se met à jour automatiquement dans quelques minutes."));
    if (issue) for (const l of [L.building, L.blocked]) await gh.removeLabel(issue, l);
    // A merge made with the workflow's token does not close the issues the PR names (« Closes #n »): close it here.
    if (issue) await gh.closeIssue(issue).catch((e) => log(`close #${issue}: ${e.message}`));
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

  // After a merge, the live site is opened as soon as its new version is deployed (production job of relay.yml).
  // Only for a project its host deploys (Vercel, Netlify, GitHub Pages…): elsewhere there is nothing to open.
  async function checkLive(prNumber) {
    const envs = ((await gh.recentDeployments?.().catch(() => null)) || []).map((d) => d.environment);
    if (!envs.some(isLiveEnv)) return;
    const merged = await gh.getPr(prNumber);
    const sha = merged?.merge_commit_sha;
    if (!sha) return;
    const ref = (await gh.getRepo())?.default_branch || 'main';
    await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ prodCheck: { pr: prNumber, sha } }) });
    log(`live check started for #${prNumber} (${sha.slice(0, 7)})`);
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
  // Only the newest live deployment counts (a re-run adds one for the same commit), and its newest decisive status
  // (a superseded deployment ends « inactive » after its success). A failure gives the host's message and, when the
  // host is GitHub Actions, the run to re-run (issue #227).
  async function liveUrl(sha, { attempts = 30, delayMs = 20_000 } = {}) {
    for (let i = 0; i < attempts; i++) {
      const d = ((await gh.deployments(sha).catch(() => [])) || []).find((x) => isLiveEnv(x.environment));
      const last = d && ((await gh.deploymentStatuses(d.id)) || []).find((s) => ['success', 'failure', 'error'].includes(s.state));
      if (last?.state === 'success') return last.environment_url || last.target_url || config.siteUrl || null;
      if (last) {
        const runId = Number(/\/actions\/runs\/(\d+)/.exec(`${last.log_url || ''} ${last.target_url || ''}`)?.[1]) || null;
        return { failed: true, detail: String(last.description || '').slice(0, 300), runId };
      }
      if (i < attempts - 1) await sleep(delayMs);
    }
    return null;
  }

  // The host did not publish the new version: the old one still runs, nothing is broken. The publication is run
  // once more and the live site checked again; a second failure is only reported, never undone (issue #227).
  async function deployFailed({ pr: prNumber, sha, detail = '', runId = null, retried = false }) {
    if (!retried && runId && gh.rerunFailed) {
      try {
        await gh.rerunFailed(runId);
        const ref = (await gh.getRepo())?.default_branch || 'main';
        await gh.dispatch(PROJECT_WORKFLOW, ref, { payload: JSON.stringify({ prodCheck: { pr: prNumber, sha, deployRetried: true } }) });
        return log(`live deploy of #${prNumber} failed: run ${runId} re-run`);
      } catch (e) { log(`live deploy re-run failed: ${String(e.message || e).slice(0, 80)}`); }
    }
    const said = detail ? ` Son message : « ${detail} ».` : '';
    await gh.comment(prNumber, say(`Cette version n'a pas été mise en ligne : l'hébergeur refuse de la publier${retried ? ', même après une nouvelle tentative' : ''}.${said} L'ancienne version reste en ligne et marche : je ne retire rien.`));
    log(`live deploy of #${prNumber} failed, reported`);
  }

  // The live site does not work after a merge: undo the delivery at once (a PR that goes live on green checks), and
  // open an urgent bug that redoes it properly once the undo is live. Never undoes an undo.
  async function prodReport({ pr: prNumber, sha, url, result, detail = '', runId = null, git }) {
    if (result !== 'failed') return log(`live site ${result} after #${prNumber}: ${detail}`);
    const pr = await gh.getPr(prNumber);
    const link = runId ? ` ([détail](https://github.com/${repo}/actions/runs/${runId}))` : '';
    if (String(pr?.body || '').includes(REVERT_MARKER)) {
      await gh.comment(prNumber, say(`Même après ce retour en arrière, la version en ligne ne marche pas : ${detail}${link}. Le problème ne vient donc sans doute pas de la dernière livraison (hébergeur, base de données…). Je ne retire rien d'autre.`));
      return;
    }
    const branch = `claude/revert-pr-${prNumber}`;
    if (((await gh.listPulls?.().catch(() => null)) || []).some((p) => p.head?.ref === branch)) return log('already undone');
    const def = (await gh.getRepo())?.default_branch || 'main';
    git(['fetch', 'origin', def]);
    git(['checkout', '-B', branch, `origin/${def}`]);
    git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'revert', '--no-edit', sha]);
    git(['push', '--force', 'origin', `HEAD:refs/heads/${branch}`]);
    const issueNumber = prIssue(pr);
    const facts = { prNumber, issueNumber, sha, url, detail, link };
    // A relaunch after an undo that was never opened reuses the card it left behind (issue #227).
    const redo = (await findRedo(prNumber)) || await gh.createIssue(`Remettre en ligne « ${pr.title} » sans casser l'appli`, redoBody({ ...facts, undone: true }), [L.bug, L.urgent, L.kept, L.noPick]);
    let revert;
    try {
      revert = await gh.createPr(`Retirer « ${pr.title} » : la version en ligne ne marchait plus`, branch, def, [
        REVERT_MARKER,
        `${REVERT_REDO}${redo.number} -->`,
        `Retour à la version d'avant la PR #${prNumber} : après sa mise en ligne, ${detail}. Mis en ligne dès que les contrôles sont verts ; la demande #${redo.number} refait ensuite la livraison proprement.`,
      ].join('\n'));
    } catch (e) {
      // GitHub refused the undo (the repository forbids Actions to open PRs, an outage…): the card would wait in
      // no-pick forever. It starts now and repairs the live site directly.
      log(`undo of #${prNumber} refused: ${String(e.message || e).slice(0, 120)}`);
      await gh.updateIssue(redo.number, { body: redoBody({ ...facts, undone: false }) });
      await gh.comment(prNumber, say(`Après cette mise en ligne, la version en ligne ne marchait plus : ${detail}${link}.\n\nJe n'ai pas pu la retirer : GitHub a refusé que la factory ouvre le retour en arrière. La correction urgente #${redo.number} démarre donc tout de suite pour réparer directement la version en ligne. Pour que la factory puisse retirer une livraison la prochaine fois, cochez dans le dépôt : Settings → Actions → General → « Allow GitHub Actions to create and approve pull requests ».`));
      await startRedo(redo.number);
      return;
    }
    await gh.addLabels(revert.number, [L.checks]);
    await gh.dispatch(PROJECT_WORKFLOW, def, { payload: JSON.stringify({ checksFor: revert.number }) });
    await gh.comment(prNumber, say(`Après cette mise en ligne, la version en ligne ne marchait plus : ${detail}${link}.\n\nJe la retire tout de suite (PR #${revert.number}), puis la factory la refait en corrigeant le problème (#${redo.number}). Rien à faire de votre côté.`));
    log(`live site broken after #${prNumber}: undo #${revert.number}, redo #${redo.number}`);
  }

  // The card that redoes a delivery: what broke, and how to redo it. `undone`: the live site went back to the old
  // version; otherwise the delivery is still live and is repaired directly.
  function redoBody({ prNumber, issueNumber, sha, url, detail, link, undone }) {
    return [
      PROD_BUG_MARKER,
      `${REDO_OF}${prNumber} ${sha} -->`,
      `Après la mise en ligne de la PR #${prNumber}${issueNumber ? ` (demande #${issueNumber})` : ''}, la version en ligne ne marchait plus : ${detail}${link}.`,
      '',
      undone
        ? `La factory a retiré cette livraison (retour à la version d'avant). Il faut la refaire : reprends les changements de la PR #${prNumber} (\`git cherry-pick ${sha}\`), trouve pourquoi ils cassaient la version en ligne (\`${url}\`), corrige, et vérifie la version déployée de ta PR avant de la rendre.`
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
      if (names(item.labels).includes(L.running)) continue;
      const pr = await settledPr(item.number);
      if (pr?.state !== 'open' || pr.mergeable_state !== 'dirty') continue;
      if (!(await liveLabels(item.number)).includes(L.checks)) continue; // another relay run took it
      const updates = ((await gh.listComments(item.number)) || []).filter((c) => (c.body || '').includes(UPDATE_BRANCH_MARKER)).length;
      const issue = prIssue(pr);
      if (updates >= MAX_BRANCH_UPDATES) {
        await gh.removeLabel(item.number, L.checks);
        if (issue) await gh.addLabels(issue, [L.blocked]);
        await gh.comment(issue || item.number, say(`La PR #${item.number} est en conflit avec la version en ligne et l'agent n'a pas réussi à la remettre à jour. Répondez « réessaie » ici pour une nouvelle tentative.`));
        continue;
      }
      if (!(await fireOrBlock({ stage: 'update-branch', issue, pr: item.number, why: 'La branche est en conflit avec la version en ligne' }))) continue;
      await gh.removeLabel(item.number, L.checks);
      await gh.addLabels(item.number, [L.fixing]);
      await gh.comment(item.number, `${UPDATE_BRANCH_MARKER}\n${say("Les contrôles ne pouvaient pas démarrer : la branche est en conflit avec la version en ligne (une autre feature est passée entre-temps). L'agent la met à jour, puis les contrôles repartent. Rien à faire de votre côté pour l'instant.")}`);
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
    const prs = isPr ? [n] : ((await gh.listPulls?.().catch(() => null)) || []).filter((p) => linkedIssue(p.body) === n || branchIssue(p) === n).map((p) => p.number);
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
    const dropLabels = async (k) => { for (const l of (await liveLabels(k)).filter((x) => [L.building, L.blocked, L.running, L.queued, L.pending, L.fixing, L.grilling, L.specReview, L.visualReview, L.checks, L.acceptance, L.close, L.resumeQueued].includes(x))) await gh.removeLabel(k, l); };
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
    const closed = (await gh.listClosedPulls?.().catch(() => null)) || [];
    await closeMerged(closed);
    await relaunchIdle(closed, ownerLogin);
    await releaseStaleLocks(ownerLogin);
    await reportLost();
    await closeAsked(ownerLogin);
    await retryOutages();
    await syncIfBehind();
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

  // The open PR of a card that a long outage blocked (its marker says so), or null.
  async function outageBlockedPr(ev) {
    const prs = ev.kind === 'pr'
      ? [await gh.getPr(ev.number)]
      : ((await gh.listPulls?.().catch(() => null)) || []).filter((p) => linkedIssue(p.body) === ev.number || branchIssue(p) === ev.number);
    return prs.find((p) => p && p.state !== 'closed' && readOutage(p.body)?.blocked)?.number || null;
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

  // True when the factory's checks job already passed on this commit (they ran while the owner looked at the captures).
  async function checksGreen(sha) {
    const runs = (await gh.checkRuns?.(sha).catch(() => null)) || [];
    const last = runs.filter((r) => /(^|\/ )checks$/.test(r.name)).sort((a, b) => Date.parse(b.started_at || 0) - Date.parse(a.started_at || 0))[0];
    return last?.status === 'completed' && last.conclusion === 'success';
  }

  // The owner said « ok » to the captures after the last ones were posted: that « ok » is also the recette.
  const visualApproved = (comments) => {
    const shots = comments.map((c) => (c.body || '').includes(SHOTS_BRANCH)).lastIndexOf(true);
    return shots >= 0 && comments.map((c) => (c.body || '').includes(VISUAL_OK_MARKER)).lastIndexOf(true) > shots;
  };

  const lastRunningAt = async (n) => {
    const last = ((await gh.listEvents(n)) || []).filter((e) => ['labeled', 'unlabeled'].includes(e.event) && e.label?.name === L.running).pop();
    return last ? Date.parse(last.created_at) : null;
  };

  // A merge GitHub did not follow with « Closes #n » (bot merge, lost event): the issue stays open and holds a place.
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
    const building = ((await gh.listIssues({ labels: L.building })) || []).filter((i) => !i.pull_request);
    if (!building.length) return;
    const linked = new Set([...((await gh.listPulls?.().catch(() => null)) || []), ...closed].flatMap((p) => [linkedIssue(p.body), branchIssue(p)]).filter(Boolean));
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
      const stage = labels.includes(L.project) ? 'foundation' : labels.includes(L.bug) ? 'bugfix' : labels.includes(L.audit) ? 'audit' : 'build';
      try {
        await fireAgent({ stage, issue: n, extra: { relaunch: true }, quiet: true });
      } catch (e) {
        log(`guard: relaunch of #${n} failed: ${e}`);
        break; // the routine does not start: no use trying the others now
      }
      await gh.comment(n, `${HEAL_MARKER}\n${say("L'agent s'était arrêté avant d'avoir fini : je le relance là où il en était. Rien à faire de votre côté.")}`);
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
    const result = await handleEvent(ev, { ownerLogin });
    // A PR in conflict with main gets no pull_request event at all, and GitHub's scheduled tick is too rare to
    // count on (a few runs a day): every event the relay sees looks for a PR stuck that way.
    const own = ['dispatch', 'preview-check', 'prod-check'].includes(ev.kind); // the factory's own runs: nothing else to look at
    if (!own) await unstickConflicts().catch((e) => log(`conflicts: ${e.message}`));
    // For the same reason, every event also fills the free places: a feature leaving its questions (« go »), an agent's
    // comment or a label change lets a waiting card start now instead of hours later at the next tick.
    if (!own && result?.action?.type !== 'dequeue') await dequeue().catch((e) => log(`queue check: ${e.message}`));
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
      outputs[ev.kind === 'preview-check' ? 'preview' : 'production'] = JSON.stringify(ev.check);
      return { action: { type: ev.kind }, outputs };
    }
    const ctx = { inFlight: 0, lockFresh: false };
    if (ev.kind === 'replay') {
      const issue = await gh.getIssue(ev.number);
      ev = { ...ev, kind: issue?.pull_request ? 'pr' : 'issue' };
    }
    if (ev.kind !== 'none' && ev.number) {
      const live = await gh.getIssue(ev.number);
      ev = { ...ev, labels: names(live?.labels), closed: live?.state === 'closed', ...(live && ev.kind === 'pr' ? { open: live.state === 'open' } : {}) }; // webhook labels can be stale
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
        await fireAgent({ stage: action.stage, issue, pr: pr ? n : reopenedPr });
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
        const issue = linkedIssue(pr.body) || branchIssue(pr);
        for (const k of new Set([n, action.pr, issue].filter(Boolean))) await gh.removeLabel(k, L.blocked);
        await gh.updateIssue(action.pr, { body: writeOutage(pr.body, null) }); // a fresh schedule if it fails again
        await gh.addLabels(action.pr, [L.checks]);
        await gh.comment(n, say("C'est noté : je relance les contrôles automatiques."));
        outputs.checks = 'true';
        outputs.pr = String(action.pr);
        break;
      }
      case 'dequeue':
        if (ev.kind === 'tick') await heal(ownerLogin).catch((e) => log(`guard: ${e.message}`));
        await dequeue({ freed: ev.kind === 'issue' ? n : null });
        break;
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
  // `transient`: the checks failed on a passing outage (network, GitHub), not on the code (issue #213).
  async function report({ result, pr: prNumber, runId, sha, started = null, now: nowMs = now(), preview = null, transient = false }) {
    let pr = await gh.getPr(prNumber);
    if (sha && pr.head.sha !== sha) return log('stale report: the PR changed since these checks ran');
    // Same commit but cancelled: the checks hit their time limit (a hung test). Treat it as red, with its reason.
    if (result === 'cancelled' && !sha) return log('checks cancelled before they started: nothing to report');
    // A newer checks run on the same commit cancels the older one (two events asked for checks). Only a run that
    // reached the time limit is a hung test; a cancelled run that stopped early leaves the report to the newer run.
    // A run cancelled without a known start time never got going: it was replaced too.
    if (result === 'cancelled' && !(started && nowMs - started * 1000 >= CHECKS_TIMEOUT_MS)) {
      return log('checks replaced by a newer run on the same commit: it reports instead');
    }
    const timedOut = result === 'cancelled';
    if (timedOut) result = 'failure';
    if (result === 'failure' && transient && !timedOut) return onOutage(pr, nowMs);
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
      const shown = ((await gh.listComments(prNumber)) || []).some((c) => (c.body || '').includes(SHOTS_BRANCH));
      if (!shown) catchUp.push('screenshots');
    }
    if (result === 'success' && catchUp.length) {
      const done = ((await gh.listComments(prNumber)) || []).some((c) => (c.body || '').includes(SKILLS_FIX_MARKER));
      if (!done) {
        if (!(await fireOrBlock({ stage: 'skills-fix', issue: issueNumber, pr: prNumber, extra: { missing: catchUp }, why: "L'agent a sauté une étape" }))) return;
        await gh.removeLabel(prNumber, L.checks);
        await gh.addLabels(prNumber, [L.fixing]);
        const steps = catchUp.map((s) => STEP_NAMES[s]).join(' et ');
        await gh.comment(prNumber, `${SKILLS_FIX_MARKER}\n${say(`L'agent a sauté ${steps}. Il ${catchUp.length > 1 ? 'les' : 'la'} rattrape maintenant, puis les contrôles repartent : rien à faire de votre côté pour l'instant. Si ça change l'apparence, je vous remontrerai les captures.`)}`);
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
      if (!(await fireOrBlock({ stage: 'fix-checks', issue: issueNumber, pr: prNumber, extra: { preview: preview.url, previewProblem: preview.detail || null, checksRun: preview.runId || null }, why: 'La preview ne marche pas' }))) return;
      await gh.removeLabel(prNumber, L.checks);
      await gh.addLabels(prNumber, [L.fixing]);
      const link = preview.runId ? ` ([détail](https://github.com/${repo}/actions/runs/${preview.runId}))` : '';
      await gh.comment(prNumber, `${CHECKS_FAILED_MARKER}\n${say(`Avant de vous la donner, j'ai ouvert la preview : ${preview.detail || 'quelque chose ne marche pas'}${link}. L'agent corrige (tentative ${failures + 1} sur ${config.review.maxLoops}), rien à faire de votre côté.`)}`);
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
      if (!(await fireOrBlock({ stage: 'fix-checks', issue: issueNumber, pr: prNumber, extra: { checksRun: runId || null }, why: 'Un contrôle automatique a échoué' }))) return;
      await gh.removeLabel(prNumber, L.checks);
      await gh.addLabels(prNumber, [L.fixing]);
      const link = runId ? ` ([détail](https://github.com/${repo}/actions/runs/${runId}))` : '';
      const what = timedOut ? 'Les contrôles automatiques ont tourné trop longtemps (un test bloqué), je les ai arrêtés' : 'Un contrôle automatique a échoué';
      await gh.comment(prNumber, `${CHECKS_FAILED_MARKER}\n${say(`${what}${link}. L'agent corrige (tentative ${failures + 1} sur ${config.review.maxLoops}), rien à faire de votre côté.`)}`);
      return;
    }
    return blockOnRed(prNumber, issueNumber);
  }

  // Checks that failed on an outage: silent retries, then one sentence on the PR, then blocked after 3 hours. The agent
  // is never sent and no fix attempt is counted (no CHECKS_FAILED_MARKER). The first retry, about 2 minutes later, is
  // started by the report job itself once the lock is released (outputs.retryInMs); the next ones by the tick.
  async function onOutage(pr, nowMs) {
    const step = outageStep(readOutage(pr.body), { sha: pr.head.sha, now: nowMs });
    let st = step.state;
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
      await gh.comment(issueNumber || pr.number, say(`Les contrôles automatiques de la PR #${pr.number} ne passent pas depuis 3 heures à cause d'une panne de GitHub ou du réseau. Ça ne ressemble pas à un problème de code, donc je n'ai pas envoyé l'agent corriger.\n\nRépondez « réessaie » ici quand vous voulez que je relance les contrôles.`));
    } else if (step.tell) {
      await gh.comment(pr.number, say(OUTAGE_TOLD));
    }
  }

  // Still red after the last try: pause. The next failure count starts again from zero once the owner unblocks it.
  async function blockOnRed(prNumber, issueNumber) {
    for (const l of [L.checks, L.fixing]) await gh.removeLabel(prNumber, l);
    if (issueNumber) await gh.addLabels(issueNumber, [L.blocked]);
    await gh.comment(prNumber, `${CHECKS_RESET_MARKER}\n${say("Les contrôles restent rouges : j'ai mis la construction en pause et expliqué la situation sur l'issue.")}`);
    await gh.comment(issueNumber || prNumber, say(`Les contrôles automatiques échouent encore après ${config.review.maxLoops} tentatives de correction, donc je m'arrête pour ne pas tourner en rond.\n\nLe détail technique est dans la PR #${prNumber}. Vous pouvez répondre ici par « réessaie » pour relancer une tentative, ou me dire de simplifier la feature.`));
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

  return { handle, report, retrySoon, dequeue, release, fabrication, notifyWaiting, prodReport, deployFailed, liveUrl, previewWait, outputs };
}

// The smoke check's result file (smoke.mjs --out). A missing or broken file means the check could not run.
function readResult(file) {
  try { const r = JSON.parse(readFileSync(file, 'utf8')); if (['passed', 'failed', 'skipped'].includes(r.result)) return r; } catch { /* below */ }
  return { result: 'skipped', detail: "la vérification n'a pas pu tourner" };
}

function writeOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return console.log(outputs);
  for (const [k, v] of Object.entries(outputs)) appendFileSync(file, `${k}<<__EOF__\n${v}\n__EOF__\n`);
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
    await withLock(gh.queueLock, () => relay.report({ result: arg('result'), pr: Number(arg('pr')), runId: process.env.GITHUB_RUN_ID, sha: arg('sha'), started: Number(arg('started')) || null, transient: arg('transient') === 'true' }));
    await relay.retrySoon(Number(arg('pr'))); // first retry after an outage, outside the lock
    await withLock(gh.queueLock, () => relay.notifyWaiting()); // the recette may just have started waiting for the owner
  } else if (command === 'release') {
    await relay.release(JSON.parse(process.env.PAYLOAD || '{}'));
  } else if (command === 'preview-report') {
    // After the preview check (smoke.mjs): the report goes on, with the preview's result.
    const check = JSON.parse(process.env.CHECK || '{}');
    const url = arg('url') || check.url || null;
    const res = url ? readResult(arg('result-file')) : { result: 'skipped', detail: "la preview n'est pas apparue" };
    await withLock(gh.queueLock, () => relay.report({ result: 'success', pr: Number(check.pr), sha: check.sha, preview: { ...res, url, runId: process.env.GITHUB_RUN_ID } }));
    await withLock(gh.queueLock, () => relay.notifyWaiting());
  } else if (command === 'preview-url') {
    // The preview job waits for the preview here, without the queue lock: minutes that block no decision.
    const url = await relay.previewWait(JSON.parse(process.env.CHECK || '{}'));
    writeOutputs({ url: url || '' });
    return;
  } else if (command === 'live-url') {
    const check = JSON.parse(process.env.CHECK || '{}');
    const url = await relay.liveUrl(check.sha);
    writeOutputs({ url: typeof url === 'string' ? url : '', deployFailed: url?.failed ? 'true' : 'false', deployFailure: url?.failed ? JSON.stringify(url) : '' });
    return;
  } else if (command === 'prod-report') {
    const check = JSON.parse(process.env.CHECK || '{}');
    if (arg('deploy-failed') === 'true') {
      let failure = {};
      try { failure = JSON.parse(process.env.DEPLOY_FAILURE || '{}') || {}; } catch { /* no details */ }
      await withLock(gh.queueLock, () => relay.deployFailed({ pr: Number(check.pr), sha: check.sha, detail: failure.detail, runId: failure.runId, retried: Boolean(check.deployRetried) }));
      return;
    }
    const res = readResult(arg('result-file'));
    const dir = arg('dir') || '.';
    const git = (args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
    await withLock(gh.queueLock, () => relay.prodReport({ pr: Number(check.pr), sha: check.sha, url: arg('url') || '', ...res, runId: process.env.GITHUB_RUN_ID, git }));
  } else if (command === 'dequeue') {
    await withLock(gh.queueLock, () => relay.dequeue());
  } else {
    throw new Error(`unknown command ${command}`);
  }
  writeOutputs({ checks: 'false', agent: 'false', pr: '', payload: '', preview: '', production: '', ...relay.outputs });
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
