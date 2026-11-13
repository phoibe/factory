import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpError, errorText, emptyOn404, saidError } from '../panel/errors.mjs';

test('a lost connection reads « Connexion perdue », never the browser text', () => {
  for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
    assert.equal(errorText(new TypeError(m)), 'Connexion perdue, réessayez.');
  }
});

test('a refused token reads « Jeton refusé »', () => {
  assert.equal(errorText(httpError(401, 'Bad credentials')), 'Jeton refusé\u00a0: reconnectez-vous.');
});

test('each GitHub refusal speaks French and says what to do', () => {
  assert.match(errorText(httpError(403, 'Resource not accessible by personal access token')), /^Le jeton n'a pas accès/);
  assert.match(errorText(httpError(403, 'API rate limit exceeded for user')), /^Trop de demandes/);
  assert.match(errorText(httpError(429, '')), /^Trop de demandes/);
  assert.match(errorText(httpError(404, 'Not Found')), /^Introuvable/);
  assert.match(errorText(httpError(409, 'Conflict')), /^Cet élément vient de changer/);
  assert.match(errorText(httpError(422, 'Validation Failed')), /^GitHub a refusé/);
  assert.match(errorText(httpError(502, '')), /^GitHub ne répond pas/);
  assert.match(errorText(httpError(418, 'I am a teapot')), /^GitHub a refusé/);
});

test('no message ever shows English from GitHub or the browser', () => {
  const english = /\b(Bad credentials|Not Found|Failed|fetch|Validation|Resource|undefined)\b/;
  for (const e of [httpError(401, 'Bad credentials'), httpError(404, 'Not Found'), httpError(422, 'Validation Failed'),
    new TypeError('Failed to fetch'), new Error('Unexpected token < in JSON'), new Error('500'), undefined, null, 'oops']) {
    assert.doesNotMatch(errorText(e), english);
  }
});

test('a message already written in French for the owner is kept', () => {
  assert.equal(errorText(saidError('Message trop long (au plus 4000 caractères).')), 'Message trop long (au plus 4000 caractères).');
});

test('an unknown error reads as a generic French message', () => {
  assert.equal(errorText(new Error('Unexpected token < in JSON')), 'Une erreur est survenue, réessayez.');
});

test('a 404 means « nothing there » only when reading: a refused write must fail', () => {
  assert.equal(emptyOn404(), true);
  assert.equal(emptyOn404({}), true);
  assert.equal(emptyOn404({ method: 'GET' }), true);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'post']) assert.equal(emptyOn404({ method }), false);
});

test('httpError keeps the status for callers that check it', () => {
  const e = httpError(422, 'Reference already exists');
  assert.equal(e.status, 422);
  assert.ok(e instanceof Error);
});

test('a 404 on a write is a refusal of the token, not « introuvable »', () => {
  assert.match(errorText(httpError(404, 'Not Found', 'POST')), /^Le jeton n'a pas accès/);
  assert.match(errorText(httpError(404, 'Not Found', 'GET')), /^Introuvable/);
});

test('a long GitHub pause reads « Trop de demandes »', () => {
  assert.match(errorText(Object.assign(new Error('rate limited'), { rateLimited: true, waitMs: 600000 })), /^Trop de demandes/);
});
