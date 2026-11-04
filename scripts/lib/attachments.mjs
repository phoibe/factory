// Screenshots the owner pastes in GitHub live behind a login the agent's cloud machine does not have. The relay
// (on GitHub Actions) copies them to the `factory-attachments` branch, which the agent reads with the REST API.
export const ATTACHMENTS_BRANCH = 'factory-attachments';
const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_HOST = /^https:\/\/(private-user-images|user-images)\.githubusercontent\.com\//;

const BRANCH_FILES = {
  'README.md': "# Pièces jointes\n\nCaptures collées par le propriétaire dans les issues et les PR, copiées par la factory pour que l'agent puisse les voir. Ne pas fusionner.\n",
  // Vercel reads this file on the pushed commit: no deployment for this branch.
  'vercel.json': '{ "git": { "deploymentEnabled": false } }\n',
};

// The image links of a rendered comment (body_html), ready to download.
export function imageSources(html = '') {
  const out = [];
  for (const m of String(html).matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    const url = m[1].replace(/&amp;/g, '&');
    if (IMAGE_HOST.test(url) && !out.includes(url)) out.push(url);
  }
  return out;
}

// attachments/<issue>/<asset id>.<ext>: the same image always lands on the same path.
export function attachmentPath(number, url) {
  const file = new URL(url).pathname.split('/').pop();
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\w+)$/i.exec(file);
  const name = m ? `${m[1]}.${m[2].toLowerCase()}` : file.replace(/[^\w.-]/g, '_');
  return `attachments/${number}/${name}`;
}

// Copies the owner's images from these issues and PRs; returns every copied path (new or already there).
export async function mirrorAttachments({ gh, fetchImpl = fetch, numbers, owner, isPr = () => false, log = () => {} }) {
  const items = [];
  for (const n of numbers.filter(Boolean)) {
    const issue = await gh.getIssueHtml(n);
    if (issue) items.push({ n, user: issue.user?.login, html: issue.body_html });
    for (const c of (await gh.listCommentsHtml(n)) || []) items.push({ n, user: c.user?.login, html: c.body_html });
    if (isPr(n)) {
      for (const c of (await gh.listReviewCommentsHtml(n)) || []) items.push({ n, user: c.user?.login, html: c.body_html });
      for (const r of (await gh.listReviewsHtml(n)) || []) items.push({ n, user: r.user?.login, html: r.body_html });
    }
  }
  const wanted = [];
  for (const it of items.filter((i) => i.user === owner)) {
    for (const url of imageSources(it.html)) {
      const path = attachmentPath(it.n, url);
      if (!wanted.some((w) => w.path === path)) wanted.push({ path, url });
    }
  }
  const recent = wanted.slice(-MAX_FILES); // the latest images are the ones the message is about
  if (!recent.length) return [];
  if (!(await gh.getBranch(ATTACHMENTS_BRANCH))) await gh.createOrphanBranch(ATTACHMENTS_BRANCH, BRANCH_FILES);
  const paths = [];
  for (const { path, url } of recent) {
    try {
      if (!(await gh.getContent(path, ATTACHMENTS_BRANCH))) {
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length > MAX_BYTES) throw new Error('too big');
        await gh.putContent(path, ATTACHMENTS_BRANCH, bytes.toString('base64'), `chore(factory): attachment ${path}`);
      }
      paths.push(path);
    } catch (e) {
      log(`attachment ${path}: ${e.message}`);
    }
  }
  return paths;
}
