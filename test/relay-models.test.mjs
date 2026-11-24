import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchesPart } from '../scripts/relay/launches.mjs';

const quiet = () => {};
const env = { FACTORY_ROUTINE_URL: 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire', FACTORY_ROUTINE_TOKEN: 'tok' };
const routinePayload = (body) => JSON.parse(JSON.parse(body).text.split('\n\n').slice(1).join('\n\n'));
const b64 = (o) => ({ content: Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64') });

// `settings`: what the request answers (a function to throw).
function setup(runner, settings) {
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
  const part = launchesPart({ gh, repo: 'phoibe/app', config, env, fetchImpl, now: () => 0, log: quiet, sleep: async () => {}, outputs: {}, woken: new Set(), commentCache: new Map() });
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
  });

  for (const [name, settings] of [['a failing read', () => { throw new Error('boom'); }], ['a missing file', null], ['bad JSON', b64('{nope')]]) {
    test(`${runner}: ${name} still launches, with the default models`, async () => {
      const t = setup(runner, settings);
      await t.fire();
      assert.deepEqual(t.payload().models.simple, { model: 'sonnet', effort: 'low' });
      assert.deepEqual(t.payload().models.code, { model: 'opus', effort: 'medium' });
    });
  }

  test(`${runner}: extra can override the models`, async () => {
    const t = setup(runner, b64({ models: { code: 'sonnet' } }));
    await t.fire({ models: { code: { model: 'haiku', effort: 'low' } } });
    assert.equal(t.payload().models.code.model, 'haiku');
  });
}
