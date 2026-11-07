import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRunners } from '../scripts/runners.mjs';
import { repoKey } from '../scripts/lib/runners.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const NOW = Date.parse('2026-11-06T12:00:00Z');

// A fake owner's account: repos, their runners, variables and runs. `calls` records every write.
function account({ repos, runners = {}, vars = {}, runs = {}, jobs = {}, refused = false, expires = null }) {
  const calls = [];
  const state = { vars: { ...vars }, runs: structuredClone(runs) };
  const request = async (method, path, body) => {
    if (method !== 'GET') calls.push([method, path, body]);
    let m;
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/contents\/factory\.config\.json$/.exec(path))) {
      const r = repos.find((x) => x.full_name === m[1]);
      return r?.config === undefined ? null : { content: b64(r.config) };
    }
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/actions\/runners/.exec(path))) return { runners: runners[m[1]] || [] };
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/actions\/variables\/FACTORY_RUNS_ON$/.exec(path))) {
      if (method === 'GET') return state.vars[m[1]] ? { name: 'FACTORY_RUNS_ON', value: state.vars[m[1]] } : null;
      if (method === 'PATCH') { state.vars[m[1]] = body.value; return null; }
      if (method === 'DELETE') { delete state.vars[m[1]]; return null; }
    }
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/actions\/variables$/.exec(path)) && method === 'POST') { state.vars[m[1]] = body.value; return null; }
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/actions\/runs\?status=(\w+)/.exec(path))) {
      return { workflow_runs: (state.runs[m[1]] || []).filter((r) => r.status === m[2]) };
    }
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)\/jobs/.exec(path))) return { jobs: jobs[m[2]] || [] };
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)\/(cancel|force-cancel)$/.exec(path))) {
      const run = state.runs[m[1]].find((r) => r.id === Number(m[2]));
      run.status = 'completed';
      run.conclusion = 'cancelled';
      return null;
    }
    if ((m = /^\/repos\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)$/.exec(path))) return state.runs[m[1]].find((r) => r.id === Number(m[2])) || null;
    if (/rerun-failed-jobs$/.test(path)) return null;
    throw new Error(`unexpected ${method} ${path}`);
  };
  return {
    calls,
    state,
    keyApi: { repos: async () => (refused ? { ok: false, status: 401, repos: [] } : { ok: true, status: 200, repos, expires }), request },
  };
}

function store(files = {}) {
  const data = structuredClone(files);
  const writes = [];
  return { data, writes, read: async (p) => data[p] ?? null, write: async (p, v) => { data[p] = v; writes.push(p); } };
}

const ids = { app: 101, 'secret-app': 102, site: 103, tool: 104, notes: 105 };
const priv = (name, config = {}) => ({ id: ids[name], full_name: `pierre/${name}`, name, private: true, config });
const online = [{ status: 'online', labels: [{ name: 'self-hosted' }] }];
const run = (deps) => checkRunners({ now: () => NOW, sleep: async () => {}, log: () => {}, topic: 'topic', ...deps });

test('without the key, nothing is touched and the status says the key is missing', async () => {
  const s = store();
  const res = await run({ keyApi: null, store: s, fetchImpl: async () => assert.fail('no alert at the first check') });
  assert.equal(res.status.key, 'missing');
  assert.deepEqual(s.data['status.json'].projects, {});
});

test('a private project with its server online gets the runs-on variable', async () => {
  const a = account({ repos: [priv('app')], runners: { 'pierre/app': online } });
  const s = store();
  const res = await run({ keyApi: a.keyApi, store: s });
  assert.equal(a.state.vars['pierre/app'], '["self-hosted"]');
  const p = res.status.projects[await repoKey('101')];
  assert.deepEqual([p.machine, p.reason, p.online], ['dev-server', 'online', 1]);
});

test('the status written on the public branch never names a project', async () => {
  const a = account({ repos: [priv('secret-app')], runners: { 'pierre/secret-app': online } });
  const s = store();
  await run({ keyApi: a.keyApi, store: s });
  assert.doesNotMatch(JSON.stringify(s.data['status.json']), /secret-app/);
});

test('a public project, or one set to GitHub, loses the variable', async () => {
  const a = account({
    repos: [{ ...priv('site'), private: false }, priv('tool', { machine: 'github' })],
    runners: { 'pierre/site': online, 'pierre/tool': online },
    vars: { 'pierre/site': '["self-hosted"]', 'pierre/tool': '["self-hosted"]' },
  });
  await run({ keyApi: a.keyApi, store: store() });
  assert.deepEqual(a.state.vars, {});
});

test('a public project the key does not cover raises no warning', async () => {
  const a = account({ repos: [{ ...priv('site'), private: false }] });
  const request = a.keyApi.request;
  a.keyApi.request = async (method, path, body) => {
    if (path.includes('/actions/variables')) throw new Error(`GitHub ${method} ${path} -> 403`);
    return request(method, path, body);
  };
  const res = await run({ keyApi: a.keyApi, store: store() });
  const entry = res.status.projects[await repoKey('103')];
  assert.equal(entry.machine, 'github');
  assert.equal(entry.error, undefined);
});

test('the general setting on GitHub keeps every project there', async () => {
  const a = account({ repos: [priv('app')], runners: { 'pierre/app': online } });
  const res = await run({ keyApi: a.keyApi, store: store({ 'settings.json': { machine: 'github' } }) });
  assert.equal(a.state.vars['pierre/app'], undefined);
  assert.equal(res.status.general, 'github');
});

test('a repository without factory.config.json is not a project', async () => {
  const a = account({ repos: [{ id: 105, full_name: 'pierre/notes', name: 'notes', private: true }] });
  const res = await run({ keyApi: a.keyApi, store: store() });
  assert.deepEqual(res.status.projects, {});
  assert.deepEqual(a.calls, []);
});

test('server down: the variable goes, the stuck runs are cancelled and re-run on GitHub, one alert', async () => {
  const key = await repoKey('101');
  const a = account({
    repos: [priv('app')],
    vars: { 'pierre/app': '["self-hosted"]' },
    runs: { 'pierre/app': [{ id: 7, status: 'queued', event: 'issue_comment' }, { id: 8, status: 'queued', event: 'schedule' }, { id: 9, status: 'in_progress', event: 'issues' }] },
    jobs: { 7: [{ status: 'queued', labels: ['self-hosted'] }], 8: [{ status: 'queued', labels: ['self-hosted'] }], 9: [{ status: 'in_progress', labels: ['ubuntu-24.04'] }] },
  });
  const sent = [];
  const s = store({ 'status.json': { key: 'ok', projects: { [key]: { machine: 'dev-server', reason: 'online', online: 1 } } } });
  const res = await run({ keyApi: a.keyApi, store: s, fetchImpl: async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true }; } });
  assert.equal(a.state.vars['pierre/app'], undefined);
  const paths = a.calls.map(([m, p]) => `${m} ${p}`);
  assert.ok(paths.includes('POST /repos/pierre/app/actions/runs/7/cancel'));
  assert.ok(paths.includes('POST /repos/pierre/app/actions/runs/7/rerun-failed-jobs'));
  assert.ok(paths.includes('POST /repos/pierre/app/actions/runs/8/cancel'));
  assert.ok(!paths.includes('POST /repos/pierre/app/actions/runs/8/rerun-failed-jobs'), 'a cancelled tick is redone by the next tick');
  assert.ok(!paths.some((p) => p.includes('/runs/9/')), 'a job on GitHub is left alone');
  assert.equal(sent.length, 1);
  assert.match(sent[0].message, /hors ligne pour app/);
  assert.equal(res.status.projects[key].reason, 'offline');
});

test('a run that will not stop yet is re-run at the next check', async () => {
  const key = await repoKey('101');
  const a = account({
    repos: [priv('app')],
    vars: { 'pierre/app': '["self-hosted"]' },
    runs: { 'pierre/app': [{ id: 7, status: 'in_progress', event: 'issues' }] },
    jobs: { 7: [{ status: 'in_progress', labels: ['self-hosted'] }] },
  });
  // The cancel is accepted but the run stays in progress (its runner is gone).
  const stubborn = { ...a.keyApi, request: async (m, p, b) => (/\/(force-)?cancel$/.test(p) ? (a.calls.push([m, p, b]), null) : a.keyApi.request(m, p, b)) };
  const s = store({ 'status.json': { key: 'ok', projects: { [key]: { machine: 'dev-server', reason: 'online' } } } });
  const first = await run({ keyApi: stubborn, store: s, fetchImpl: async () => ({ ok: true }) });
  assert.ok(a.calls.some(([, p]) => p.endsWith('/runs/7/force-cancel')));
  assert.deepEqual(first.status.projects[key].rerun.map((r) => r.id), [7]);
  a.state.runs['pierre/app'][0].status = 'completed';
  const second = await run({ keyApi: a.keyApi, store: s, fetchImpl: async () => ({ ok: true }) });
  assert.ok(a.calls.some(([m, p]) => m === 'POST' && p.endsWith('/runs/7/rerun-failed-jobs')));
  assert.equal(second.status.projects[key].rerun, undefined);
});

test('a refused key is reported and announced once', async () => {
  const a = account({ repos: [], refused: true });
  const sent = [];
  const s = store({ 'status.json': { key: 'ok', projects: {} } });
  const res = await run({ keyApi: a.keyApi, store: s, fetchImpl: async (u, init) => { sent.push(JSON.parse(init.body)); return { ok: true }; } });
  assert.equal(res.status.key, 'refused');
  assert.equal(sent.length, 1);
  await run({ keyApi: a.keyApi, store: s, fetchImpl: async (u, init) => { sent.push(JSON.parse(init.body)); return { ok: true }; } });
  assert.equal(sent.length, 1);
});

test('an unchanged status is not written again within the hour', async () => {
  const a = account({ repos: [priv('app')], runners: { 'pierre/app': online } });
  const s = store();
  await run({ keyApi: a.keyApi, store: s });
  await run({ keyApi: a.keyApi, store: s });
  assert.equal(s.writes.filter((p) => p === 'status.json').length, 1);
});

test('the public logs never name a private project', async () => {
  const key = await repoKey('101');
  const a = account({
    repos: [priv('app')],
    vars: { 'pierre/app': '["self-hosted"]' },
    runs: { 'pierre/app': [{ id: 7, status: 'queued', event: 'issues' }] },
    jobs: { 7: [{ status: 'queued', labels: ['self-hosted'] }] },
  });
  const lines = [];
  const s = store({ 'status.json': { key: 'ok', projects: { [key]: { machine: 'dev-server', reason: 'online' } } } });
  await checkRunners({ keyApi: a.keyApi, store: s, topic: 't', now: () => NOW, sleep: async () => {}, log: (l) => lines.push(l), fetchImpl: async () => ({ ok: true }) });
  assert.ok(lines.length > 0);
  for (const l of lines) assert.doesNotMatch(l, /pierre|app/, l);
});

test('a switch cut halfway is finished at the next check: stuck runs are still cancelled', async () => {
  const key = await repoKey('101');
  // The variable is already gone, but the last check saw the project on the server.
  const a = account({
    repos: [priv('app')],
    runs: { 'pierre/app': [{ id: 7, status: 'queued', event: 'issues' }] },
    jobs: { 7: [{ status: 'queued', labels: ['self-hosted'] }] },
  });
  const s = store({ 'status.json': { key: 'ok', projects: { [key]: { machine: 'dev-server', reason: 'online', error: true } } } });
  await run({ keyApi: a.keyApi, store: s, fetchImpl: async () => ({ ok: true }) });
  assert.ok(a.calls.some(([m, p]) => m === 'POST' && p.endsWith('/runs/7/cancel')));
});

test('runs asking for custom runner labels are found too', async () => {
  const key = await repoKey('101');
  const a = account({
    repos: [priv('app')],
    vars: { 'pierre/app': '["factory","linux"]' },
    runs: { 'pierre/app': [{ id: 7, status: 'queued', event: 'issues' }] },
    jobs: { 7: [{ status: 'queued', labels: ['factory', 'linux'] }] },
  });
  const s = store({ 'settings.json': { labels: ['factory', 'linux'] }, 'status.json': { key: 'ok', projects: { [key]: { machine: 'dev-server', reason: 'online' } } } });
  await run({ keyApi: a.keyApi, store: s, fetchImpl: async () => ({ ok: true }) });
  assert.ok(a.calls.some(([m, p]) => m === 'POST' && p.endsWith('/runs/7/cancel')));
});

test('GitHub having a hiccup is not a refused key: nothing is written, no alert', async () => {
  const s = store({ 'status.json': { key: 'ok', projects: {} } });
  const keyApi = { repos: async () => ({ ok: false, status: 502, repos: [] }), request: async () => assert.fail() };
  const res = await run({ keyApi, store: s, fetchImpl: async () => assert.fail('no alert') });
  assert.equal(res.status, null);
  assert.deepEqual(s.writes, []);
});

test('without a working key, the last known machine of each project is kept, so the panel says the backup is off', async () => {
  const key = await repoKey('101');
  const prev = { key: 'ok', projects: { [key]: { machine: 'dev-server', reason: 'online', online: 1 } } };
  const missing = await run({ keyApi: null, store: store({ 'status.json': prev }) });
  assert.equal(missing.status.projects[key].machine, 'dev-server');
  assert.equal(missing.status.projects[key].stale, true);
  const refused = await run({ keyApi: { repos: async () => ({ ok: false, status: 401, repos: [] }), request: async () => assert.fail() }, store: store({ 'status.json': prev }), fetchImpl: async () => ({ ok: true }) });
  assert.equal(refused.status.projects[key].machine, 'dev-server');
});

test('a 403 asking to wait is GitHub limiting, not a refused key', async () => {
  const s = store({ 'status.json': { key: 'ok', projects: {} } });
  const res = await run({ keyApi: { repos: async () => ({ ok: false, status: 429, repos: [] }), request: async () => assert.fail() }, store: s, fetchImpl: async () => assert.fail('no alert') });
  assert.equal(res.status, null);
});
