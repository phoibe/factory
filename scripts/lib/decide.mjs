import { L } from './labels.mjs';

// Words allowed in an approval. Every word of the message must be one of them, and one must be a "core" word,
// so "ok, le bouton en rouge" is a change request, not an approval.
const CORE = new Set(['go', 'ok', 'okay', 'oui', 'yes', 'valide', 'validé', 'validée', 'validées', 'bon', 'lgtm', 'parfait', 'nickel',
  'top', 'super', 'génial', 'accord', "d'accord", 'daccord', 'approuvé', 'approuvée', 'va', 'vas-y', 'parfaitement', 'bien', '👍', '✅', '👌', '🚀', '🙌', '👏', '💯']);
const FILLER = new Set(["c'est", 'cest', 'on', 'y', 'ça', 'ca', 'me', 'merci', 'tout', 'pour', 'moi', 'très', 'tres', 'bien', 'est',
  'vas', 'allez', 'c', 'ok!', 'beaucoup', 'là', 'la', 'alors', 'du', 'coup', 'parfait!']);

// True when a message is a short, unconditional "yes" (e.g. "Go !", "Oui c'est bon", "👍").
export function isApproval(text) {
  const t = String(text || '').toLowerCase().replace(/[’`]/g, "'");
  const words = t
    .replace(/(\p{Extended_Pictographic})/gu, ' $1 ')
    .replace(/[!.,;:()…"«»\-–—]+(?=\s|$)/g, ' ')
    .replace(/[\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > 8 || t.includes('?')) return false;
  if (!words.every((w) => CORE.has(w) || FILLER.has(w))) return false;
  return words.some((w) => CORE.has(w));
}

// True when a short message asks to drop the PR (« fermer », « on abandonne », « laisse tomber »). The agent's run
// is not allowed to close a PR, so the relay does it itself.
const DROP = new Set(['fermer', 'ferme', 'fermes', 'fermez', 'abandonner', 'abandonne', 'abandonnes', 'abandonnez', 'abandon', 'close', 'tomber']);
const DROP_FILLER = new Set(['on', 'tu', 'peux', 'la', 'le', 'cette', 'pr', 'demande', 'issue', 'et', "l'issue", 'merci', 'oui', 'ok', 'laisse',
  'laisser', 'stp', 'svp', 'tout', 'alors', 'je', 'veux', 'bien', 'les', 'deux', 'aussi', 'c', 'est', "c'est", 'bon']);
export function isDrop(text) {
  const words = String(text || '').toLowerCase().replace(/[’`]/g, "'").replace(/[!.,;:()…"«»]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 8 || String(text).includes('?')) return false;
  return words.every((w) => DROP.has(w) || DROP_FILLER.has(w)) && words.some((w) => DROP.has(w));
}

const has = (labels, l) => labels.includes(l);
const ignore = (reason) => ({ type: 'ignore', reason });
const fire = (stage, extra = {}) => ({ type: 'fire', stage, add: [], remove: [], ...extra });
const STATE_LABELS = [L.grilling, L.specReview, L.queued, L.building, L.blocked];
const isFactoryIssue = (labels) => [L.feature, L.bug, L.project, L.question, L.audit].some((l) => has(labels, l));
// A project issue (framing) always grills, whatever the config: the vision and the stack are decided there.
const grillStage = (labels) => (has(labels, L.project) ? 'framing' : 'grilling');
// The steps a factory PR can be at. An open PR with none of them (and not blocked) is stuck: no one will act on it.
const PR_STEPS = [L.visualReview, L.checks, L.fixing, L.acceptance];
// The owner answering a blocked item is what unblocks it: the factory takes the label off as the agent starts, so
// the board never keeps saying « Débloque l'agent » after the answer. The agent puts it back if it is still stuck.
const unblock = (labels) => (has(labels, L.blocked) ? [L.blocked] : []);

function startIssue(ev, config, ctx) {
  // A question is answered right away, never queued, and changes no state: each follow-up gets an answer.
  if (has(ev.labels, L.question)) return fire('question');
  if (has(ev.labels, L.project)) return fire('framing', { add: [L.grilling] });
  // A bug or a general review needs no spec: it is built right away, or queued.
  if (has(ev.labels, L.bug) || has(ev.labels, L.audit)) {
    if (ctx.inFlight >= config.maxParallel) return { type: 'queue', add: [L.queued], remove: [], reason: 'factory pleine' };
    return fire(has(ev.labels, L.bug) ? 'bugfix' : 'audit', { add: [L.building] });
  }
  if (config.stages.grilling) return fire('grilling', { add: [L.grilling] });
  return fire('spec');
}

function onIssue(ev, config, ctx) {
  if (ev.event === 'issues') {
    if (ev.action === 'closed') return { type: 'dequeue', reason: 'issue fermée' };
    // A card that gets blocked gives up its place: the queue can move on.
    if (ev.action === 'labeled' && ev.addedLabel === L.blocked && has(ev.labels, L.building)) return { type: 'dequeue', reason: 'carte bloquée : sa place est libre' };
    const starting = ev.action === 'opened' || (ev.action === 'labeled' && [L.feature, L.bug, L.project, L.question, L.audit].includes(ev.addedLabel));
    if (!starting || !isFactoryIssue(ev.labels)) return ignore('événement non pertinent');
    if (ev.action === 'labeled' && ev.openedRecently) return ignore("label posé à l'ouverture : l'ouverture s'en charge");
    if (!ev.fromOwner) return ignore("issue ouverte par quelqu'un d'autre que le propriétaire");
    if (ev.fromAgent) return ignore("issue proposée par l'agent : elle démarre quand le propriétaire y écrit");
    if (has(ev.labels, L.running) || STATE_LABELS.some((l) => has(ev.labels, l))) return ignore('issue déjà prise en charge');
    return startIssue(ev, config, ctx);
  }
  // A comment on an issue.
  if (isFactoryIssue(ev.labels) && isDrop(ev.text)) return { type: 'drop', reason: 'le propriétaire abandonne la demande' };
  if (has(ev.labels, L.blocked)) {
    // A blocked card gives up its place (it is not counted in flight): coming back, it needs one again. Only a card
    // that was building is limited; the foundation never waits, and a card blocked before the build holds no place.
    if (has(ev.labels, L.building) && !has(ev.labels, L.project) && ctx.inFlight >= config.maxParallel) {
      return { type: 'queue', add: [L.queued, L.resumeQueued], remove: [L.blocked, L.building], reason: 'carte bloquée qui reprend, factory pleine' };
    }
    return fire('resume', { remove: [L.blocked] });
  }
  if (has(ev.labels, L.grilling)) return fire(grillStage(ev.labels));
  if (has(ev.labels, L.specReview)) {
    if (has(ev.labels, L.project)) {
      // The foundation comes before any feature, so it never waits in the queue.
      if (!isApproval(ev.text)) return fire('framing');
      return fire('foundation', { add: [L.building], remove: [L.specReview] });
    }
    if (!isApproval(ev.text)) return fire('spec');
    if (ctx.inFlight >= config.maxParallel) return { type: 'queue', add: [L.queued], remove: [L.specReview], reason: 'factory pleine' };
    return fire('build', { add: [L.building], remove: [L.specReview] });
  }
  if (has(ev.labels, L.queued)) return ignore("issue en file d'attente");
  if (has(ev.labels, L.building)) return fire('feedback');
  if (isFactoryIssue(ev.labels)) return startIssue(ev, config, ctx); // e.g. an idea the agent filed
  return ignore('issue hors factory');
}

// The branch the agent opens, at the end of the questions, for the project's glossary and decisions.
export const isDocsBranch = (ref) => /^claude\/docs-\d+$/.test(String(ref || ''));

function onPr(ev) {
  if (ev.event === 'pull_request') {
    if (ev.action === 'closed') return { type: 'dequeue', reason: 'PR fermée' };
    if (!ev.fromOwner) return ignore("PR d'un tiers");
    // The glossary and decisions written during the questions travel in their own small PR: no card, no checks.
    if (isDocsBranch(ev.headRef) && ['opened', 'synchronize', 'reopened'].includes(ev.action)) return { type: 'docs-merge', add: [], remove: [], reason: 'PR de documents (glossaire et décisions)' };
    if (ev.action === 'synchronize' && has(ev.labels, L.acceptance)) {
      return { type: 'checks', add: [L.checks], remove: [L.acceptance], reason: 'nouveau code pendant la recette : on recontrôle' };
    }
    const checksNow = has(ev.labels, L.checks)
      && (ev.action === 'synchronize' || ev.action === 'opened' || ev.action === 'reopened' || (ev.action === 'labeled' && ev.addedLabel === L.checks));
    return checksNow ? { type: 'checks', add: [], remove: [], reason: 'PR prête pour les contrôles' } : ignore('rien à faire sur cette PR');
  }
  // A comment or a review on a PR.
  if (!String(ev.text || '').trim()) return ignore('message vide');
  if (ev.labels.some((l) => l.startsWith('factory:')) && isDrop(ev.text)) return { type: 'drop', reason: 'le propriétaire abandonne la PR' };
  if (has(ev.labels, L.visualReview)) {
    // One « ok » covers the captures and the recette: once the checks are green, it goes live without asking again.
    if (isApproval(ev.text)) return { type: 'visual-ok', add: [], remove: [L.visualReview, ...unblock(ev.labels)], reason: 'captures validées (vaut recette)' };
    return fire('visual-fix', { remove: unblock(ev.labels) });
  }
  if (has(ev.labels, L.acceptance)) {
    if (isApproval(ev.text)) return { type: 'merge', dequeue: true, reason: 'recette validée' };
    return fire('acceptance-fix', { remove: unblock(ev.labels) });
  }
  if (has(ev.labels, L.checks) || has(ev.labels, L.fixing)) return ignore('contrôles ou correction en cours');
  if (has(ev.labels, L.blocked)) return fire('resume', { remove: [L.blocked] });
  if (ev.labels.some((l) => l.startsWith('factory:'))) return fire('feedback');
  return ignore('PR hors factory');
}

// Turns one GitHub event into one factory action. Pure: all IO lives in relay.mjs.
export function decide(ev, config, ctx) {
  if (ev.kind === 'dispatch') return ev.payload ? { type: 'agent', reason: 'lancement de l\'agent sur GitHub Actions' } : ignore('rien à lancer');
  // Periodic safety net: a place can be freed without any event the queue listens to.
  if (ev.kind === 'tick') return { type: 'dequeue', reason: 'vérification régulière de la file' };
  if (ev.event === 'issues' && ev.action === 'unlabeled' && ev.removedLabel === L.building) {
    return { type: 'dequeue', reason: 'une place vient de se libérer' };
  }
  if ((ev.event === 'issues' || ev.event === 'pull_request') && ev.action === 'unlabeled') {
    if (ev.removedLabel !== L.running) return ignore('label retiré');
    // The agent cannot close anything (its run is refused it): it asks the factory with factory:close.
    if (has(ev.labels, L.close)) return { type: 'drop', reason: "l'agent demande de fermer la fiche" };
    if (has(ev.labels, L.pending)) return { type: 'replay', reason: "l'agent a fini : on traite le message reçu pendant son run" };
    // An agent run that leaves an open PR at no step: the owner would wait for nothing. Checks put it back on track
    // (then recette or merge), so the board and the PR's last message agree again.
    if (ev.kind === 'pr' && ev.open && !has(ev.labels, L.blocked) && !PR_STEPS.some((l) => has(ev.labels, l))) {
      return { type: 'checks', add: [L.checks], remove: [], reason: "PR laissée sans étape par l'agent : on relance les contrôles" };
    }
    // Spec published without asking for a « go » (spec validation turned off): it starts like an approved one.
    if (has(ev.labels, L.autoGo) && has(ev.labels, L.specReview)) {
      if (ctx.inFlight >= config.maxParallel) return { type: 'queue', add: [L.queued], remove: [L.specReview, L.autoGo], reason: 'spec lancée sans validation, factory pleine' };
      return fire('build', { add: [L.building], remove: [L.specReview, L.autoGo], reason: 'spec lancée sans validation (réglage)' });
    }
    return ignore('label retiré');
  }
  const isComment = ev.event === 'issue_comment' || ev.event === 'pull_request_review';
  if (isComment) {
    if (ev.fromAgent) return ignore("message de l'agent");
    if (!ev.fromOwner) return ignore("message de quelqu'un d'autre que le propriétaire");
    if (ev.event === 'issue_comment' && ev.action !== 'created') return ignore('commentaire modifié');
    if (ev.event === 'pull_request_review' && ev.action !== 'submitted') return ignore('revue non soumise');
    if (ctx.lockFresh) return { type: 'defer', add: [L.pending], remove: [], reason: 'un agent travaille : message traité dès qu\'il a fini' };
  }
  return ev.kind === 'pr' ? onPr(ev, config) : onIssue(ev, config, ctx);
}

// What to do once the automated checks of a PR have finished. `failures` = earlier red runs on this PR.
export function afterChecks({ result, isBug, acceptanceOn, failures, maxLoops }) {
  if (result === 'success') return isBug || !acceptanceOn ? 'merge' : 'acceptance';
  return failures >= maxLoops ? 'blocked' : 'fix';
}
