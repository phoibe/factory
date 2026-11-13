export const L = {
  feature: 'factory:feature',
  bug: 'factory:bug',
  project: 'factory:project',
  question: 'factory:question',
  audit: 'factory:audit',
  stack: 'factory:stack',
  grilling: 'factory:grilling',
  specReview: 'factory:spec-review',
  queued: 'factory:queued',
  building: 'factory:building',
  resumeQueued: 'factory:resume-queued',
  blocked: 'factory:blocked',
  running: 'factory:running',
  visualReview: 'factory:visual-review',
  checks: 'factory:checks',
  acceptance: 'factory:acceptance',
  fixing: 'factory:fixing',
  pending: 'factory:pending',
  skillsAlert: 'factory:skills-alert',
  autoGo: 'factory:auto-go',
  release: 'factory:release',
  noPick: 'factory:no-pick',
  urgent: 'factory:urgent',
  autoPicked: 'factory:auto-picked',
  close: 'factory:close',
  alreadyDone: 'factory:already-done',
  duplicate: 'factory:duplicate',
  obsolete: 'factory:obsolete',
  kept: 'factory:kept',
  // Issue #294: a merged PR whose project waits for the owner's « Mise en production », and the panel's request to send them.
  awaitingProd: 'factory:awaiting-production',
  production: 'factory:production',
  // Issue #370: the release request's second step, once the new version is online and the live site is being opened.
  releaseChecking: 'factory:release-checking',
};

// Why the agent closed a feature or bug by itself (issue #203). The label stays on the closed issue: the board shows
// the reason, and a message from the owner reopens the request.
export const CLOSE_REASONS = [L.alreadyDone, L.duplicate, L.obsolete];
export const closeReason = (labels) => CLOSE_REASONS.find((l) => (labels || []).includes(l)) || null;

// Colors and French descriptions, used to create the labels in a project.
export const LABEL_DEFS = [
  [L.feature, '1d76db', 'Nouvelle feature pour la factory'],
  [L.bug, 'd73a4a', 'Bug à corriger par la factory'],
  [L.project, '1d76db', 'Cadrage du projet : vision, périmètre et stack'],
  [L.audit, '1d76db', 'Review générale : critique et correction de tous les écrans, puis revue de tout le code'],
  [L.stack, '1d76db', 'Fiche stack technique à établir : technologies, bibliothèques et services du projet'],
  [L.question, 'd4c5f9', "Question au sujet du projet : l'agent répond sans rien modifier"],
  [L.grilling, 'fbca04', 'Questions en cours pour clarifier la feature'],
  [L.specReview, 'fbca04', 'Spec à valider : réponds « go »'],
  [L.queued, 'c5def5', "En file d'attente"],
  [L.building, '0e8a16', 'En construction'],
  [L.resumeQueued, 'c5def5', "Carte bloquée qui a reçu sa réponse : elle reprend dès qu'une place se libère"],
  [L.blocked, 'b60205', "Bloqué : l'agent a besoin de vous"],
  [L.running, 'bfdadc', 'Un agent travaille en ce moment'],
  [L.visualReview, 'fbca04', 'Captures avant/après à valider'],
  [L.checks, '5319e7', 'Contrôles automatiques en cours'],
  [L.acceptance, 'fbca04', 'Recette : teste la preview et réponds « ok »'],
  [L.fixing, 'e99695', "Correction en cours après un contrôle rouge"],
  [L.pending, 'bfdadc', "Message reçu pendant qu'un agent travaillait, traité juste après"],
  [L.autoGo, 'c2e0c6', 'Spec publiée sans validation demandée : la construction démarre seule'],
  [L.noPick, 'ededed', 'Ne jamais piocher cette fiche automatiquement'],
  [L.urgent, 'e11d48', 'Fiche à piocher en premier par la factory'],
  [L.autoPicked, 'c2e0c6', "La factory a pris cette fiche d'elle-même (place libre)"],
  [L.close, 'ededed', 'Le propriétaire abandonne cette fiche : la factory la ferme'],
  [L.alreadyDone, 'ededed', "Fermée par l'agent : déjà réglée. Écrivez dedans pour la rouvrir"],
  [L.duplicate, 'ededed', "Fermée par l'agent : en double. Écrivez dedans pour la rouvrir"],
  [L.obsolete, 'ededed', "Fermée par l'agent : obsolète. Écrivez dedans pour la rouvrir"],
  [L.kept, 'c2e0c6', "Idée de l'agent gardée par le propriétaire : la factory peut la prendre"],
  [L.awaitingProd, 'c5def5', 'Modification validée et intégrée : elle attend votre « Mise en production »'],
  [L.production, '0e8a16', 'Mise en production demandée depuis le tableau de bord'],
  [L.releaseChecking, '5319e7', 'Mise en production : vérification du site en ligne'],
  [L.skillsAlert, 'b60205', 'Un skill attendu n\'a pas été utilisé : voir la section Fabrication de la PR'],
];

export const AGENT_MARKER = '<!-- factory-agent -->';
// Issue #370: where a « Mise en production » stands and how it ended, hidden in the relay's comments on the release
// request. The board reads it: state 'deploying' | 'live' | 'nothing' | 'failed' | 'undone' | 'broken' | 'unpublished',
// with prs [{ number, title }], version, site, fix (the urgent correction), reason and todo (sentences for the owner).
export const releaseNote = (data) => `<!-- factory-release ${JSON.stringify(data).replace(/-->/g, '--\\u003e')} -->`;
export const CHECKS_FAILED_MARKER = '<!-- factory-checks-failed -->';
export const CHECKS_RESET_MARKER = '<!-- factory-checks-reset -->';
export const UPDATE_BRANCH_MARKER = '<!-- factory-update-branch -->';
export const VISUAL_OK_MARKER = '<!-- factory-visual-ok -->';
export const SESSION_MARKER = '<!-- factory-session -->';
// In a PR body: the agent says the owner has nothing to see or try (tests, refactoring, robustness).
export const NOTHING_TO_TEST_MARKER = '<!-- factory-nothing-to-test -->';
// In a PR body: the factory undoes a delivery that broke the live site. Merged as soon as its checks are green.
export const REVERT_MARKER = '<!-- factory-revert -->';
// In an issue body: written by the factory after a broken delivery. Not an idea to sort: it starts at once.
export const PROD_BUG_MARKER = '<!-- factory-prod-check -->';

// The stage that builds a card with no spec: a bug, a general review, a stack sheet, or else a feature.
export const buildStage = (labels) => (labels.includes(L.bug) ? 'bugfix' : labels.includes(L.audit) ? 'audit' : labels.includes(L.stack) ? 'stack' : 'build');

// An idea the agent proposed (its issue body carries the agent marker) that the owner has not sorted yet: it waits
// in « Idées à trier » and is never picked automatically. Writing in it, or « Garder » on the board, makes it a request.
export const isIdea = (issue) => {
  const labels = (issue?.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  return String(issue?.body || '').includes(AGENT_MARKER) && !labels.includes(L.kept);
};
