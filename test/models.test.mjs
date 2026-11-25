import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_FAMILIES, MODEL_ROLES, resolveModels, familyLabel, roleModel, parseModelIds } from '../scripts/lib/models.mjs';

const defaults = { plan: { model: 'fable', effort: 'high' }, code: { model: 'opus', effort: 'medium' }, review: { model: 'fable', effort: 'high' }, audit: { model: 'opus', effort: 'high' }, simple: { model: 'sonnet', effort: 'low' } };

test('the catalog lists every family with its current version, labelled <Name> (<version> aujourd’hui)', () => {
  assert.ok(MODEL_FAMILIES.length >= 4);
  for (const id of ['fable', 'opus', 'sonnet', 'haiku']) assert.ok(MODEL_FAMILIES.some((f) => f.id === id), id);
  for (const f of MODEL_FAMILIES) assert.equal(familyLabel(f), `${f.name} (${f.version} aujourd’hui)`);
  assert.match(familyLabel(MODEL_FAMILIES[0]), /^\S+ \(\d+(\.\d+)? aujourd’hui\)$/);
});

test('model ids that are not model families are ignored', () => {
  const text = 'claude-code-2 claude-instant-1 claude-agent-3 claude-sdk-1 claude-api-2 claude-app-1 claude-desktop-2 claude-ai-1 claude-cli-2 claude-docs-1 claude-opus-5-5';
  assert.deepEqual(parseModelIds(text), [{ id: 'opus', version: '5.5' }]);
});

test('five roles in order: plans, code, review, general-review reviews, simple tasks', () => {
  assert.deepEqual(MODEL_ROLES.map((r) => r.id), ['plan', 'code', 'review', 'audit', 'simple']);
  assert.deepEqual(MODEL_ROLES.map((r) => r.name), ['Plans et organisation', 'Écriture du code', 'Revue', 'Relectures d’une review générale', 'Tâches simples']);
});

test('the general-review role: Opus and high effort by default, its own saved engine, Opus when it is gone (issue #570)', () => {
  const role = MODEL_ROLES.find((r) => r.id === 'audit');
  assert.equal(role.help, 'Relit le code de chaque partie de l’appli pendant une review générale. La synthèse reste faite par « Revue ».');
  assert.deepEqual(resolveModels({ models: { code: 'sonnet' } }).audit, { model: 'opus', effort: 'high' }, 'does not follow the code role');
  assert.deepEqual(resolveModels({ models: { review: 'haiku' } }).audit, { model: 'opus', effort: 'high' }, 'does not follow the review role');
  const r = resolveModels({ models: { audit: 'fable' } });
  assert.deepEqual(r.audit, { model: 'fable', effort: 'high' });
  assert.deepEqual({ ...r, audit: defaults.audit }, defaults, 'the other roles keep their default');
  assert.equal(resolveModels({ models: { audit: 'gpt' } }).audit.model, 'opus');
  assert.equal(roleModel({ models: { audit: 'fable' } }, 'audit', MODEL_FAMILIES.filter((f) => f.id !== 'fable')), 'opus');
});

test('nothing saved yet: the defaults, Fable / Opus / Fable / Opus / Sonnet', () => {
  for (const raw of [null, undefined, {}, { models: 'x' }, { machine: 'github' }, 'garbage']) assert.deepEqual(resolveModels(raw), defaults);
});

test('a saved family is used for its role, the others keep their default', () => {
  const r = resolveModels({ machine: 'github', models: { code: 'sonnet', simple: 'haiku' } });
  assert.deepEqual(r, { ...defaults, code: { model: 'sonnet', effort: 'medium' }, simple: { model: 'haiku', effort: 'low' } });
});

test('a family no longer in the list falls back to the role default', () => {
  assert.equal(resolveModels({ models: { review: 'gpt' } }).review.model, 'fable');
  const families = MODEL_FAMILIES.filter((f) => f.id !== 'opus');
  assert.equal(resolveModels({ models: { code: 'opus' } }, families).code.model, 'opus', 'a default is always kept, even missing from a list');
  assert.equal(roleModel({ models: { review: 'opus' } }, 'review', families), 'fable');
});

test('the help of the plan role names the questions and the sheet of each request (issue #550)', () => {
  assert.match(MODEL_ROLES.find((r) => r.id === 'plan').help, /questions et la fiche de chaque demande/);
});

test('the help of the review role names the scope check (issue #606)', () => {
  assert.equal(MODEL_ROLES.find((r) => r.id === 'review').help, 'Relecture finale du code avant chaque PR, vérification de portée, revue de sécurité, synthèse d’une review générale.');
});
