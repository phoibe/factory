// The project's trigger: its own .github/workflows/factory.yml, copied from the template at install. The factory's
// sync cannot update it (GitHub never lets a workflow's token write workflow files), so a project keeps the filter
// it was installed with, and an old one drops label events the factory now relies on, like « Garder » (issue #427).
// The panel, with the owner's token, adds the missing labels to that filter. Pure helpers, tested in
// test/panel-trigger.test.mjs.

export const TRIGGER_FILE = '.github/workflows/factory.yml';

// Labels whose arrival on an issue must wake the factory (same list as the factory's own trigger, checked by the test).
export const WAKE_LABELS = ['factory:feature', 'factory:bug', 'factory:project', 'factory:question', 'factory:audit', 'factory:stack', 'factory:kept', 'factory:blocked', 'factory:ui-polish'];

const clause = (label) => `github.event.label.name == '${label}'`;
const OPENING = "github.event_name != 'issues' || github.event.action != 'labeled'";

// Where the filter of labeled issue events sits: from its opening parenthesis to the matching closing one.
function issuesClause(text) {
  const t = String(text || '');
  const at = t.indexOf(OPENING);
  const open = at < 0 ? -1 : t.lastIndexOf('(', at);
  if (open < 0) return null;
  for (let i = open, depth = 0; i < t.length; i++) {
    if (t[i] === '(') depth++;
    else if (t[i] === ')' && --depth === 0) return { open, close: i, body: t.slice(open, i) };
  }
  return null;
}

// The waking labels this trigger drops. None when the panel does not recognise the file.
export function missingWakeLabels(text) {
  const c = issuesClause(text);
  return c ? WAKE_LABELS.filter((l) => !c.body.includes(clause(l))) : [];
}

// A trigger the panel recognises (it has the filter of labeled issue events).
export const knownTrigger = (text) => issuesClause(text) != null;

// The trigger with the missing labels added to its filter, nothing else changed; null when there is nothing to do.
export function upgradeTrigger(text) {
  const missing = missingWakeLabels(text);
  if (!missing.length) return null;
  const { close } = issuesClause(text);
  return `${text.slice(0, close)}${missing.map((l) => ` || ${clause(l)}`).join('')}${text.slice(close)}`;
}

// What the owner reads when the token may not update the trigger (it lacks the « Workflows » right).
export const TRIGGER_REFUSED = 'Ce projet n\'est pas à jour : « Garder » n\'y démarre rien tout de suite. Reconnectez-vous avec un nouveau jeton.';

// What the owner reads when the board could not wake the factory itself: one cause, one action, then when the card starts.
export function wakeErrorText(err) {
  if (err?.status === 403 || (err?.status === 404 && err?.write)) {
    return 'La carte démarrera plus tard : votre jeton n\'a pas le droit « Actions ». Reconnectez-vous avec un nouveau jeton.';
  }
  if (err?.status) return `GitHub n'a pas répondu (erreur ${err.status}) : la carte démarrera un peu plus tard.`;
  return 'Pas de connexion : la carte démarrera un peu plus tard.';
}
