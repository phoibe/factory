import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchesPart } from '../scripts/relay/launches.mjs';

const quiet = () => {};
const env = { FACTORY_ROUTINE_URL: 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', FACTORY_ROUTINE_TOKEN: 'tok' };
const routinePayload = (body) => JSON.parse(JSON.parse(body).text.split('\n\n').slice(1).join('\n\n'));
const b64 = (o) => ({ content: Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64') });

// `settings`: what the request answers (a function to throw).
function setup(runner, settings, log = quiet) {
  const dispatched = [];
  const requests = [];
  const gh = {
    addLabels: async () => {},
    removeLabel: async () => {},
    comment: async () => {},
    getRepo: async () => ({ default_branch: 'main' }),
    dispatch: async (wf, ref, inputs) => dispatched.push(inputs),
    request: async (method, path) => { requests.push([method, path]); return typeof settings === 'function' ? settings() : settings; },
  };
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(init); return { ok: true, status: 200, text: async () => '', json: async () => ({}) }; };
  const config = { runner, maxParallel: 2, stages: {}, review: { maxLoops: 3 } };
  const part = launchesPart({ gh, repo: 'phoibe/app', config, env, fetchImpl, now: () => 0, log, sleep: async () => {}, outputs: {}, woken: new Set(), commentCache: new Map() });
  const payload = () => (runner === 'github-actions' ? JSON.parse(dispatched[0].payload) : routinePayload(sent[0].body));
  return { fire: (extra) => part.fireAgent({ stage: 'build', issue: 1, pr: null, ...(extra ? { extra } : {}) }), payload, requests };
}

for (const runner of ['github-actions', 'claude-cloud']) {
  test(`${runner}: the payload carries the models saved in the factory's settings`, async () => {
    const t = setup(runner, b64({ machine: 'github', models: { code: 'sonnet' } }));
    await t.fire();
    assert.deepEqual(t.requests, [['GET', '/repos/phoibe/factory/contents/settings.json?ref=factory-runners']]);
    const { models } = t.payload();
    assert.equal(models.code.model, 'sonnet');
    assert.deepEqual(models.plan, { model: 'fable', effort: 'high' });
    assert.deepEqual(models.audit, { model: 'opus', effort: 'high' });
  });

  test(`${runner}: the payload carries the engine saved for the general-review reviews`, async () => {
    const t = setup(runner, b64({ models: { audit: 'fable' } }));
    await t.fire();
    const { models } = t.payload();
    assert.deepEqual(models.audit, { model: 'fable', effort: 'high' });
    assert.deepEqual(Object.keys(models), ['plan', 'code', 'review', 'audit', 'simple']);
  });

  for (const [name, settings] of [['a failing read', () => { throw new Error('boom'); }], ['a missing file', null], ['bad JSON', b64('{nope')]]) {
    test(`${runner}: ${name} still launches, with the default models`, async () => {
      const t = setup(runner, settings);
      await t.fire();
      assert.deepEqual(t.payload().models.simple, { model: 'sonnet', effort: 'low' });
      assert.deepEqual(t.payload().models.code, { model: 'opus', effort: 'medium' });
    });
  }

  test(`${runner}: no settings file yet is not a problem: nothing logged, the default models`, async () => {
    const logs = [];
    const t = setup(runner, null, (m) => logs.push(m));
    await t.fire();
    assert.deepEqual(logs.filter((m) => /models settings/.test(m)), []);
    assert.deepEqual(t.payload().models.code, { model: 'opus', effort: 'medium' });
  });

  test(`${runner}: a settings file that cannot be read is logged once, and the default models are used`, async () => {
    const logs = [];
    const t = setup(runner, b64('{nope'), (m) => logs.push(m));
    await t.fire();
    assert.equal(logs.filter((m) => /models settings not read/.test(m)).length, 1);
    assert.deepEqual(t.payload().models.code, { model: 'opus', effort: 'medium' });
  });

  test(`${runner}: extra can override the models`, async () => {
    const t = setup(runner, b64({ models: { code: 'sonnet' } }));
    await t.fire({ models: { code: { model: 'haiku', effort: 'low' } } });
    assert.equal(t.payload().models.code.model, 'haiku');
  });
}

test('the factory repository is named once in the launches', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../scripts/relay/launches.mjs', import.meta.url), 'utf8');
  assert.equal(src.split("'phoibe/factory'").length - 1, 1);
  assert.match(src, /export const FACTORY_REPO = 'phoibe\/factory';/);
});
