// Issue #557: on a public project, a request opened by an outsider never steers the factory. When the owner writes in
// it (or puts a factory label on it), the factory opens a copy of its own, holding only the visible text, starts that
// copy like one of the owner's requests, says so on the original and closes it. Each step is skipped when already
// done, so that a run replayed halfway finishes the takeover without a second copy.
import { L, AGENT_MARKER } from '../lib/labels.mjs';
import { isRateLimited } from '../lib/ratelimit.mjs';
import { visibleText } from '../lib/trust.mjs';
import { say, names } from './shared.mjs';

// First line of the copy, and the note in the factory's word on the original.
export const copyMarker = (n) => `<!-- factory-copy-of #${n} -->`;
export const copiedMarker = (n) => `<!-- factory-copied #${n} -->`;
const COPIED_RE = /<!-- factory-copied #(\d+) -->/;

export const TAKEN = (copy) => `Merci pour votre proposition. Elle est reprise dans la demande #${copy}, où la suite se passe. Je ferme celle-ci.`;
export const ALREADY = (copy) => `Cette demande est déjà reprise dans la demande #${copy} : c'est là que la suite se passe.`;
export const COPY_FAILED = "Je n'ai pas pu créer la copie de cette demande : GitHub n'a pas répondu. Elle reste ouverte ; réécrivez ici pour réessayer.";

const KINDS = [L.feature, L.bug, L.project, L.question];

// The copy's description: its marker, where it comes from (the login without @: nobody is notified), the visible text
// of the original, then the owner's message when he wrote one.
export function copyBody({ repo, original, message }) {
  const n = original.number;
  const lines = [copyMarker(n), `Reprise de la demande [#${n}](https://github.com/${repo}/issues/${n}) de ${original.user?.login || 'ghost'}.`, '', visibleText(original.body)];
  const said = visibleText(message);
  if (said) lines.push('', '---', '', '**Votre message :**', '', said);
  return lines.join('\n');
}

export function takeoverPart(ctx) {
  const { gh, repo } = ctx;
  const handleEvent = (...a) => ctx.handleEvent(...a);
  const liveLabels = (...a) => ctx.liveLabels(...a);

  // The copy of request #n: the one named in the factory's word on it (told), else an open issue of the factory's
  // whose description starts from it (a run stopped before the word was posted).
  async function findCopy(n) {
    for (const c of await gh.listComments(n)) {
      const body = String(c?.body || '');
      const m = body.includes(AGENT_MARKER) && COPIED_RE.exec(body);
      if (m) return { number: Number(m[1]), told: true };
    }
    const open = await gh.listOpenIssues();
    const copy = (open || []).find((i) => !i.pull_request && !i.untrusted && String(i.body || '').includes(copyMarker(n)));
    return copy ? { number: copy.number, told: false } : null;
  }

  // `snapshot`: the request's title and description as the event carried them, so that the copy holds what the owner
  // saw; read live only when the event carries none (a deferred message replayed later).
  async function takeOver(n, { message, ownerLogin, snapshot } = {}) {
    const live = await gh.getIssue(n);
    if (!live) return null;
    const original = snapshot ? { ...live, title: snapshot.title, body: snapshot.body } : live;
    const isOpen = original.state !== 'closed';
    const kinds = names(original.labels).filter((l) => KINDS.includes(l));
    let found = await findCopy(n);
    if (!found && !isOpen) return null; // a request the owner dropped: handled as today
    if (!found) {
      try {
        const made = await gh.createIssue(original.title, copyBody({ repo, original, message }), [...kinds, L.kept]);
        found = { number: made.number, told: false };
      } catch (e) {
        if (isRateLimited(e)) throw e;
        await gh.comment(n, say(COPY_FAILED));
        return { type: 'takeover-failed', reason: `copie impossible : ${e.message}` };
      }
    }
    const copy = found.number;
    await gh.comment(n, say(found.told ? ALREADY(copy) : `${TAKEN(copy)}\n${copiedMarker(copy)}`));
    if (isOpen) await gh.closeIssue(n, 'completed');
    // The copy never started: it starts (or queues) like a request of the owner.
    const made = await gh.getIssue(copy);
    const labels = names(made?.labels);
    const fresh = made && made.state !== 'closed' && !(made.comments > 0) && labels.every((l) => KINDS.includes(l) || l === L.kept);
    if (fresh) {
      await handleEvent({ kind: 'issue', event: 'issues', action: 'opened', number: copy, labels: await liveLabels(copy), fromOwner: true, fromAgent: false, openedRecently: false }, { ownerLogin });
    }
    return { type: 'takeover', copy, reason: `demande d'un inconnu reprise dans #${copy}` };
  }

  return { findCopy, takeOver };
}
