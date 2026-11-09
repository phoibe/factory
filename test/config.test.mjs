import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, enabledSkills, parseRawConfig } from '../scripts/lib/config.mjs';

const catalog = {
  packs: [
    { id: 'sp', skills: [{ id: 'tdd', path: 'packs/sp/tdd', defaultEnabled: true }, { id: 'brain', path: 'packs/sp/brain', defaultEnabled: false }] },
    { id: 'imp', skills: [{ id: 'impeccable', path: 'packs/imp/impeccable', defaultEnabled: true }] },
  ],
};

test('empty config resolves to defaults with every pack enabled', () => {
  const { config, warnings } = resolveConfig(undefined, catalog);
  assert.equal(config.maxParallel, 2);
  assert.equal(config.runner, 'claude-cloud');
  assert.equal(config.review.maxLoops, 3);
  assert.equal(config.stages.screenshots, true);
  assert.deepEqual(config.skills.sp, { enabled: true, skills: { tdd: true, brain: false } });
  assert.deepEqual(warnings, []);
});

test('per-skill override inside a pack', () => {
  const { config } = resolveConfig({ skills: { sp: { skills: { brain: true, tdd: false } } } }, catalog);
  assert.deepEqual(enabledSkills(config, catalog).map((s) => s.id), ['brain', 'impeccable']);
});

test('a disabled pack yields none of its skills', () => {
  const { config } = resolveConfig({ skills: { imp: { enabled: false } } }, catalog);
  assert.deepEqual(enabledSkills(config, catalog).map((s) => s.id), ['tdd']);
});

test('unknown pack and skill ids produce warnings, not errors', () => {
  const { warnings } = resolveConfig({ skills: { nope: { enabled: true }, sp: { skills: { ghost: true } } } }, catalog);
  assert.equal(warnings.length, 2);
  assert.match(warnings.join(' '), /nope/);
  assert.match(warnings.join(' '), /ghost/);
});

test('invalid values fall back to defaults with a warning', () => {
  const { config, warnings } = resolveConfig({ maxParallel: 0, runner: 'mars', review: { maxLoops: 'x' } }, catalog);
  assert.equal(config.maxParallel, 2);
  assert.equal(config.runner, 'claude-cloud');
  assert.equal(config.review.maxLoops, 3);
  assert.equal(warnings.length, 3);
});

test('stage toggles override defaults', () => {
  const { config } = resolveConfig({ stages: { grilling: false }, maxParallel: 4 }, catalog);
  assert.equal(config.stages.grilling, false);
  assert.equal(config.stages.plan, true);
  assert.equal(config.maxParallel, 4);
});

test('siteUrl is kept when it is an https link, dropped with a warning otherwise', () => {
  const ok = resolveConfig({ siteUrl: 'https://habitudes.vercel.app' }, catalog);
  assert.equal(ok.config.siteUrl, 'https://habitudes.vercel.app');
  const bad = resolveConfig({ siteUrl: 'javascript:alert(1)' }, catalog);
  assert.equal(bad.config.siteUrl, undefined);
  assert.equal(bad.warnings.length, 1);
  assert.equal(resolveConfig({}, catalog).config.siteUrl, undefined);
});

test('autoPick is off by default and only a boolean turns it on', () => {
  assert.equal(resolveConfig(undefined, catalog).config.autoPick, false);
  assert.equal(resolveConfig({ autoPick: true }, catalog).config.autoPick, true);
  const { config, warnings } = resolveConfig({ autoPick: 'oui' }, catalog);
  assert.equal(config.autoPick, false);
  assert.equal(warnings.length, 1);
});

test('maxQuestions defaults to 2 and only an integer from 1 to 10 is kept', () => {
  assert.equal(resolveConfig(undefined, catalog).config.maxQuestions, 2);
  assert.equal(resolveConfig({ maxQuestions: 3 }, catalog).config.maxQuestions, 3);
  assert.equal(resolveConfig({ maxQuestions: 10 }, catalog).config.maxQuestions, 10);
  for (const bad of [0, 11, '2', 1.5]) {
    const { config, warnings } = resolveConfig({ maxQuestions: bad }, catalog);
    assert.equal(config.maxQuestions, 2);
    assert.equal(warnings.length, 1);
  }
});

test('a broken config file never throws: defaults plus a warning', () => {
  assert.deepEqual(parseRawConfig('{ not json'), { raw: {}, warning: 'factory.config.json est illisible : les réglages par défaut sont utilisés.' });
  assert.equal(parseRawConfig('[1]').raw && Object.keys(parseRawConfig('[1]').raw).length, 0);
  assert.deepEqual(parseRawConfig(null), { raw: {}, warning: null });
  assert.deepEqual(parseRawConfig('{"a":1}'), { raw: { a: 1 }, warning: null });
});

test('machine follows the general setting by default; only dev-server or github override it', () => {
  assert.equal(resolveConfig({}, catalog).config.machine, 'default');
  assert.equal(resolveConfig({ machine: 'github' }, catalog).config.machine, 'github');
  assert.equal(resolveConfig({ machine: 'dev-server' }, catalog).config.machine, 'dev-server');
  const { config, warnings } = resolveConfig({ machine: 'moon' }, catalog);
  assert.equal(config.machine, 'default');
  assert.ok(warnings.some((w) => w.includes('machine')));
});

test('production is unset by default (the stack sheet decides), set when asked, and an unknown value is dropped with a warning', async () => {
  const { effectiveProduction } = await import('../scripts/lib/config-core.mjs');
  assert.equal(resolveConfig({}, catalog).config.production, undefined);
  for (const mode of ['auto', 'approval', 'external']) assert.equal(resolveConfig({ production: mode }, catalog).config.production, mode);
  const bad = resolveConfig({ production: 'later' }, catalog);
  assert.equal(bad.config.production, undefined);
  assert.equal(bad.warnings.length, 1);
  // Unset: the sheet decides (« Manuelle » → external, anything else → automatic). Set: the setting wins.
  assert.equal(effectiveProduction({}, null), 'auto');
  assert.equal(effectiveProduction({}, { mode: 'auto' }), 'auto');
  assert.equal(effectiveProduction({}, { mode: 'manual' }), 'external');
  assert.equal(effectiveProduction({ production: 'auto' }, { mode: 'manual' }), 'auto');
  assert.equal(effectiveProduction({ production: 'external' }, null), 'external');
});
