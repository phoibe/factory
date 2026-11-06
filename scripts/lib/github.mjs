// Minimal GitHub REST client on fetch. `request` is the only network call, so tests can fake it.
const HTML = 'application/vnd.github.full+json';

// GitHub answers 5xx now and then (503 « Service Unavailable », 500 on pushes…). One such answer used to kill a whole
// relay step: a PR whose checks were green then waited for nothing until the next tick. Those answers are retried.
// A POST is retried only on 503 (not served at all), so a comment or a label is never written twice.
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const transient = (method, status) => (method === 'POST' ? status === 503 : status >= 500);

export function github({ token, repo, api = 'https://api.github.com', fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  // The network call with its retries; a network error (no answer at all) is retried like a 503.
  async function send(method, url, init) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try { res = await fetchImpl(url, { method, ...init }); } catch (e) {
        if (attempt >= RETRY_DELAYS_MS.length) throw e;
        await sleep(RETRY_DELAYS_MS[attempt]);
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
  // The queue lock: a ref that exists or not. Creating a ref is atomic (422 when it exists), and the commit it
  // points to carries the time it was taken.
  const LOCK_REF = 'factory/lock';
  let mine = null; // sha of the lock commit this run created
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
      const tree = await request('POST', '/repos/{repo}/git/trees', { tree: [{ path: 'lock', mode: '100644', type: 'blob', content: String(Date.now()) }] });
      const commit = await request('POST', '/repos/{repo}/git/commits', { message: 'factory queue lock', tree: tree.sha, parents: [] });
      try { await request('POST', '/repos/{repo}/git/refs', { ref: `refs/${LOCK_REF}`, sha: commit.sha }); mine = commit.sha; return true; }
      catch (e) { if (String(e).includes('422')) return false; throw e; }
    },
    async ageMs() {
      if (!seen) return null;
      const commit = await request('GET', `/repos/{repo}/git/commits/${seen}`);
      return commit ? Date.now() - Date.parse(commit.committer.date) : null;
    },
    release: () => dropIf(mine), // never the lock of the run that took over from us
    takeOver: () => dropIf(seen),
  };
  return {
    queueLock,
    request,
    getIssue: (n) => request('GET', `/repos/{repo}/issues/${n}`),
    getPr: (n) => request('GET', `/repos/{repo}/pulls/${n}`),
    listIssues: (q) => request('GET', `/repos/{repo}/issues?${new URLSearchParams({ state: 'open', per_page: '100', ...q })}`),
    listPulls: () => paginate('/repos/{repo}/pulls?state=open&per_page=100'),
    listClosedPulls: () => request('GET', '/repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30'),
    paginate,
    getRepo: () => request('GET', '/repos/{repo}'),
    listComments: (n) => paginate(`/repos/{repo}/issues/${n}/comments?per_page=100`),
    listEvents: (n) => paginate(`/repos/{repo}/issues/${n}/events?per_page=100`),
    listReviews: (n) => paginate(`/repos/{repo}/pulls/${n}/reviews?per_page=100`),
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
    merge: (n, sha) => request('PUT', `/repos/{repo}/pulls/${n}/merge`, { merge_method: 'squash', ...(sha ? { sha } : {}) }),
    getContent: (path, ref) => request('GET', `/repos/{repo}/contents/${path}${ref ? `?ref=${enc(ref)}` : ''}`),
    listPrFiles: (n) => paginate(`/repos/{repo}/pulls/${n}/files?per_page=100`),
    // With body_html, whose image links are signed for a few minutes (private attachments need no login then).
    getIssueHtml: (n) => request('GET', `/repos/{repo}/issues/${n}`, undefined, HTML),
    listCommentsHtml: (n) => paginate(`/repos/{repo}/issues/${n}/comments?per_page=100`, HTML),
    listReviewCommentsHtml: (n) => paginate(`/repos/{repo}/pulls/${n}/comments?per_page=100`, HTML),
    listReviewsHtml: (n) => paginate(`/repos/{repo}/pulls/${n}/reviews?per_page=100`, HTML),
    getBranch: (name) => request('GET', `/repos/{repo}/git/ref/heads/${enc(name)}`),
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
    deploymentStatuses: (id) => request('GET', `/repos/{repo}/deployments/${id}/statuses?per_page=20`),
  };
}
