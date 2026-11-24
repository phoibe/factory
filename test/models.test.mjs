import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_FAMILIES, MODEL_ROLES, resolveModels, familyLabel, roleModel } from '../scripts/lib/models.mjs';

const defaults = { plan: { model: 'fable', effort: 'high' }, code: { model: 'opus', effort: 'medium' }, review: { model: 'fable', effort: 'high' }, simple: { model: 'sonnet', effort: 'low' } };

test('the catalog lists every family with its current version', () => {
  assert.deepEqual(MODEL_FAMILIES.map((f) => f.id), ['fable', 'opus', 'sonnet', 'haiku']);
  assert.equal(familyLabel(MODEL_FAMILIES[0]), 'Fable (5.2 aujourd’hui)');
  assert.equal(familyLabel(MODEL_FAMILIES[1]), 'Opus (5.5 aujourd’hui)');
});

test('four roles in order: plans, code, review, simple tasks', () => {
  assert.deepEqual(MODEL_ROLES.map((r) => r.id), ['plan', 'code', 'review', 'simple']);
  assert.deepEqual(MODEL_ROLES.map((r) => r.name), ['Plans et organisation', 'Écriture du code', 'Revue', 'Tâches simples']);
});

test('nothing saved yet: the defaults, Fable / Opus / Fable / Sonnet', () => {
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
