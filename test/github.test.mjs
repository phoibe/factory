import { test } from 'node:test';
import assert from 'node:assert/strict';
import { github } from '../scripts/lib/github.mjs';

const answer = (status, body = {}) => ({ ok: status < 400, status, json: async () => body, text: async () => 'x', headers: new Map() });
const client = (answers, sink = []) => github({
  token: 't', repo: 'o/r', sleep: async () => {},
  fetchImpl: async (url, init) => { sink.push(init.method); const a = answers.shift(); if (a instanceof Error) throw a; return a; },
});

test('a GitHub 503 is retried instead of killing the step (PR #162)', async () => {
  const gh = client([answer(503), answer(200, { number: 162 })]);
  assert.equal((await gh.getPr(162)).number, 162);
});

test('a network error is retried too', async () => {
  const gh = client([new Error('ECONNRESET'), answer(200, { number: 1 })]);
  assert.equal((await gh.getPr(1)).number, 1);
});

test('a POST that hit a network error is not repeated (the server may have applied it), a PATCH is', async () => {
  const sink = [];
  await assert.rejects(client([new Error('ECONNRESET'), answer(201, { id: 1 })], sink).comment(1, 'hi'), /ECONNRESET/);
  assert.equal(sink.length, 1);
  const patched = [];
  await client([new Error('ECONNRESET'), answer(200, {})], patched).updateIssue(1, { body: 'x' });
  assert.deepEqual(patched, ['PATCH', 'PATCH']);
});

test('retries stop after a few tries and the error is reported', async () => {
  const sink = [];
  const gh = client([answer(503), answer(503), answer(503), answer(503)], sink);
  await assert.rejects(gh.getPr(1), /503/);
  assert.equal(sink.length, 4);
});

test('a POST is not repeated on a 500/502 (it may have been written), only on 503', async () => {
  const sink = [];
  await assert.rejects(client([answer(502)], sink).comment(1, 'hi'), /502/);
  assert.equal(sink.length, 1);
  assert.ok(await client([answer(503), answer(201, { id: 1 })]).comment(1, 'hi'));
});

test('a 4xx is not retried', async () => {
  const sink = [];
  await assert.rejects(client([answer(422)], sink).merge(1), /422/);
  assert.equal(sink.length, 1);
});

const limited = (status, headers) => ({ ok: false, status, json: async () => ({}), text: async () => 'rate limit', headers: new Map(Object.entries(headers)) });

test('a 429 pauses for the time GitHub asks, then the same call is retried', async () => {
  const waits = [];
  const answers = [limited(429, { 'retry-after': '3' }), answer(200, { number: 5 })];
  const gh = github({ token: 't', repo: 'o/r', sleep: async (ms) => { waits.push(ms); }, fetchImpl: async () => answers.shift() });
  assert.equal((await gh.getPr(5)).number, 5);
  assert.deepEqual(waits, [3000]);
});

test('a rate-limited POST is retried (GitHub did not apply it)', async () => {
  const sink = [];
  const gh = client([limited(403, { 'retry-after': '1' }), answer(201, { id: 1 })], sink);
  assert.ok(await gh.comment(1, 'hi'));
  assert.equal(sink.length, 2);
});

test('a wait too long to spend in place throws RateLimited, the event is taken up later', async () => {
  const gh = client([limited(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800) })]);
  await assert.rejects(gh.getPr(1), (e) => e.rateLimited === true && e.waitMs > 60_000);
});

test('a 403 without rate-limit headers is thrown at once (a refused permission)', async () => {
  const sink = [];
  await assert.rejects(client([limited(403, {})], sink).merge(1), (e) => /403/.test(e.message) && !e.rateLimited);
  assert.equal(sink.length, 1);
});

test('paginated reads pause on the rate limit too', async () => {
  const gh = client([limited(429, { 'retry-after': '2' }), answer(200, [{ id: 1, user: { login: 'o' } }])]);
  assert.deepEqual(await gh.listComments(1), [{ id: 1, user: { login: 'o' } }]);
});

test('pauses stop once three minutes were spent waiting in one run: the event is then taken up later', async () => {
  const many = Array.from({ length: 10 }, () => limited(429, { 'retry-after': '50' }));
  const gh = client([...many, answer(200, { number: 1 })]);
  await gh.getPr(1).catch(() => {});
  await gh.getPr(1).catch(() => {});
  await assert.rejects(gh.getPr(1), (e) => e.rateLimited === true);
});

test('no pause runs past the job\'s time: after 12 minutes of run, the limit is passed on so the event is taken up later', async () => {
  let t = 0;
  const gh = github({ token: 't', repo: 'o/r', now: () => t, sleep: async () => {}, fetchImpl: async () => answers.shift() });
  const answers = [limited(429, { 'retry-after': '30' }), answer(200, { number: 1 })];
  t = 11.8 * 60_000;
  await assert.rejects(gh.getPr(1), (e) => e.rateLimited === true);
});

test('a factory state is kept in a ref whose commit message is the JSON, and removed with null', async () => {
  const refs = {};
  const commits = {};
  let seq = 0;
  const gh = github({
    token: 't', repo: 'o/r', sleep: async () => {},
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname.replace('/repos/o/r', '');
      const body = init.body ? JSON.parse(init.body) : null;
      if (init.method === 'POST' && path === '/git/trees') return answer(201, { sha: 'tree' });
      if (init.method === 'POST' && path === '/git/commits') { const sha = `c${++seq}`; commits[sha] = body.message; return answer(201, { sha }); }
      if (init.method === 'POST' && path === '/git/refs') { refs[body.ref.replace('refs/', '')] = body.sha; return answer(201, {}); }
      const ref = path.replace(/^\/git\/refs?\//, '');
      if (init.method === 'PATCH') { if (!refs[ref]) return answer(422); refs[ref] = body.sha; return answer(200, {}); }
      if (init.method === 'DELETE') { delete refs[ref]; return answer(204); }
      if (path.startsWith('/git/commits/')) return answer(200, { message: commits[path.split('/').pop()] });
      return refs[ref] ? answer(200, { object: { sha: refs[ref] } }) : answer(404);
    },
  });
  assert.equal(await gh.getState('sync'), null);
  await gh.setState('sync', { tries: 1 });
  assert.deepEqual(await gh.getState('sync'), { tries: 1 });
  await gh.setState('sync', { tries: 2 });
  assert.deepEqual(await gh.getState('sync'), { tries: 2 });
  await gh.setState('sync', null);
  assert.equal(await gh.getState('sync'), null);
});

// Issue #212: the queue lock's sign of life moves the lock forward, never over a run that took it over.
test('the queue lock gives a sign of life by moving its ref forward, and knows when it lost it', async () => {
  const calls = [];
  const replies = {
    'GET /git/ref/factory/lock': [null, { object: { sha: 'taken-over' } }],
    'POST /git/trees': [{ sha: 'tree1' }],
    'POST /git/commits': [{ sha: 'c1' }, { sha: 'c2' }, { sha: 'c3' }],
    'POST /git/refs': [{}],
    'PATCH /git/refs/factory/lock': [{}, 422],
  };
  const gh = github({
    token: 't', repo: 'o/r', sleep: async () => {},
    fetchImpl: async (url, init) => {
      const key = `${init.method} ${url.replace('https://api.github.com/repos/o/r', '')}`;
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      const a = (replies[key] || []).shift();
      if (a === null) return answer(404);
      if (a === 422) return answer(422);
      return answer(200, a);
    },
  });
  assert.equal(await gh.queueLock.acquire(), true);
  assert.equal(await gh.queueLock.refresh(), true);
  const beat = calls.filter((c) => c.key === 'POST /git/commits')[1].body;
  assert.deepEqual(beat.parents, ['c1']);
  assert.equal(beat.tree, 'tree1');
  const patch = calls.find((c) => c.key === 'PATCH /git/refs/factory/lock').body;
  assert.deepEqual(patch, { sha: 'c2', force: false });
  // Someone took the lock over: the fast-forward is refused, and this run no longer owns it.
  assert.equal(await gh.queueLock.refresh(), false);
  const before = calls.length;
  await gh.queueLock.release();
  assert.ok(!calls.slice(before).some((c) => c.key.startsWith('DELETE')), 'never drops a lock it lost');
});

test('a sign of life whose answer was lost but that went through is not taken for a lost lock', async () => {
  const replies = {
    'GET /git/ref/factory/lock': [null, { object: { sha: 'c2' } }],
    'POST /git/trees': [{ sha: 'tree1' }],
    'POST /git/commits': [{ sha: 'c1' }, { sha: 'c2' }],
    'POST /git/refs': [{}],
    'PATCH /git/refs/factory/lock': [422],
  };
  const gh = github({
    token: 't', repo: 'o/r', sleep: async () => {},
    fetchImpl: async (url, init) => {
      const a = (replies[`${init.method} ${url.replace('https://api.github.com/repos/o/r', '')}`] || []).shift();
      return a === null ? answer(404) : a === 422 ? answer(422) : answer(200, a);
    },
  });
  await gh.queueLock.acquire();
  assert.equal(await gh.queueLock.refresh(), true);
});

test('a late sign of life from an earlier hold never spoils the next hold of the same run', async () => {
  let releasePatch;
  const replies = {
    'GET /git/ref/factory/lock': [null, { object: { sha: 'c1' } }, null, { object: { sha: 'd1' } }, { object: { sha: 'd1' } }],
    'POST /git/trees': [{ sha: 't1' }, { sha: 't2' }],
    'POST /git/commits': [{ sha: 'c1' }, { sha: 'c2' }, { sha: 'd1' }],
    'POST /git/refs': [{}, {}],
    'DELETE /git/refs/factory/lock': [{}, {}],
  };
  const calls = [];
  const gh = github({
    token: 't', repo: 'o/r', sleep: async () => {},
    fetchImpl: async (url, init) => {
      const key = `${init.method} ${url.replace('https://api.github.com/repos/o/r', '')}`;
      calls.push(key);
      if (key === 'PATCH /git/refs/factory/lock') return new Promise((r) => { releasePatch = () => r(answer(422)); });
      const a = (replies[key] || []).shift();
      if (key.startsWith('DELETE')) return answer(204);
      return a === null ? answer(404) : answer(200, a);
    },
  });
  await gh.queueLock.acquire(); // c1
  const late = gh.queueLock.refresh(); // PATCH c1 -> c2 hangs
  await new Promise((r) => setImmediate(r));
  await gh.queueLock.release(); // ref is c1: dropped
  await gh.queueLock.acquire(); // d1, the next hold
  releasePatch();
  assert.equal(await late, false);
  const before = calls.length;
  await gh.queueLock.release();
  assert.ok(calls.slice(before).includes('DELETE /git/refs/factory/lock'), 'the next hold is still released');
});

test('a sign of life refused while the lock is still ours keeps the lock (a failed send, not a lost lock)', async () => {
  const calls = [];
  const replies = {
    'GET /git/ref/factory/lock': [null, { object: { sha: 'c1' } }, { object: { sha: 'c1' } }],
    'POST /git/trees': [{ sha: 't1' }],
    'POST /git/commits': [{ sha: 'c1' }, { sha: 'c2' }],
    'POST /git/refs': [{}],
  };
  const gh = github({
    token: 't', repo: 'o/r', sleep: async () => {},
    fetchImpl: async (url, init) => {
      const key = `${init.method} ${url.replace('https://api.github.com/repos/o/r', '')}`;
      calls.push(key);
      if (key.startsWith('PATCH')) return answer(422);
      if (key.startsWith('DELETE')) return answer(204);
      const a = (replies[key] || []).shift();
      return a === null ? answer(404) : answer(200, a);
    },
  });
  await gh.queueLock.acquire();
  await assert.rejects(gh.queueLock.refresh(), /422/);
  await gh.queueLock.release();
  assert.ok(calls.includes('DELETE /git/refs/factory/lock'), 'still released at the end');
});

test('the PRs of one branch are asked with the owner prefix GitHub expects, closed and merged ones included', async () => {
  const urls = [];
  const gh = github({ token: 't', repo: 'o/r', sleep: async () => {}, fetchImpl: async (url) => { urls.push(url); return answer(200, []); } });
  await gh.pullsByHead('claude/revert-pr-10');
  assert.match(urls[0], /\/repos\/o\/r\/pulls\?state=all&per_page=30&head=o%3Aclaude%2Frevert-pr-10$/);
});

test("the comments and reviews the relay reads lose the factory notes of strangers (issue #339)", async () => {
  const thread = [
    { id: 1, body: '<!-- factory-agent -->\nbloqué\n<!-- factory-waits-for #12 -->', user: { login: 'o' } },
    { id: 2, body: '<!-- factory-agent -->\n<!-- factory-waits-done -->', user: { login: 'stranger' }, author_association: 'NONE' },
  ];
  for (const read of [(gh) => gh.listComments(1), (gh) => gh.listCommentsSince(1, '2026-01-01T00:00:00Z'), (gh) => gh.listReviews(1)]) {
    const got = await read(client([answer(200, structuredClone(thread))]));
    assert.equal(got[0].body, thread[0].body);
    assert.equal(got[1].body.includes('<!-- factory-'), false);
  }
});

// Issue #372: refs/factory/live, the commit the site's version tag names, and the tag's short id resolved.
test('the live ref is created, moved and removed; a missing one reads as null', async () => {
  const refs = {};
  const seen = [];
  const gh = github({
    token: 't', repo: 'o/r', sleep: async () => {},
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname.replace('/repos/o/r', '');
      const body = init.body ? JSON.parse(init.body) : null;
      seen.push(`${init.method} ${path}`);
      if (init.method === 'POST' && path === '/git/refs') { refs[body.ref.replace('refs/', '')] = body.sha; return answer(201, {}); }
      const ref = path.replace(/^\/git\/refs?\//, '');
      if (init.method === 'PATCH') { if (!refs[ref]) return answer(422); refs[ref] = body.sha; return answer(200, {}); }
      if (init.method === 'DELETE') { if (!refs[ref]) return answer(422); delete refs[ref]; return answer(204); }
      return refs[ref] ? answer(200, { object: { sha: refs[ref] } }) : answer(404);
    },
  });
  assert.equal(await gh.getLiveRef(), null);
  await gh.setLiveRef('aaa');
  assert.equal(await gh.getLiveRef(), 'aaa');
  assert.ok(seen.includes('POST /git/refs'));
  await gh.setLiveRef('bbb');
  assert.equal(await gh.getLiveRef(), 'bbb');
  await gh.setLiveRef(null);
  assert.equal(await gh.getLiveRef(), null);
  await gh.setLiveRef(null); // already gone: no error
  assert.ok(seen.includes('GET /git/ref/factory/live'));
});

test('a version tag naming a commit GitHub does not know resolves to null (404 or 422), other errors throw', async () => {
  assert.deepEqual(await client([answer(200, { sha: 'full' })]).resolveCommit('abc1234'), { sha: 'full' });
  assert.equal(await client([answer(422)]).resolveCommit('fffffff'), null);
  assert.equal(await client([answer(404)]).resolveCommit('fffffff'), null);
  await assert.rejects(client([answer(403)]).resolveCommit('abc1234'));
});
