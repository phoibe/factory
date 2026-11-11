// The factory's invisible notes (`<!-- factory-… -->`) steer it: block a card, resume one, skip a step. On a public
// project anyone can write a comment that carries them (issue #339), so only the notes of trusted authors count:
// the owner, the people GitHub lists as the repository's collaborators or its organisation's members, and the
// factory's own bots (the relay posts as github-actions[bot], the agent as the owner or as claude[bot]). Shared by
// the relay and the panel (copied next to it by pages.yml).
const BOTS = ['github-actions[bot]', 'claude[bot]'];
const ROLES = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const NOTE = /<!--\s*factory-[\s\S]*?-->/g;

export function trustedAuthor(comment, owner) {
  const login = String(comment?.user?.login || '').toLowerCase();
  if (!login) return false;
  if (owner && login === String(owner).toLowerCase()) return true;
  return BOTS.includes(login) || ROLES.includes(comment?.author_association);
}

// Taken out until none is left: removing one note must not join the text around it into another.
function stripNotes(body) {
  let clean = body;
  for (let prev = null; prev !== clean;) { prev = clean; clean = clean.replace(NOTE, ''); }
  return clean;
}

// The comments (or reviews) with the factory notes of untrusted authors taken out; the rest of their text stays.
// Those comments are marked `untrusted`, so that they cannot cancel a note either (see waits.mjs).
export function trustNotes(comments, owner) {
  if (!Array.isArray(comments)) return comments;
  return comments.map((c) => {
    if (!c || trustedAuthor(c, owner)) return c;
    return typeof c.body === 'string' ? { ...c, body: stripNotes(c.body), untrusted: true } : { ...c, untrusted: true };
  });
}
