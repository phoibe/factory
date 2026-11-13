// Errors shown to the owner: always a short French sentence that says what to do (issue #398).
// Full sentences: a toast puts them after its own « Envoi impossible. » (never a second colon).
// GitHub's and the browser's own texts (« Failed to fetch », « Bad credentials ») never reach the screen.

// A GitHub answer that is not a success; `status` stays readable for callers that check it (422 « already exists »…).
export function httpError(status, githubMessage = '', method = 'GET') {
  return Object.assign(new Error(`${status} ${githubMessage || ''}`.trim()), { status, githubMessage: String(githubMessage || ''), write: !emptyOn404({ method }) });
}

// An error whose message was already written in French for the owner (the chat server's own answers).
export const saidError = (text) => Object.assign(new Error(text), { said: true });

// A 404 means « nothing there » only for a read: on a write it is GitHub refusing the action (a token without
// access to the repository gets a 404, not a 403), which must never be shown as done.
export const emptyOn404 = (init = {}) => !init.method || init.method.toUpperCase() === 'GET';

export function errorText(err) {
  if (err?.said && err.message) return err.message;
  const status = err?.status;
  if (status === 401) return 'Jeton refusé\u00a0: reconnectez-vous.';
  if (err?.rateLimited || status === 429 || (status === 403 && /rate limit/i.test(err.githubMessage || err.message))) return 'Trop de demandes à GitHub\u00a0: réessayez dans quelques minutes.';
  if (status === 403 || (status === 404 && err.write)) return 'Le jeton n\'a pas accès à ce projet\u00a0: créez-en un qui y a accès.';
  if (status === 404) return 'Introuvable sur GitHub\u00a0: rechargez la page, puis vérifiez l\'accès du jeton.';
  if (status === 409) return 'Cet élément vient de changer\u00a0: rechargez la page et réessayez.';
  if (status >= 500) return 'GitHub ne répond pas pour l\'instant\u00a0: réessayez dans un moment.';
  if (status) return 'GitHub a refusé l\'action\u00a0: rechargez la page et réessayez.';
  // fetch() rejects with a TypeError when the network is down (« Failed to fetch », « Load failed »…).
  if (err?.name === 'TypeError' && /fetch|network|load failed/i.test(err.message)) return 'Connexion perdue, réessayez.';
  return 'Une erreur est survenue, réessayez.';
}
