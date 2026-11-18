// Issue #491: how many GitHub reads each typical passage of the relay costs, so that the figure never silently goes
// back up. The rehearsal's world plays the passage; each relay run gets a client that behaves like
// scripts/lib/github.mjs: a read whose answer did not change since the same read in the same run is a free 304.
// This is a model of the client, for whole passages; the client itself (pages, 304 without Link, label lists) is
// tested on its real code in test/github.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './sim/world.mjs';
import { L } from '../scripts/lib/labels.mjs';

const config = {
  runner: 'claude-cloud', maxParallel: 2, autoPick: false,
  stages: { grilling: true, specReview: true, plan: true, tdd: true, review: true, designPass: true, screenshots: true, checks: true, acceptance: true },
  review: { maxLoops: 3 },
};
const READ = /^(get|list|pullsBy|failedRuns|runJobs|deployments|recentDeployments|liveDeployments|deploymentStatuses|checkRuns|compare|resolveCommit)/;

// Every read call (`calls`) and the ones GitHub would count (`counted`), the run cache's 304s left out.
export function readMeter() {
  const m = { calls: 0, counted: 0 };
  m.spy = (gh) => {
    const seen = new Map(); // one relay run: read -> answer it last gave
    return new Proxy(gh, {
      get(target, name) {
        const fn = target[name];
        if (typeof name !== 'string' || typeof fn !== 'function' || !READ.test(name)) return fn;
        return async (...args) => {
          const answer = await fn.apply(target, args);
          // Like github.mjs: the open cards of one label are filtered from the one list of open issues.
          const q = args[0] || {};
          const derived = name === 'listIssues' && typeof q.labels === 'string' && !q.labels.includes(',') && Object.keys(q).every((k) => ['labels', 'sort', 'direction'].includes(k)) && (q.sort ?? 'created') === 'created';
          const key = derived ? 'listOpenIssues []' : `${name} ${JSON.stringify(args)}`;
          const text = JSON.stringify(derived ? await target.listOpenIssues() : answer ?? null);
          m.calls++;
          if (answer == null || seen.get(key) !== text) m.counted++; // a 404 is never kept (github.mjs)
          if (answer != null) seen.set(key, text);
          return answer;
        };
      },
    });
  };
  m.take = () => { const r = { calls: m.calls, counted: m.counted }; m.calls = 0; m.counted = 0; return r; };
  return m;
}

async function passages() {
  const meter = readMeter();
  const w = createWorld({ config, agent: { ui: true }, previews: true, spy: meter.spy });
  const n = await w.owner.openIssue({ title: 'Mode sombre', labels: [L.feature] });
  await w.owner.openIssue({ title: 'Autre idée', labels: [L.feature] });
  meter.take();
  await w.wait(5);
  const idle = meter.take();
  await w.owner.say(n, 'go');
  const message = meter.take();
  await w.wait(5);
  const waiting = meter.take();
  return { idle, message, waiting };
}

test('the run cache spares most repeated reads in every typical passage', async () => {
  const p = await passages();
  for (const [name, r] of Object.entries(p)) assert.ok(r.counted <= r.calls * 0.6, `${name}: ${r.counted} counted of ${r.calls} reads`);
});

test('the counted reads of each typical passage stay within their measured budget (issue #491)', async () => {
  const p = await passages();
  // Measured on 2026-11-18, counted reads before → after: idle tick 23 → 6, « go » up to the PR waiting for its captures
  // 135 → 70 (several relay runs: each reads the open lists once), tick with a PR waiting 25 → 6.
  // A change that reads more must raise these on purpose, with its reason.
  const budget = { idle: 6, message: 70, waiting: 6 };
  for (const [name, max] of Object.entries(budget)) assert.ok(p[name].counted <= max, `${name}: ${p[name].counted} counted reads, budget ${max} (${p[name].calls} calls)`);
});
