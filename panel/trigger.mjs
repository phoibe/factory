// The project's trigger: its own .github/workflows/factory.yml, copied from the template at install. The factory's
// sync cannot update it (GitHub never lets a workflow's token write workflow files), so a project keeps the filter
// it was installed with, and an old one drops label events the factory now relies on, like « Garder » (issue #427).
// The panel, with the owner's token, adds the missing labels to that filter. Pure helpers, tested in
// test/panel-trigger.test.mjs.

export const TRIGGER_FILE = '.github/workflows/factory.yml';

// Labels whose arrival on an issue must wake the factory (same list as the factory's own trigger, checked by the test).
export const WAKE_LABELS = ['factory:feature', 'factory:bug', 'factory:project', 'factory:question', 'factory:audit', 'factory:stack', 'factory:kept', 'factory:blocked'];

const clause = (label) => `github.event.label.name == '${label}'`;
// The one line that filters labeled issue events (not the pull request one).
const filterLine = (text) => String(text || '').split('\n').findIndex((l) => l.includes("github.event_name != 'issues'") && l.includes("github.event.action != 'labeled'"));

// The waking labels this trigger drops. None when the panel does not recognise the file.
export function missingWakeLabels(text) {
  const i = filterLine(text);
  if (i < 0) return [];
  const line = String(text).split('\n')[i];
  return WAKE_LABELS.filter((l) => !line.includes(clause(l)));
}

// The trigger with the missing labels added to its filter, nothing else changed; null when there is nothing to do.
export function upgradeTrigger(text) {
  const missing = missingWakeLabels(text);
  if (!missing.length) return null;
  const lines = String(text).split('\n');
  const i = filterLine(text);
  const at = lines[i].lastIndexOf(')');
  if (at < 0) return null;
  lines[i] = `${lines[i].slice(0, at)}${missing.map((l) => ` || ${clause(l)}`).join('')}${lines[i].slice(at)}`;
  return lines.join('\n');
}

// What the owner reads when the token may not update the trigger (it lacks the « Workflows » right).
export const TRIGGER_REFUSED = 'Ce projet a une ancienne version du déclencheur de la factory : garder une idée n\'y lance rien tout de suite. Votre jeton n\'a pas le droit « Workflows » pour le mettre à jour : déconnectez-vous puis créez un nouveau jeton avec le bouton.';

// What the owner reads when the board could not wake the factory itself.
export function wakeErrorText(err) {
  const later = 'la carte démarrera à la prochaine ronde de la factory.';
  if (err?.status === 403 || (err?.status === 404 && err?.write)) {
    return `La factory n'a pas pu être réveillée : votre jeton n'a pas le droit « Actions ». Déconnectez-vous puis créez un nouveau jeton avec le bouton. En attendant, ${later}`;
  }
  if (err?.status) return `GitHub n'a pas réveillé la factory (erreur ${err.status}) : ${later}`;
  return `La factory n'a pas pu être réveillée (connexion coupée ?) : ${later}`;
}
