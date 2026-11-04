// The rehearsal: whole journeys through the factory, from the owner's first message to the merge, in a fake
// GitHub that behaves like the real one (test/sim/world.mjs). A version is declared stable only when they pass
// (stable.yml runs every test), so a broken journey is caught here, not by the owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, healthProblems, FILTER } from './sim/world.mjs';
import { L, AGENT_MARKER } from '../scripts/lib/labels.mjs';

const base = {
  runner: 'claude-cloud', maxParallel: 2, autoPick: false,
  stages: { grilling: true, specReview: true, plan: true, tdd: true, review: true, designPass: true, screenshots: true, checks: true, acceptance: true },
  review: { maxLoops: 3 },
};
const healthy = (world) => assert.deepEqual(healthProblems(world), [], world.log.slice(-40).join('\n'));

test('rehearsal: the simulated workflow filter is the one projects really have', () => {
  for (const file of ['.github/workflows/factory.yml']) {
    const yml = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const named = (re) => [...yml.matchAll(re)].map((m) => m[1]);
    assert.deepEqual(new Set(named(/github\.event\.label\.name == '([^']+)'/g)), new Set([...FILTER.issueLabeled, ...FILTER.prLabeled, ...FILTER.unlabeled]), file);
  }
});

test('rehearsal: a feature goes from the first message to the merge, and its issue closes', async () => {
  const w = createWorld({ config: base });
  const n = await w.owner.openIssue({ title: 'Mode sombre', labels: [L.feature] });
  assert.ok(w.labels(n).includes(L.specReview));
  await w.owner.say(n, 'go');
  const pr = w.prOf(n);
  assert.ok(pr, 'the build opened a PR');
  healthy(w);
  assert.deepEqual(w.stages(), ['grilling', 'build']);
  assert.ok(w.get(pr).merged_at, 'no preview: green checks go live directly');
});

test('rehearsal: a visible change waits for the owner on the captures, then on the preview', async () => {
  const w = createWorld({ config: base, agent: { ui: true }, previews: true });
  const n = await w.owner.openIssue({ title: 'Nouveau bouton', labels: [L.feature] });
  await w.owner.say(n, 'go');
  const pr = w.prOf(n);
  assert.ok(w.labels(pr).includes(L.visualReview));
  await w.owner.say(pr, 'Le bouton plus grand');
  assert.equal(w.stages().at(-1), 'visual-fix');
  await w.owner.say(pr, 'ok');
  assert.ok(w.labels(pr).includes(L.acceptance));
  assert.ok(w.get(pr).comments.some((c) => c.body.includes('https://preview.example')));
  await w.owner.say(pr, 'ok');
  healthy(w);
});

test('rehearsal: a bug is fixed and merged without asking anything', async () => {
  const w = createWorld({ config: base });
  const n = await w.owner.openIssue({ title: 'Le bouton plante', labels: [L.bug] });
  healthy(w);
  assert.deepEqual(w.stages(), ['bugfix']);
  assert.ok(w.get(w.prOf(n)).merged_at);
});

test('rehearsal: with one place, the second feature waits and starts as soon as the first PR is open', async () => {
  const w = createWorld({ config: { ...base, maxParallel: 1 }, previews: true });
  const a = await w.owner.openIssue({ title: 'A', labels: [L.feature] });
  const b = await w.owner.openIssue({ title: 'B', labels: [L.feature] });
  w.pauseAgents();
  await w.owner.say(a, 'go');
  await w.owner.say(b, 'go');
  assert.ok(w.labels(b).includes(L.queued), 'B waits while A builds');
  await w.resumeAgents();
  assert.ok(w.labels(b).includes(L.building), 'A has its PR: B starts');
  await w.owner.say(w.prOf(a), 'ok');
  await w.owner.say(w.prOf(b), 'ok');
  healthy(w);
});

test('rehearsal: a message written during a build that already went live does not restart the card', async () => {
  const w = createWorld({ config: base });
  const n = await w.owner.openIssue({ title: 'Export', labels: [L.feature] });
  w.pauseAgents();
  await w.owner.say(n, 'go'); // the build has started, its agent is not done yet
  await w.owner.say(n, 'Et en CSV aussi');
  assert.ok(w.labels(n).includes(L.pending));
  await w.resumeAgents();
  // Here the build was merged before its agent released the lock: the card is over, it must not start again.
  assert.deepEqual(w.stages(), ['grilling', 'build']);
  assert.ok(w.get(n).comments.some((c) => /déjà terminée/.test(c.body)), 'the owner learns why nothing happens');
  healthy(w);
});

test('rehearsal: a message written while the agent works is answered once it has finished', async () => {
  const w = createWorld({ config: base, previews: true });
  const n = await w.owner.openIssue({ title: 'Export', labels: [L.feature] });
  w.pauseAgents();
  await w.owner.say(n, 'go');
  await w.owner.say(n, 'Et en CSV aussi');
  assert.ok(w.labels(n).includes(L.pending));
  await w.resumeAgents();
  assert.equal(w.stages().at(-1), 'feedback');
  await w.owner.say(w.prOf(n), 'ok');
  healthy(w);
});

test('rehearsal: a PR put in conflict by another merge is updated and still goes live', async () => {
  const w = createWorld({ config: base, previews: true, agent: { conflicts: (issue, pr) => (pr === 4 ? 3 : null) } });
  const a = await w.owner.openIssue({ title: 'A', labels: [L.feature] });
  const b = await w.owner.openIssue({ title: 'B', labels: [L.feature] });
  await w.owner.say(a, 'go');
  await w.owner.say(b, 'go');
  await w.owner.say(w.prOf(a), 'ok'); // merging A puts B in conflict
  await w.owner.say(w.prOf(b), 'ok'); // the merge fails: the branch is brought up to date
  assert.ok(w.stages().includes('update-branch'));
  assert.ok(w.labels(w.prOf(b)).includes(L.acceptance), 'back to the owner after fresh checks');
  await w.owner.say(w.prOf(b), 'ok');
  healthy(w);
});

test('rehearsal: red checks are fixed by the agent, then the feature goes live', async () => {
  let reds = 1;
  const w = createWorld({ config: base, checks: () => (reds-- > 0 ? 'failure' : 'success') });
  const n = await w.owner.openIssue({ title: 'Calcul', labels: [L.feature] });
  await w.owner.say(n, 'go');
  assert.ok(w.stages().includes('fix-checks'));
  healthy(w);
});

test('rehearsal: an agent that skipped the code review catches up once, and no alert stays', async () => {
  const w = createWorld({
    config: base,
    agent: {
      build: (r, { openPr, addLabels }) => {
        const pr = openPr('agent', { issue: r.issue, files: [{ path: '.factory/journal/b.jsonl', content: [
          { t: 'a', kind: 'run', stage: 'build' }, { t: 'a', kind: 'skill', name: 'writing-plans' }, { t: 'a', kind: 'skill', name: 'test-driven-development' },
          { t: 'a', kind: 'test', ok: false }, { t: 'a', kind: 'test', ok: true }].map((e) => JSON.stringify(e)).join('\n') }] });
        addLabels('agent', pr, [L.checks]);
      },
    },
  });
  const n = await w.owner.openIssue({ title: 'Sans revue', labels: [L.feature] });
  await w.owner.say(n, 'go');
  assert.ok(w.stages().includes('skills-fix'));
  healthy(w);
});

test('rehearsal: an agent session that vanishes is caught by the guard and the card ends well', async () => {
  let first = true;
  const w = createWorld({ config: base, agent: { build: (r, api) => (first ? ((first = false), 'die') : api.behaviours.build(r)) } });
  const n = await w.owner.openIssue({ title: 'Fragile', labels: [L.feature] });
  await w.owner.say(n, 'go');
  assert.ok(w.labels(n).includes(L.running), 'the dead session never released its lock');
  await w.wait(160); // past the lock's time limit
  assert.equal(w.stages().filter((s) => s === 'build').length, 2, 'relaunched once');
  assert.equal(w.fires.at(-1).relaunch, true);
  healthy(w);
});

test('rehearsal: a build that ends without a PR or a question is relaunched, then set aside with one message', async () => {
  const w = createWorld({ config: base, agent: { build: () => {} } });
  const n = await w.owner.openIssue({ title: 'Muet', labels: [L.feature] });
  await w.owner.say(n, 'go');
  await w.wait(35);
  assert.equal(w.stages().filter((s) => s === 'build').length, 2);
  await w.wait(35);
  assert.equal(w.stages().filter((s) => s === 'build').length, 2, 'no third run');
  assert.ok(w.labels(n).includes(L.blocked));
  const told = w.get(n).comments.filter((c) => c.body.includes(AGENT_MARKER) && /réessaie/.test(c.body));
  assert.equal(told.length, 1);
});

test('rehearsal: an issue left open after its merge is closed by the guard and frees its place', async () => {
  const w = createWorld({ config: { ...base, maxParallel: 1 } });
  const a = await w.owner.openIssue({ title: 'A', labels: [L.feature] });
  await w.owner.say(a, 'go');
  // Lost close: reopen the issue the factory closed, as if GitHub had never closed it.
  const i = w.get(a);
  i.open = true;
  i.labels.push(L.building);
  const b = await w.owner.openIssue({ title: 'B', labels: [L.feature] });
  await w.owner.say(b, 'go');
  assert.ok(w.labels(b).includes(L.queued));
  await w.wait(5);
  assert.equal(w.get(a).open, false);
  healthy(w);
});
