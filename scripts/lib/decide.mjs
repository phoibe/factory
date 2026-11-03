import { L } from './labels.mjs';

const APPROVALS = ['go', 'ok', 'okay', 'oui', 'yes', 'valide', 'validé', 'validée', "c'est bon", 'cest bon', 'on y va',
  'lgtm', 'parfait', 'nickel', 'top', 'ça me va', 'ca me va', 'approuvé', '👍', '✅'];
const RESERVATIONS = /\b(mais|sauf|par contre|cependant|toutefois|non|pas encore)\b|\?/;

// True when a message is a short, unconditional "yes" (e.g. "Go !", "Oui c'est bon", "👍").
export function isApproval(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[’`]/g, "'");
  if (!t || RESERVATIONS.test(t)) return false;
  if (t.split(/\s+/).length > 6) return false;
  const bare = t.replace(/^[^\p{L}\p{Extended_Pictographic}]+/u, '');
  return APPROVALS.some((a) => bare === a || bare.startsWith(a + ' ') || bare.startsWith(a + '!') || bare.startsWith(a + '.')
    || bare.startsWith(a + ',') || (/\p{Extended_Pictographic}/u.test(a) && bare.startsWith(a)));
}

const has = (labels, l) => labels.includes(l);
const ignore = (reason) => ({ type: 'ignore', reason });
const fire = (stage, extra = {}) => ({ type: 'fire', stage, add: [], remove: [], ...extra });
const STATE_LABELS = [L.grilling, L.specReview, L.queued, L.building, L.blocked];

function startIssue(ev, config, ctx) {
  if (has(ev.labels, L.bug)) {
    if (ctx.inFlight >= config.maxParallel) return { type: 'queue', add: [L.queued], remove: [], reason: 'factory pleine' };
    return fire('bugfix', { add: [L.building] });
  }
  if (config.stages.grilling) return fire('grilling', { add: [L.grilling] });
  return fire('spec');
}

function onIssue(ev, config, ctx) {
  if (ev.event === 'issues') {
    if (ev.action === 'closed') return { type: 'dequeue', reason: 'issue fermée' };
    const isFactory = has(ev.labels, L.feature) || has(ev.labels, L.bug);
    const starting = ev.action === 'opened' || (ev.action === 'labeled' && [L.feature, L.bug].includes(ev.addedLabel));
    if (!starting || !isFactory) return ignore('événement non pertinent');
    if (!ev.fromOwner) return ignore("issue ouverte par quelqu'un d'autre que le propriétaire");
    if (STATE_LABELS.some((l) => has(ev.labels, l))) return ignore('issue déjà prise en charge');
    return startIssue(ev, config, ctx);
  }
  // A comment on an issue.
  if (has(ev.labels, L.blocked)) return fire('resume');
  if (has(ev.labels, L.grilling)) return fire('grilling');
  if (has(ev.labels, L.specReview)) {
    if (!isApproval(ev.text)) return fire('spec');
    if (ctx.inFlight >= config.maxParallel) return { type: 'queue', add: [L.queued], remove: [L.specReview], reason: 'factory pleine' };
    return fire('build', { add: [L.building], remove: [L.specReview] });
  }
  if (has(ev.labels, L.queued)) return ignore("issue en file d'attente");
  if (has(ev.labels, L.building)) return fire('feedback');
  return ignore('issue hors factory');
}

function onPr(ev, config) {
  if (ev.event === 'pull_request') {
    if (ev.action === 'closed') return { type: 'dequeue', reason: 'PR fermée' };
    if (!ev.fromOwner) return ignore("PR d'un tiers");
    const checksNow = has(ev.labels, L.checks)
      && (ev.action === 'synchronize' || ev.action === 'opened' || ev.action === 'reopened' || (ev.action === 'labeled' && ev.addedLabel === L.checks));
    return checksNow ? { type: 'checks', add: [], remove: [], reason: 'PR prête pour les contrôles' } : ignore('rien à faire sur cette PR');
  }
  // A comment or a review on a PR.
  if (has(ev.labels, L.visualReview)) {
    if (isApproval(ev.text)) return { type: 'checks', add: [L.checks], remove: [L.visualReview], reason: 'captures validées' };
    return fire('visual-fix');
  }
  if (has(ev.labels, L.acceptance)) {
    if (isApproval(ev.text)) return { type: 'merge', dequeue: true, reason: 'recette validée' };
    return fire('acceptance-fix');
  }
  if (has(ev.labels, L.checks) || has(ev.labels, L.fixing)) return ignore('contrôles ou correction en cours');
  if (ev.labels.some((l) => l.startsWith('factory:'))) return fire('feedback');
  return ignore('PR hors factory');
}

// Turns one GitHub event into one factory action. Pure: all IO lives in relay.mjs.
export function decide(ev, config, ctx) {
  const isComment = ev.event === 'issue_comment' || ev.event === 'pull_request_review';
  if (isComment) {
    if (ev.fromAgent) return ignore("message de l'agent");
    if (!ev.fromOwner) return ignore("message de quelqu'un d'autre que le propriétaire");
    if (ctx.lockFresh) return ignore("un agent travaille déjà : il lira ce message avant de finir");
    if (ev.event === 'issue_comment' && ev.action !== 'created') return ignore('commentaire modifié');
    if (ev.event === 'pull_request_review' && ev.action !== 'submitted') return ignore('revue non soumise');
  }
  return ev.kind === 'pr' ? onPr(ev, config) : onIssue(ev, config, ctx);
}

// What to do once the automated checks of a PR have finished. `failures` = earlier red runs on this PR.
export function afterChecks({ result, isBug, acceptanceOn, failures, maxLoops }) {
  if (result === 'success') return isBug || !acceptanceOn ? 'merge' : 'acceptance';
  return failures >= maxLoops ? 'blocked' : 'fix';
}
