// Relaunching the agent when its start failed for a passing reason (issue #383). Pure helpers: the relay does the I/O.
// The same rhythm as the checks after an outage (lib/outage.mjs): 2 min, 10 min, then every 30 min, blocked after 3 h.
export { RELAUNCH_MARKER, readRelaunch, writeRelaunch, relaunchLine } from '../../panel/relaunch.mjs';

const MIN = 60_000;
export const RELAUNCH_RETRIES_MS = [2 * MIN, 10 * MIN];
export const RELAUNCH_SLOW_MS = 30 * MIN;
export const RELAUNCH_GIVE_UP_MS = 3 * 60 * MIN;
export const RELAUNCH_TOLD_AT = 3; // failures in a row before the owner is told (once)
export const RELAUNCH_TOLD = "Le service de Claude ne répond pas en ce moment, je réessaie tout seul, rien à faire de votre côté.";
export const RELAUNCH_BLOCKED = "Je n'arrive pas à lancer l'agent depuis 3 heures : le service de Claude ne répond pas. Je mets la carte de côté pour qu'elle ne bloque pas la file.\n\nRépondez « réessaie » ici quand vous voulez que je relance.";
// The question chat: the owner waits for an answer, one quick retry only.
export const QUESTION_RETRY_MS = 30_000;
export const QUESTION_BUSY = 'Le service de Claude est saturé, réessayez dans quelques minutes.';

// Answers of the routine that pass by themselves: timeout, too early, too many launches (daily limit), server errors
// (529: overloaded). Any other refusal is a setting to fix (token, address): retrying would change nothing.
export const isTransientStatus = (status) => [408, 425, 429].includes(Number(status)) || Number(status) >= 500;

// After a failed launch. `state`: the card's saved relaunch, if one already waits (its schedule goes on, its launch is
// replaced by the newer one). `firstInMs`: the first retry, started shortly by the job itself.
export function relaunchStep(state, { launch, now }) {
  const prev = state || { since: now, failures: 0 };
  const failures = (prev.failures || 0) + 1;
  const base = { ...launch, since: prev.since ?? now, failures, ...(prev.told ? { told: true } : {}) };
  if (now - base.since >= RELAUNCH_GIVE_UP_MS) return { state: null, action: 'block', tell: false, firstInMs: null };
  const wait = RELAUNCH_RETRIES_MS[failures - 1] ?? RELAUNCH_SLOW_MS;
  const tell = failures >= RELAUNCH_TOLD_AT && !base.told;
  return { state: { ...base, next: now + wait, ...(tell ? { told: true } : {}) }, action: 'wait', tell, firstInMs: failures === 1 ? wait : null };
}
