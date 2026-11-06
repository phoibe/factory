// The panel's token may comment on issues but not on pull requests (its « Pull requests » permission is read-only:
// GitHub answers 403 « Resource not accessible by personal access token »). An « ok » for a PR is then written on
// the issue the PR delivers, with this marker naming the PR; the relay handles it as if written on the PR.
// Shared by the panel (copied next to it by pages.yml) and the relay.
const MARKER = /<!-- factory-answer-pr:(\d+) -->/;

export const answerForPr = (pr, text) => `<!-- factory-answer-pr:${pr} -->\n${text}`;

// { pr, text } when the comment is an answer meant for a PR, else null.
export function forwardedAnswer(body) {
  const m = MARKER.exec(String(body || ''));
  return m ? { pr: Number(m[1]), text: String(body).replace(MARKER, '').trim() } : null;
}
