// Minimal GitHub REST client on fetch. `request` is the only network call, so tests can fake it.
export function github({ token, repo, api = 'https://api.github.com', fetchImpl = fetch }) {
  async function request(method, path, body) {
    const url = path.startsWith('http') ? path : `${api}${path.replace('{repo}', repo)}`;
    const res = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
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
  async function paginate(path) {
    const out = [];
    let url = `${api}${path.replace('{repo}', repo)}`;
    while (url) {
      const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      out.push(...(await res.json()));
      url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1];
    }
    return out;
  }
  const enc = encodeURIComponent;
  return {
    request,
    getIssue: (n) => request('GET', `/repos/{repo}/issues/${n}`),
    getPr: (n) => request('GET', `/repos/{repo}/pulls/${n}`),
    listIssues: (q) => request('GET', `/repos/{repo}/issues?${new URLSearchParams({ state: 'open', per_page: '100', ...q })}`),
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
    merge: (n, sha) => request('PUT', `/repos/{repo}/pulls/${n}/merge`, { merge_method: 'squash', ...(sha ? { sha } : {}) }),
    getContent: (path) => request('GET', `/repos/{repo}/contents/${path}`),
    deployments: (sha) => request('GET', `/repos/{repo}/deployments?sha=${sha}&per_page=20`),
    deploymentStatuses: (id) => request('GET', `/repos/{repo}/deployments/${id}/statuses?per_page=20`),
  };
}
