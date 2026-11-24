// The factory's invisible notes (`<!-- factory-… -->`) steer it: block a card, resume one, skip a step. On a public
// project anyone can write a comment that carries them (issue #339), so only the notes of trusted authors count:
// the owner, the people GitHub lists as the repository's collaborators or its organisation's members, and the
// factory's own bots (the relay posts as github-actions[bot], the agent as the owner or as claude[bot]). Shared by
// the relay and the panel (copied next to it by pages.yml).
const BOTS = ['github-actions[bot]', 'claude[bot]'];
const ROLES = ['OWNER', 'MEMBER', 'COLLABORATOR'];
// An unterminated one is taken out to the end of the text: GitHub hides it all the same, and a reader that looks only
// for its start (`<!-- factory-revert-redo #9`) would still find it.
const NOTE = /<!--\s*factory-[\s\S]*?(?:-->|$)/gi;

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

// An issue or a PR as GitHub sends it: an integer number, a title and an author key (null for a deleted account).
const isIssueLike = (v) => Number.isInteger(v.number) && typeof v.title === 'string' && 'user' in v;

// Issue #557: on a public project, an issue or PR opened by an outsider has its factory notes taken out of its
// description and is marked `untrusted` (the relay takes such a request over in a copy). Lists and plain objects are
// walked, so that an issue nested in an event or a search answer is found too. Never mutates: the same reference
// comes back when nothing changed.
export function trustBodies(data, owner) {
  if (Array.isArray(data)) {
    let changed = false;
    const out = data.map((v) => { const c = trustBodies(v, owner); if (c !== v) changed = true; return c; });
    return changed ? out : data;
  }
  if (!data || typeof data !== 'object' || Object.getPrototypeOf(data) !== Object.prototype) return data;
  if (isIssueLike(data)) {
    if (trustedAuthor(data, owner)) return data;
    return typeof data.body === 'string' ? { ...data, body: stripNotes(data.body), untrusted: true } : { ...data, untrusted: true };
  }
  let out = null;
  for (const [k, v] of Object.entries(data)) {
    const c = trustBodies(v, owner);
    if (c !== v) (out ||= { ...data })[k] = c;
  }
  return out || data;
}

// What the panel reads: cleaned when the address is a project's (`/repos/<owner>/<name>…`) and that project is not
// private. `isPrivate('<owner>/<name>')` says it.
export function trustRead(path, data, isPrivate) {
  const m = /\/repos\/([^/?#]+)\/([^/?#]+)/.exec(String(path || ''));
  if (!m || isPrivate(`${m[1]}/${m[2]}`)) return data;
  return trustBodies(data, m[1]);
}

// An outsider's text the factory copies into a request of its own: no HTML comment at all is left (removed until
// none is left), and an unterminated one is made visible, so that it cannot swallow what the factory writes after.
export function visibleText(text) {
  let clean = String(text ?? '');
  for (let prev = null; prev !== clean;) { prev = clean; clean = clean.replace(/<!--[\s\S]*?-->/g, ''); }
  return clean.replace(/<!--/g, '&lt;!--').trim();
}
