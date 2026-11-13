// Phone alerts (ntfy) for the cards that wait for the owner. Pure helpers, the relay does the I/O.
import { L } from './labels.mjs';

export const NOTIFIED_MARKER = '<!-- factory-notified -->';
const NTFY_URL = 'https://ntfy.sh';

// What each waiting label asks of the owner. Nothing else ever triggers an alert.
const WAITS = {
  [L.specReview]: (p) => `Spec à valider sur ${p} : répondez « go » ou vos remarques.`,
  [L.visualReview]: (p) => `Captures à valider sur ${p} : répondez « ok » ou vos remarques.`,
  [L.acceptance]: (p) => `Recette prête sur ${p} : testez, puis répondez « ok » ou ce qui ne va pas.`,
  [L.blocked]: (p) => `Carte bloquée sur ${p} : l'agent attend votre décision ou votre accord.`,
};
export const WAIT_LABELS = Object.keys(WAITS);

export const alertText = (project, label) => WAITS[label](project);

const labelsOf = (item) => (item.labels || []).map((l) => (typeof l === 'string' ? l : l.name));

// Cards (from the open-items lists of the waiting labels) that really wait for the owner: no agent working
// on them, and no spec that starts by itself without validation.
export function waitingCards(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const labels = labelsOf(item);
    if (labels.includes(L.running) || seen.has(item.number)) continue;
    const label = WAIT_LABELS.find((l) => labels.includes(l));
    if (!label) continue;
    if (label === L.specReview && labels.includes(L.autoGo)) continue;
    if (labels.includes(L.relaunch) && !labels.includes(L.blocked)) continue; // answered: its launch is being retried
    seen.add(item.number);
    out.push({ number: item.number, label, url: item.html_url, title: item.title, updated_at: item.updated_at });
  }
  return out;
}

// Sends one alert. Never throws: a failed alert must not stop the factory. Returns whether it was accepted.
export async function sendAlert({ topic, message, click, title = 'Factory', fetchImpl = fetch }) {
  if (!topic) return false;
  try {
    const res = await fetchImpl(NTFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ topic, title, message, ...(click ? { click } : {}), priority: 4 }),
    });
    return Boolean(res.ok);
  } catch {
    return false;
  }
}

// The keys of the waits already announced on a card, read from its hidden comment.
export const notifiedKeys = (body) => (/<!-- keys:([^>]*)-->/.exec(body || '')?.[1] || '').split(',').map((k) => k.trim()).filter(Boolean);
export const notifiedComment = (keys) => `${NOTIFIED_MARKER}\n<!-- factory-agent -->\n<!-- keys:${keys.join(',')}-->\n🔔 Une alerte a été envoyée sur votre téléphone.`;
