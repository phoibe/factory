// The rehearsal's fake world: a small GitHub that behaves like the real one where the factory got burnt before
// (an action made with the workflow's own token starts no workflow, a PR's labels are issue labels, the issue
// list also lists PRs), the project's factory.yml filter, the relay jobs, a routine and a well-behaved agent.
// Scenarios in test/rehearsal.test.mjs drive the owner; the world runs everything else until it settles.
import { createRelay, eventFromPayload } from '../../scripts/relay.mjs';
import { L, AGENT_MARKER } from '../../scripts/lib/labels.mjs';

export const OWNER = 'phoibe';
const MIN = 60_000;

// The `if:` of the project's factory.yml (checked against the file itself by the rehearsal).
export const FILTER = {
  issueLabeled: [L.feature, L.bug, L.project, L.question, L.audit],
  prLabeled: [L.checks],
  unlabeled: [L.running, L.building],
};

function passes(eventName, p) {
  if (eventName === 'issues' && p.action === 'labeled' && !FILTER.issueLabeled.includes(p.label.name)) return false;
  if (eventName === 'pull_request' && p.action === 'labeled' && !FILTER.prLabeled.includes(p.label.name)) return false;
  if ((eventName === 'issues' || eventName === 'pull_request') && p.action === 'unlabeled' && !FILTER.unlabeled.includes(p.label.name)) return false;
  if (eventName === 'issue_comment' && (p.comment.body || '').includes(AGENT_MARKER)) return false;
  return true;
}

export function createWorld({ config, agent = {}, previews = false, checks = () => 'success', previewResult = { result: 'passed', detail: 'ok' } } = {}) {
  let now = Date.parse('2026-11-04T08:00:00Z');
  let seq = 0;
  let num = 0; // issue and PR numbers
  let paused = false; // agent runs wait (the owner writes while an agent works)
  const items = new Map(); // issues and PRs share their numbers, like on GitHub
  const events = []; // webhooks waiting for a relay run
  const fires = []; // every agent run the routine received
  const previewChecks = []; // previews the factory opened before the recette
  const liveChecks = []; // live sites the factory opened after a merge
  const pendingRuns = []; // agent runs not played yet
  const log = [];
  const iso = () => new Date(now).toISOString();
  const get = (n) => items.get(Number(n));
  const asIssue = (i) => ({
    number: i.number, title: i.title, body: i.body, state: i.open ? 'open' : 'closed', created_at: i.created_at, updated_at: i.updated_at,
    labels: i.labels.map((name) => ({ name })), ...(i.pr ? { pull_request: {} } : {}),
  });
  const asPr = (i) => ({
    ...asIssue(i), head: { ref: i.branch, sha: i.sha }, merged_at: i.merged_at || null, mergeable_state: i.dirty ? 'dirty' : 'clean',
    state: i.open ? 'open' : 'closed',
  });
  const sender = (actor) => ({ login: actor === 'bot' ? 'github-actions[bot]' : OWNER });
  const repository = { owner: { login: OWNER } };
  // Webhooks: none for the workflow's own token, like GitHub.
  const emit = (actor, eventName, payload) => {
    if (actor === 'bot') return;
    const p = { ...payload, repository, sender: sender(actor) };
    if (passes(eventName, p)) events.push({ eventName, p });
  };
  const touch = (i) => { i.updated_at = iso(); };
  const itemPayload = (i) => (i.pr ? { pull_request: asPr(i) } : { issue: asIssue(i) });
  const eventName = (i) => (i.pr ? 'pull_request' : 'issues');

  function addLabels(actor, n, labels) {
    const i = get(n);
    for (const l of labels) {
      if (i.labels.includes(l)) continue;
      i.labels.push(l);
      i.events.push({ event: 'labeled', label: { name: l }, created_at: iso() });
      touch(i);
      emit(actor, eventName(i), { action: 'labeled', label: { name: l }, ...itemPayload(i) });
    }
  }
  function removeLabel(actor, n, l) {
    const i = get(n);
    if (!i || !i.labels.includes(l)) return;
    i.labels = i.labels.filter((x) => x !== l);
    i.events.push({ event: 'unlabeled', label: { name: l }, created_at: iso() });
    touch(i);
    emit(actor, eventName(i), { action: 'unlabeled', label: { name: l }, ...itemPayload(i) });
  }
  function comment(actor, n, body) {
    const i = get(n);
    const c = { id: ++seq * 1000, body, user: { login: actor === 'bot' ? 'github-actions[bot]' : OWNER }, created_at: iso() };
    i.comments.push(c);
    touch(i);
    emit(actor, 'issue_comment', { action: 'created', comment: c, issue: asIssue(i) });
    return c;
  }
  function openIssue(actor, { title, body = '', labels = [] }) {
    const n = ++num;
    const i = { number: n, title, body, labels: [...labels], open: true, comments: [], events: [], created_at: iso(), updated_at: iso() };
    items.set(n, i);
    emit(actor, 'issues', { action: 'opened', issue: asIssue(i) });
    // An issue form with labels also sends « labeled », which the relay must not start twice.
    for (const l of labels) emit(actor, 'issues', { action: 'labeled', label: { name: l }, issue: asIssue(i) });
    return n;
  }
  function openPr(actor, { issue, files }) {
    const n = ++num;
    const i = {
      number: n, pr: true, title: `PR for #${issue}`, body: `Résumé\n\nCloses #${issue}`, labels: [], open: true, comments: [], events: [],
      branch: `claude/issue-${issue}-work`, sha: `sha${n}a`, files, created_at: iso(), updated_at: iso(),
    };
    items.set(n, i);
    emit(actor, 'pull_request', { action: 'opened', pull_request: asPr(i) });
    return n;
  }
  function push(actor, n, files = []) {
    const i = get(n);
    i.sha = `sha${n}${++seq}`;
    i.files.push(...files);
    i.dirty = false;
    emit(actor, 'pull_request', { action: 'synchronize', pull_request: asPr(i) });
  }

  // The GitHub client the relay uses: every write is made with the workflow's token.
  const gh = {
    getIssue: async (n) => get(n) && asIssue(get(n)),
    getPr: async (n) => get(n)?.pr && asPr(get(n)),
    getRepo: async () => ({ default_branch: 'main' }),
    listIssues: async ({ labels, direction }) => {
      const list = [...items.values()].filter((i) => i.open && (!labels || i.labels.includes(labels))).map(asIssue);
      return direction === 'asc' ? list.sort((a, b) => a.number - b.number) : list;
    },
    listPulls: async () => [...items.values()].filter((i) => i.pr && i.open).map(asPr),
    listClosedPulls: async () => [...items.values()].filter((i) => i.pr && !i.open).map(asPr),
    listComments: async (n) => get(n)?.comments || [],
    listEvents: async (n) => get(n)?.events || [],
    listReviews: async () => [],
    react: async () => {},
    dispatch: async (wf, ref, inputs) => {
      // A dispatch is the one thing the workflow token may start.
      if (wf === 'factory.yml') events.push({ eventName: 'workflow_dispatch', p: { inputs, repository, sender: sender('bot') } });
    },
    comment: async (n, body) => comment('bot', n, body),
    updateComment: async (id, body) => { for (const i of items.values()) for (const c of i.comments) if (c.id === id) c.body = body; },
    addLabels: async (n, labels) => addLabels('bot', n, labels),
    removeLabel: async (n, l) => removeLabel('bot', n, l),
    closeIssue: async (n) => { const i = get(n); i.open = false; touch(i); },
    merge: async (n, sha) => {
      const i = get(n);
      if (sha && sha !== i.sha) throw new Error('Head branch was modified');
      if (i.dirty) throw new Error('Pull Request is not mergeable');
      i.open = false;
      i.merged_at = iso();
      // Merging moves main: the other open PRs touching the same files fall into conflict.
      for (const other of items.values()) if (other.pr && other.open && other.conflictsWith === n) other.dirty = true;
    },
    listPrFiles: async (n) => (get(n)?.files || []).map((f) => ({ filename: f.path, status: 'added', patch: '' })),
    getContent: async (path) => {
      for (const i of items.values()) for (const f of i.files || []) if (f.path === path) return { content: Buffer.from(f.content).toString('base64') };
      return null;
    },
    deployments: async () => (previews ? [{ id: 1 }] : []),
    recentDeployments: async () => (previews ? [{ id: 1, environment: 'Preview' }] : []),
    deploymentStatuses: async () => [{ state: 'success', environment_url: 'https://preview.example' }],
  };

  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(JSON.parse(init.body).text.split('\n\n').slice(1).join('\n\n'));
    fires.push(payload);
    pendingRuns.push(payload);
    return { ok: true, json: async () => ({ claude_code_session_url: `https://claude.ai/code/s${fires.length}` }), text: async () => '' };
  };
  const env = { FACTORY_ROUTINE_URL: 'https://api.anthropic.com/routine/fire', FACTORY_ROUTINE_TOKEN: 'tok' };
  const relayFor = () => createRelay({ gh, repo: 'phoibe/app', config, env, fetchImpl, now: () => now, log: (m) => log.push(m), sleep: async () => {} });

  // One relay workflow run: the decide job, then the checks and report jobs when it asks for them.
  async function relayRun({ eventName: name, p }) {
    const relay = relayFor();
    const { outputs } = await relay.handle(eventFromPayload(name, p, now), { ownerLogin: OWNER });
    if (outputs.checks === 'true') {
      const pr = get(outputs.pr);
      const result = pr.dirty ? null : checks(pr); // GitHub starts no checks on a conflicted PR
      if (result) await relayFor().report({ result, pr: pr.number, sha: pr.sha, started: Math.floor(now / 1000), now });
    }
    // The preview job: the factory opens the preview (smoke.mjs), then the report goes on with its result.
    if (outputs.preview) {
      const check = JSON.parse(outputs.preview);
      previewChecks.push(check);
      // It first waits for the preview (outside the queue lock), then opens it.
      const url = await relayFor().previewWait(check);
      const res = url ? (typeof previewResult === 'function' ? previewResult(check) : previewResult) : { result: 'skipped' };
      await relayFor().report({ result: 'success', pr: check.pr, sha: check.sha, now, preview: { ...res, url } });
    }
    if (outputs.production) liveChecks.push(JSON.parse(outputs.production));
  }

  const journal = (stage, skills, tests = []) => ({
    path: `.factory/journal/${stage}-${++seq}.jsonl`,
    content: [{ t: iso(), kind: 'run', stage }, ...skills.map((name) => ({ t: iso(), kind: 'skill', name })),
      ...tests.map((ok) => ({ t: iso(), kind: 'test', cmd: 'npm test', ok }))].map((e) => JSON.stringify(e)).join('\n'),
  });
  const SKILLS = {
    build: ['writing-plans', 'test-driven-development', 'requesting-code-review'],
    bugfix: ['systematic-debugging', 'requesting-code-review'],
    foundation: ['requesting-code-review'],
    audit: ['impeccable', 'requesting-code-review'],
  };

  // A well-behaved agent, as AGENT.md describes it. `agent[stage]` replaces a stage's behaviour in a scenario.
  const prOf = (issue) => [...items.values()].find((i) => i.pr && i.open && i.body.includes(`Closes #${issue}`))?.number;
  const behaviours = {
    grilling: (r) => { comment('agent', r.issue, `${AGENT_MARKER}\n<!-- factory-spec -->\nSpec`); removeLabel('agent', r.issue, L.grilling); addLabels('agent', r.issue, [L.specReview]); },
    spec: (r) => behaviours.grilling(r),
    build: (r) => {
      const ui = Boolean(agent.ui);
      const files = [journal(r.stage, [...SKILLS[r.stage], ...(ui ? ['impeccable'] : [])], [false, true]), { path: ui ? 'src/App.tsx' : 'src/app.js', content: 'x' }];
      const pr = prOf(r.issue) || openPr('agent', { issue: r.issue, files });
      if (agent.conflicts) get(pr).conflictsWith = agent.conflicts(r.issue, pr);
      if (ui) {
        comment('agent', pr, `${AGENT_MARKER}\nCaptures https://x/claude/factory-assets/a.png`);
        // The checks run while the owner looks at the captures.
        addLabels('agent', pr, agent.serialChecks ? [L.visualReview] : [L.visualReview, L.checks]);
      } else addLabels('agent', pr, [L.checks]);
      comment('agent', r.issue, `${AGENT_MARKER}\nPR #${pr}`);
    },
    bugfix: (r) => behaviours.build(r),
    foundation: (r) => behaviours.build(r),
    audit: (r) => behaviours.build(r),
    resume: (r) => (r.pr ? behaviours['fix-checks'](r) : behaviours.build(r)),
    feedback: (r) => { comment('agent', r.pr || r.issue, `${AGENT_MARKER}\nRéponse`); },
    'visual-fix': (r) => { push('agent', r.pr); comment('agent', r.pr, `${AGENT_MARKER}\nNouvelles captures https://x/claude/factory-assets/b.png`); if (!agent.serialChecks) addLabels('agent', r.pr, [L.checks]); },
    'acceptance-fix': (r) => { push('agent', r.pr); addLabels('agent', r.pr, [L.checks]); },
    'fix-checks': (r) => { push('agent', r.pr); addLabels('agent', r.pr, [L.checks]); },
    'skills-fix': (r) => { push('agent', r.pr, [journal('skills-fix', r.missing || [])]); addLabels('agent', r.pr, [L.checks]); },
    'update-branch': (r) => { removeLabel('agent', r.pr, L.fixing); push('agent', r.pr); addLabels('agent', r.pr, [L.checks]); },
    question: (r) => { comment('agent', r.issue, `${AGENT_MARKER}\nRéponse`); },
  };

  async function playRun(r) {
    const b = agent[r.stage] ?? behaviours[r.stage];
    const res = typeof b === 'function' ? await b(r, { comment, addLabels, removeLabel, push, openPr, get, behaviours }) : b;
    if (res === 'die') return; // the session vanished: no label is ever removed
    // Last action of every run: release the lock (AGENT.md).
    for (const n of [r.issue, r.pr].filter(Boolean)) removeLabel('agent', n, L.running);
  }

  // Runs relays and agents until nothing moves. An agent run plays only once the relay run that fired it is over.
  async function settle(max = 400) {
    for (let k = 0; k < max; k++) {
      now += 1000;
      if (events.length) { await relayRun(events.shift()); continue; }
      if (pendingRuns.length && !paused) { await playRun(pendingRuns.shift()); continue; }
      return;
    }
    throw new Error(`the factory never settles (loop?)\n${log.slice(-30).join('\n')}`);
  }

  return {
    get now() { return now; },
    items, fires, log, get, previewChecks, liveChecks,
    owner: {
      openIssue: async (o) => { const n = openIssue('owner', o); await settle(); return n; },
      say: async (n, text) => { comment('owner', n, text); await settle(); },
      sayNoSettle: (n, text) => comment('owner', n, text),
    },
    // Time passes: the 5-minute safety tick runs at each step.
    wait: async (minutes) => {
      for (let m = 0; m < minutes; m += 5) {
        now += 5 * MIN;
        events.push({ eventName: 'schedule', p: { repository } });
        await settle();
      }
    },
    settle,
    // Agents started from now on wait until `resume` (to write while an agent works).
    pauseAgents: () => { paused = true; },
    resumeAgents: async () => { paused = false; await settle(); },
    prOf: (issue) => [...items.values()].find((i) => i.pr && i.body.includes(`Closes #${issue}`))?.number,
    labels: (n) => [...get(n).labels],
    stages: () => fires.map((f) => f.stage),
  };
}

// What must hold once the dust settles, whatever the scenario: nothing left half-way.
export function healthProblems(world) {
  const out = [];
  for (const i of world.items.values()) {
    const tag = `${i.pr ? 'PR' : 'issue'} #${i.number}`;
    if (i.labels.includes(L.running)) out.push(`${tag} still says an agent is working`);
    if (i.labels.includes(L.pending)) out.push(`${tag} has a message nobody handled`);
    if (i.labels.includes(L.skillsAlert)) out.push(`${tag} shows a skills alert`);
    if (i.pr && i.open) out.push(`${tag} is still open`);
    if (!i.pr && i.open && !i.labels.includes(L.question)) out.push(`${tag} is still open (${i.labels.join(', ')})`);
  }
  return out;
}
