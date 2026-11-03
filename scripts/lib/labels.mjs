export const L = {
  feature: 'factory:feature',
  bug: 'factory:bug',
  grilling: 'factory:grilling',
  specReview: 'factory:spec-review',
  queued: 'factory:queued',
  building: 'factory:building',
  blocked: 'factory:blocked',
  running: 'factory:running',
  visualReview: 'factory:visual-review',
  checks: 'factory:checks',
  acceptance: 'factory:acceptance',
  fixing: 'factory:fixing',
  pending: 'factory:pending',
};

// Colors and French descriptions, used to create the labels in a project.
export const LABEL_DEFS = [
  [L.feature, '1d76db', 'Nouvelle feature pour la factory'],
  [L.bug, 'd73a4a', 'Bug à corriger par la factory'],
  [L.grilling, 'fbca04', 'Questions en cours pour clarifier la feature'],
  [L.specReview, 'fbca04', 'Spec à valider : réponds « go »'],
  [L.queued, 'c5def5', "En file d'attente"],
  [L.building, '0e8a16', 'En construction'],
  [L.blocked, 'b60205', "Bloqué : l'agent a besoin de toi"],
  [L.running, 'bfdadc', 'Un agent travaille en ce moment'],
  [L.visualReview, 'fbca04', 'Captures avant/après à valider'],
  [L.checks, '5319e7', 'Contrôles automatiques en cours'],
  [L.acceptance, 'fbca04', 'Recette : teste la preview et réponds « ok »'],
  [L.fixing, 'e99695', "Correction en cours après un contrôle rouge"],
  [L.pending, 'bfdadc', "Message reçu pendant qu'un agent travaillait, traité juste après"],
];

export const AGENT_MARKER = '<!-- factory-agent -->';
export const CHECKS_FAILED_MARKER = '<!-- factory-checks-failed -->';
export const CHECKS_RESET_MARKER = '<!-- factory-checks-reset -->';
