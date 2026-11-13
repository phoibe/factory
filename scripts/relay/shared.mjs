// Constants and small helpers shared by the parts of the relay engine (scripts/relay.mjs).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { L, AGENT_MARKER, UPDATE_BRANCH_MARKER, PROD_BUG_MARKER } from '../lib/labels.mjs';

export const SKILLS_FIX_MARKER = '<!-- factory-skills-fix -->';
export const STEP_NAMES = { 'requesting-code-review': 'la revue de code', impeccable: 'la passe design', screenshots: 'les captures avant/après' };
// The shots table written by `shots.mjs publish` links images on this branch: its presence proves captures were shown.
export const SHOTS_BRANCH = 'claude/factory-assets';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Just under the checks job's timeout-minutes (30) in relay.yml.
export const CHECKS_TIMEOUT_MS = 28 * 60_000;
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
export const updateMark = (sha) => `<!-- factory-update-sha:${sha || ''} -->`;
export const branchUpdates = (comments, sha) => (comments || [])
  .filter((c) => (c.body || '').includes(UPDATE_BRANCH_MARKER) && Boolean(sha) && (c.body || '').includes(updateMark(sha))).length;
// A building card with no agent, no PR and no question for this long is stuck: the guard relaunches it once.
export const IDLE_MINUTES = 30;
export const HEAL_MARKER = '<!-- factory-heal -->';
// Name of the step relay.yml fails when GitHub's rate limit stopped the relay: the next tick re-runs that run.
export const RATE_LIMIT_STEP = 'Rate limited: retried at the next tick';
export const MAX_RATE_LIMIT_ATTEMPTS = 3;
// The commands whose step in relay.yml is followed by RATE_LIMIT_STEP: only they may end quietly on the limit.
export const rateLimitHandled = (command) => ['decide', 'release', 'report'].includes(command);
// A retry of checks that hit an outage, started but never reported (the run was lost): the tick starts it again then.
// Longer than the checks job's 30-minute limit.
export const OUTAGE_LOST_MS = 45 * 60_000;
// Saved at the end of a request's description when the agent closes it by itself: the step to resume and its PRs.
export const REOPEN_MARKER = '<!-- factory-reopen';
export const REOPEN_LABELS = [L.grilling, L.specReview, L.queued, L.building, L.resumeQueued, L.autoGo];
// A PR comes back only at the steps where it waits for the owner; at any other step the end of the agent's run
// restarts its checks.
export const REOPEN_PR_LABELS = [L.visualReview, L.acceptance];
export const stripReopen = (body) => String(body || '').replace(/\n*<!-- factory-reopen \{.*?\} -->\s*$/s, '');
// GitHub's own close reason for each of the agent's reasons.
export const CLOSE_STATE = { [L.alreadyDone]: 'completed', [L.duplicate]: 'duplicate', [L.obsolete]: 'not_planned' };
// In an undo PR's body: the issue that redoes the delivery, started once the undo is merged.
export const REVERT_REDO = '<!-- factory-revert-redo #';
// On a « Remettre en ligne » card: the delivery it redoes (issue #227). Older cards only say it in their text.
export const REDO_OF = '<!-- factory-redo-of #';
export const RECHECK_MARKER = '<!-- factory-redo-recheck ';
export const REDO_STUCK_MS = 60 * 60_000;
export const STILL_LIVE = '**Mise à jour de la factory :**';
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
export const branchIssue = (pr) => Number(/^claude\/issue-(\d+)-/.exec(pr?.head?.ref || '')?.[1]) || null;
// The issue a PR delivers: its « Closes #n », else the one its branch was made for.
export const prIssue = (pr) => linkedIssue(pr?.body) || branchIssue(pr);
export const FOOTER = '\n\n---\n_Message automatique de la software factory_';
export const say = (text) => `${AGENT_MARKER}\n${text}${FOOTER}`;
export const names = (labels = []) => labels.map((l) => (typeof l === 'string' ? l : l.name));

export function linkedIssue(body) {
  const m = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body || '');
  return m ? Number(m[1]) : null;
}

// The preview link of the latest Vercel bot comment, once its deployment is "Ready".
export function vercelPreview(comments) {
  const body = [...comments].reverse().find((c) => c.user?.login === 'vercel[bot]')?.body || '';
  if (!/Ready\]\(|\/ready\.svg/i.test(body)) return null;
  return /\[Preview\]\((https:\/\/[^)\s]+)\)/.exec(body)?.[1] || null;
}
// Files a documentation PR may carry: the glossary and the decision records, nothing else.
export const isDocFile = (f) => /^(GLOSSARY(-MAP)?\.md|docs\/adr\/[^/]+\.md)$/.test(f);
