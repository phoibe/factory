// What a routine run is about, in words the owner recognises in the list of Claude sessions.
const STAGES = {
  grilling: 'Questions', spec: 'Spec', framing: 'Cadrage', foundation: 'Fondations', build: 'Construction',
  bugfix: 'Correction du bug', audit: 'Review générale', feedback: 'Réponse à ton message', resume: 'Reprise après blocage',
  'visual-fix': 'Retouche des captures', 'acceptance-fix': 'Correction après recette', 'fix-checks': 'Correction des contrôles',
  'update-branch': 'Mise à jour de la branche', 'skills-fix': 'Rattrapage des étapes', question: 'Discussion',
};

export const stageName = (stage) => STAGES[stage] || stage;

// « habitudes · PR #15 · Correction des contrôles » (the PR when there is one: that is the card on the board).
export function runTitle({ repo, issue, pr, stage }) {
  const where = pr ? `PR #${pr}` : issue ? `issue #${issue}` : null;
  return [repo.split('/').pop(), where, stageName(stage)].filter(Boolean).join(' · ');
}
