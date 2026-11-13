// Minimal GitHub REST client on fetch. `request` is the only network call, so tests can fake it.
import { rateLimitDelay, RateLimited, MAX_PAUSE_MS } from './ratelimit.mjs';
import { trustNotes } from './trust.mjs';
import { LIVE_REF } from './version-tag.mjs';
const HTML = 'application/vnd.github.full+json';

// GitHub answers 5xx now and then (503 « Service Unavailable », 500 on pushes…). One such answer used to kill a whole
// relay step: a PR whose checks were green then waited for nothing until the next tick. Those answers are retried.
// A POST is retried only on 503 (not served at all), so a comment or a label is never written twice.
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const transient = (method, status) => (method === 'POST' ? status === 503 : status >= 500);
// « Too many requests »: GitHub applied nothing, so any call (POST included) is sent again after the wait it asks.
// At most 3 pauses per call and 3 minutes of pauses per run: the job (15 min) must end on the rate-limit step, not on
// its timeout, so that its event is taken up again.
const MAX_RATE_PAUSES = 3;
const MAX_PAUSED_MS = 3 * 60_000;
const RUN_BUDGET_MS = 12 * 60_000; // the run may have waited its turn on the queue lock first: no pause past this

export function github({ token, repo, api = 'https://api.github.com', fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() }) {
  const started = now();
  let paused = 0; // ms spent in rate-limit pauses by this client
  // The network call with its retries; a network error (no answer at all) is retried only for idempotent methods
  // (a POST may have been applied before the connection broke).
  async function send(method, url, init) {
    let pauses = 0;
    for (let attempt = 0; ; attempt++) {
      let res;
      try { res = await fetchImpl(url, { method, ...init }); } catch (e) {
        if (method === 'POST' || attempt >= RETRY_DELAYS_MS.length) throw e;
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      const wait = rateLimitDelay(res.status, res.headers);
      if (wait !== null) {
        if (wait > MAX_PAUSE_MS || pauses >= MAX_RATE_PAUSES || paused + wait > MAX_PAUSED_MS || now() - started + wait > RUN_BUDGET_MS) throw new RateLimited(wait);
        pauses++;
        paused += wait;
        attempt--; // a pause is not one of the 5xx retries
        await sleep(wait);
        continue;
      }
      if (!transient(method, res.status) || attempt >= RETRY_DELAYS_MS.length) return res;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  async function request(method, path, body, accept = 'application/vnd.github+json') {
    const url = path.startsWith('http') ? path : `${api}${path.replace('{repo}', repo)}`;
    const res = await send(method, url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept,
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
  // Follows the Link header so long histories (events, comments) are read in full.
  async function paginate(path, accept = 'application/vnd.github+json') {
    const out = [];
    let url = `${api}${path.replace('{repo}', repo)}`;
    while (url) {
      const res = await send('GET', url, { headers: { authorization: `Bearer ${token}`, accept, 'x-github-api-version': '2022-11-28' } });
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      out.push(...(await res.json()));
      url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1];
    }
    return out;
  }
  const enc = encodeURIComponent;
  const trusted = (list) => trustNotes(list, repo.split('/')[0]);
  // The queue lock: a ref that exists or not. Creating a ref is atomic (422 when it exists), and the commit it
  // points to carries the time it was taken.
  const LOCK_REF = 'factory/lock';
  let mine = null; // sha of the lock commit this run created (moved forward by each sign of life)
  let tree = null; // the lock's content, reused by the signs of life
  let seen = null; // sha of the lock commit last seen held by someone else
  const lockSha = async () => (await request('GET', `/repos/{repo}/git/ref/${LOCK_REF}`))?.object.sha || null;
  const dropIf = async (sha) => {
    // The refs API has no compare-and-delete: check, then delete (a narrow window, far better than none).
    if (!sha || (await lockSha()) !== sha) return;
    try { await request('DELETE', `/repos/{repo}/git/refs/${LOCK_REF}`); } catch (e) { if (!/404|422/.test(String(e))) throw e; }
  };
  const queueLock = {
    async acquire() {
      seen = await lockSha();
      if (seen) return false; // cheap check first: waiting runs must not create a commit on every poll
      tree = (await request('POST', '/repos/{repo}/git/trees', { tree: [{ path: 'lock', mode: '100644', type: 'blob', content: String(Date.now()) }] })).sha;
      const commit = await request('POST', '/repos/{repo}/git/commits', { message: 'factory queue lock', tree, parents: [] });
      try { await request('POST', '/repos/{repo}/git/refs', { ref: `refs/${LOCK_REF}`, sha: commit.sha }); mine = commit.sha; return true; }
      catch (e) { if (String(e).includes('422')) return false; throw e; }
    },
    async ageMs() {
      if (!seen) return null;
      const commit = await request('GET', `/repos/{repo}/git/commits/${seen}`);
      return commit ? Date.now() - Date.parse(commit.committer.date) : null;
    },
    // A sign of life: a new commit on top of ours, so its date is now. A fast-forward only (force: false): a run that
    // took the lock over has put an unrelated commit there, and GitHub refuses the move (422) instead of stealing it back.
    // Works on the hold it started from: a late answer never touches a newer hold of the same run.
    async refresh() {
      const held = mine;
      if (!held) return false;
      const commit = await request('POST', '/repos/{repo}/git/commits', { message: 'factory queue lock (still working)', tree, parents: [held] });
      let moved = true;
      try { await request('PATCH', `/repos/{repo}/git/refs/${LOCK_REF}`, { sha: commit.sha, force: false }); }
      catch (e) {
        if (!/422/.test(String(e))) throw e;
        // A retried PATCH whose first try went through is refused too: the ref already being ours means it moved.
        // Still on our previous commit: the lock is ours, only this sign of life failed (the next one retries).
        const now = await lockSha();
        if (now === held) throw e;
        moved = now === commit.sha;
      }
      if (mine === held) mine = moved ? commit.sha : null;
      return moved;
    },
    release: () => dropIf(mine), // never the lock of the run that took over from us
    takeOver: () => dropIf(seen),
  };
  // Small factory states kept out of sight in the project: a ref per name, whose commit message is the JSON.
  const stateRef = (name) => `factory/state-${name}`;
  const getState = async (name) => {
    const ref = await request('GET', `/repos/{repo}/git/ref/${stateRef(name)}`);
    if (!ref) return null;
    const commit = await request('GET', `/repos/{repo}/git/commits/${ref.object.sha}`);
    try { return JSON.parse(commit?.message || 'null'); } catch { return null; }
  };
  const setState = async (name, value) => {
    if (!value) {
      try { await request('DELETE', `/repos/{repo}/git/refs/${stateRef(name)}`); } catch (e) { if (!/404|422/.test(String(e))) throw e; }
      return;
    }
    const tree = await request('POST', '/repos/{repo}/git/trees', { tree: [{ path: 'state', mode: '100644', type: 'blob', content: name }] });
    const commit = await request('POST', '/repos/{repo}/git/commits', { message: JSON.stringify(value), tree: tree.sha, parents: [] });
    try { await request('PATCH', `/repos/{repo}/git/refs/${stateRef(name)}`, { sha: commit.sha, force: true }); }
    catch (e) { if (!/404|422/.test(String(e))) throw e; await request('POST', '/repos/{repo}/git/refs', { ref: `refs/${stateRef(name)}`, sha: commit.sha }); }
  };
  return {
    queueLock,
    getState,
    setState,
    request,
    getIssue: (n) => request('GET', `/repos/{repo}/issues/${n}`),
    getPr: (n) => request('GET', `/repos/{repo}/pulls/${n}`),
    listIssues: (q) => request('GET', `/repos/{repo}/issues?${new URLSearchParams({ state: 'open', per_page: '100', ...q })}`),
    listPulls: () => paginate('/repos/{repo}/pulls?state=open&per_page=100'),
    listOpenIssues: () => paginate('/repos/{repo}/issues?state=open&per_page=100'),
    // The repository's latest issue events, all cards together (newest first).
    listRepoEvents: () => request('GET', '/repos/{repo}/issues/events?per_page=100'),
    // Comments updated at or after `since` (ISO time): only what moved, not the whole thread.
    listCommentsSince: async (n, since) => trusted(await paginate(`/repos/{repo}/issues/${n}/comments?per_page=100&since=${encodeURIComponent(since)}`)),
    // Every PR (open, closed, merged) of one branch of this repository.
    pullsByHead: (branch) => request('GET', `/repos/{repo}/pulls?state=all&per_page=30&head=${enc(`${repo.split('/')[0]}:${branch}`)}`),
    listClosedPulls: () => request('GET', '/repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30'),
    // One page of 100 closed PRs, most recently updated first (to find an older merge).
    listClosedPullsPage: (page) => request('GET', `/repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`),
    paginate,
    getRepo: () => request('GET', '/repos/{repo}'),
    // Only the owner's and the factory's own invisible notes count (issue #339): see trust.mjs.
    listComments: async (n) => trusted(await paginate(`/repos/{repo}/issues/${n}/comments?per_page=100`)),
    listEvents: (n) => paginate(`/repos/{repo}/issues/${n}/events?per_page=100`),
    listReviews: async (n) => trusted(await paginate(`/repos/{repo}/pulls/${n}/reviews?per_page=100`)),
    react: (commentId, content) => request('POST', `/repos/{repo}/issues/comments/${commentId}/reactions`, { content }),
    dispatch: (workflow, ref, inputs) => request('POST', `/repos/{repo}/actions/workflows/${workflow}/dispatches`, { ref, inputs }),
    comment: (n, body) => request('POST', `/repos/{repo}/issues/${n}/comments`, { body }),
    addLabels: (n, labels) => (labels.length ? request('POST', `/repos/{repo}/issues/${n}/labels`, { labels }) : null),
    removeLabel: async (n, label) => {
      try { await request('DELETE', `/repos/{repo}/issues/${n}/labels/${enc(label)}`); } catch (e) { if (!String(e).includes('404')) throw e; }
    },
    closeIssue: (n, reason = 'completed') => request('PATCH', `/repos/{repo}/issues/${n}`, { state: 'closed', state_reason: reason }),
    closePr: (n) => request('PATCH', `/repos/{repo}/pulls/${n}`, { state: 'closed' }),
    updateIssue: (n, fields) => request('PATCH', `/repos/{repo}/issues/${n}`, fields),
    reopenIssue: (n) => request('PATCH', `/repos/{repo}/issues/${n}`, { state: 'open' }),
    reopenPr: (n) => request('PATCH', `/repos/{repo}/pulls/${n}`, { state: 'open' }),
    createIssue: (title, body, labels = []) => request('POST', '/repos/{repo}/issues', { title, body, labels }),
    createPr: (title, head, base, body) => request('POST', '/repos/{repo}/pulls', { title, head, base, body }),
    merge: (n, sha) => request('PUT', `/repos/{repo}/pulls/${n}/merge`, { merge_method: 'squash', ...(sha ? { sha } : {}) }),
    getContent: (path, ref) => request('GET', `/repos/{repo}/contents/${path}${ref ? `?ref=${enc(ref)}` : ''}`),
    listPrFiles: (n) => paginate(`/repos/{repo}/pulls/${n}/files?per_page=100`),
    // With body_html, whose image links are signed for a few minutes (private attachments need no login then).
    getIssueHtml: (n) => request('GET', `/repos/{repo}/issues/${n}`, undefined, HTML),
    listCommentsHtml: (n) => paginate(`/repos/{repo}/issues/${n}/comments?per_page=100`, HTML),
    listReviewCommentsHtml: (n) => paginate(`/repos/{repo}/pulls/${n}/comments?per_page=100`, HTML),
    listReviewsHtml: (n) => paginate(`/repos/{repo}/pulls/${n}/reviews?per_page=100`, HTML),
    getBranch: (name) => request('GET', `/repos/{repo}/git/ref/heads/${enc(name)}`),
    createRef: (name, sha) => request('POST', '/repos/{repo}/git/refs', { ref: `refs/heads/${name}`, sha }),
    // Fast-forward only: the production branch never loses a commit (issue #294).
    updateRef: (name, sha) => request('PATCH', `/repos/{repo}/git/refs/heads/${enc(name)}`, { sha, force: false }),
    // Puts a branch back on what was live before a broken release (main, or the production branch of the first version).
    resetRef: (name, sha) => request('PATCH', `/repos/{repo}/git/refs/heads/${enc(name)}`, { sha, force: true }),
    // Merges one branch into another on GitHub (« Mise en production » sends preprod into main). 201: merged, with the
    // new commit; 204 (null here): nothing to merge; 409: conflict (thrown).
    mergeBranches: (base, head, message) => request('POST', '/repos/{repo}/merges', { base, head, commit_message: message }),
    // What `head` changed since it left `base` (files with their blob sha; at most 300 listed).
    compare: (base, head) => request('GET', `/repos/{repo}/compare/${enc(base)}...${enc(head)}`),
    getTree: (sha) => request('GET', `/repos/{repo}/git/trees/${sha}?recursive=1`),
    createTree: (baseTree, tree) => request('POST', '/repos/{repo}/git/trees', { base_tree: baseTree, tree }),
    createGitCommit: (message, tree, parents) => request('POST', '/repos/{repo}/git/commits', { message, tree, parents }),
    setPrBase: (n, base) => request('PATCH', `/repos/{repo}/pulls/${n}`, { base }),
    getCommit: (sha) => request('GET', `/repos/{repo}/git/commits/${sha}`),
    // A release's tag (Pulsar alignment: « Mise en production » with a version number): read, then an annotated tag
    // on the commit that went live, and its GitHub release with the CHANGELOG section as notes.
    getTagRef: (tag) => request('GET', `/repos/{repo}/git/ref/tags/${enc(tag)}`),
    createTagObject: (tag, message, sha) => request('POST', '/repos/{repo}/git/tags', { tag, message, object: sha, type: 'commit' }),
    createTagRef: (tag, sha) => request('POST', '/repos/{repo}/git/refs', { ref: `refs/tags/${tag}`, sha }),
    createRelease: (tag, name, body) => request('POST', '/repos/{repo}/releases', { tag_name: tag, name, body }),
    // The merged PRs that wait for the owner's « Mise en production » (issue #294).
    listAwaiting: () => paginate('/repos/{repo}/issues?state=closed&labels=factory%3Aawaiting-production&per_page=100'),
    // A branch with no history, holding only `files` ({path: text}).
    createOrphanBranch: async (name, files) => {
      const tree = await request('POST', '/repos/{repo}/git/trees', { tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })) });
      const commit = await request('POST', '/repos/{repo}/git/commits', { message: 'chore(factory): attachments branch', tree: tree.sha, parents: [] });
      return request('POST', '/repos/{repo}/git/refs', { ref: `refs/heads/${name}`, sha: commit.sha });
    },
    putContent: (path, branch, base64, message) => request('PUT', `/repos/{repo}/contents/${path}`, { message, content: base64, branch }),
    updateComment: (id, body) => request('PATCH', `/repos/{repo}/issues/comments/${id}`, { body }),
    checkRuns: async (sha) => (await request('GET', `/repos/{repo}/commits/${sha}/check-runs?per_page=100`))?.check_runs || [],
    deployments: (sha) => request('GET', `/repos/{repo}/deployments?sha=${sha}&per_page=20`),
    recentDeployments: () => request('GET', `/repos/{repo}/deployments?per_page=30`),
    // A wide page: a preview deployment is made on every push, and could push the live ones out of a short one.
    liveDeployments: () => request('GET', '/repos/{repo}/deployments?per_page=100'),
    // The commit a site's version tag names (issue #372): a short id is resolved, an unknown one is null (GitHub
    // answers 422, or 404).
    resolveCommit: async (ref) => {
      try { return await request('GET', `/repos/{repo}/commits/${enc(ref)}`); } catch (e) { if (/-> 422/.test(String(e))) return null; throw e; }
    },
    // refs/factory/live: the commit the version tag says is live, read by the panel; removed when the tag is not read.
    getLiveRef: async () => (await request('GET', `/repos/{repo}/git/ref/${LIVE_REF}`))?.object?.sha || null,
    setLiveRef: async (sha) => {
      if (!sha) {
        try { await request('DELETE', `/repos/{repo}/git/refs/${LIVE_REF}`); } catch (e) { if (!/404|422/.test(String(e))) throw e; }
        return;
      }
      try { await request('PATCH', `/repos/{repo}/git/refs/${LIVE_REF}`, { sha, force: true }); }
      catch (e) { if (!/404|422/.test(String(e))) throw e; await request('POST', '/repos/{repo}/git/refs', { ref: `refs/${LIVE_REF}`, sha }); }
    },
    // The project's factory runs that failed lately, their jobs, and a re-run of their failed jobs (same event again).
    failedRuns: async (workflow) => (await request('GET', `/repos/{repo}/actions/workflows/${workflow}/runs?status=failure&per_page=100&created=${encodeURIComponent(`>${new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 19)}Z`)}`))?.workflow_runs || [],
    runJobs: async (id) => (await request('GET', `/repos/{repo}/actions/runs/${id}/jobs?per_page=50`))?.jobs || [],
    rerunFailed: (id) => request('POST', `/repos/{repo}/actions/runs/${id}/rerun-failed-jobs`, {}),
    deploymentStatuses: (id) => request('GET', `/repos/{repo}/deployments/${id}/statuses?per_page=20`),
  };
}
