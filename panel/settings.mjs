// The « Avancé » block of the settings (issue #342): folded by default, with one short line saying what is inside.
export const ADVANCED_KEY = 'factory.advanced';

const MACHINE_NAMES = { 'dev-server': 'Serveur de dev', github: 'Machines GitHub' };

// The machine this project's jobs really run on: public projects always on GitHub, « default » follows the general one.
export function effectiveMachine({ isPrivate, project, general }) {
  if (!isPrivate) return 'github';
  return !project || project === 'default' ? general : project;
}

export function advancedSummary({ machine, checksOn, checksTotal, packsOn }) {
  const checks = `${checksOn} contrôle${checksOn > 1 ? 's' : ''} sur ${checksTotal}`;
  const packs = packsOn === 0 ? 'aucun savoir-faire activé' : `${packsOn} savoir-faire activé${packsOn > 1 ? 's' : ''}`;
  return [MACHINE_NAMES[machine] || MACHINE_NAMES['dev-server'], checks, packs].join(' · ');
}
