// The panel served locally against a fake GitHub, for the journeys of e2e/*.e2e.mjs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../a11y/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'panel');
const EXTRA = { '/config-core.mjs': 'scripts/lib/config-core.mjs', '/ratelimit.mjs': 'scripts/lib/ratelimit.mjs', '/answer.mjs': 'scripts/lib/answer.mjs', '/catalog.json': 'packs/catalog.json', '/factory.config.json': 'defaults/factory.config.json' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

export const issue = (number, title, labels, extra = {}) => ({ number, title, state: 'open', labels: labels.map((name) => ({ name })), comments: 0, html_url: `https://github.com/o/r/issues/${number}`, created_at: new Date(Date.now() - 300000).toISOString(), updated_at: new Date().toISOString(), user: { login: 'o' }, author_association: 'OWNER', body: '', ...extra });

// Runs `journey` with a page on the panel. `issues` is the open list GitHub returns; every write is recorded.
// `config`: the project's factory.config.json. `writeDelay`: how long GitHub takes to answer a write (ms).
// `events`: the issue events GitHub returns (labels put on or taken off), first page only.
// `files`: project files GitHub serves (path → text), with the date of their last commit in `fileDates`.
// `chatServer`: { delay, answer } turns on the instant chat: its server answers `answer` after `delay` ms and
// saves the conversation on the `factory-chat` branch the panel reads.
export async function withPanel({ issues = [], token = true, files = {}, fileDates = {}, viewport = null, failing = null, forbidden = null, config = {}, writeDelay = 0, repos = ['o/r'], comments = {}, factoryFiles = {}, publicRepos = [], events = [], chatServer = null }, journey) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      const body = await readFile(EXTRA[path] ? join(ROOT, EXTRA[path]) : join(PANEL, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0);
  const browser = await launchBrowser(server);
  const writes = [];
  try {
    const context = await browser.newContext();
    if (token) await context.addInitScript(() => localStorage.setItem('factory.token', 'test'));
    await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'github' }));
    const page = await context.newPage();
    if (viewport) await page.setViewportSize(viewport);
    const chatBranch = { index: [], chats: {} };
    if (chatServer) {
      const CHAT = 'http://localhost:7777';
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST' };
      await page.route('**/chat-server.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: CHAT }) }));
      await page.route(`${CHAT}/**`, async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS' || !req.url().endsWith('/chat')) return route.fulfill({ status: 204, headers: cors });
        const { conversation, message } = req.postDataJSON();
        if (chatServer.delay) await new Promise((r) => setTimeout(r, chatServer.delay));
        const id = conversation || `c${chatBranch.index.length + 1}`;
        const updated = new Date().toISOString();
        const conv = chatBranch.chats[id] || { id, title: message.slice(0, 40), state: 'open', messages: [] };
        conv.messages.push({ who: 'me', text: message, at: updated }, { who: 'agent', text: chatServer.answer, at: updated });
        conv.updated = updated;
        chatBranch.chats[id] = conv;
        chatBranch.index = [{ id, title: conv.title, updated, state: 'open' }, ...chatBranch.index.filter((c) => c.id !== id)];
        const events = [{ type: 'delta', text: chatServer.answer }, { type: 'answer', text: chatServer.answer, issues: [] },
          { type: 'done', saved: true, conversation: { id, title: conv.title, updated, state: 'open' } }];
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/x-ndjson' }, body: events.map((e) => JSON.stringify(e)).join('\n') + '\n' });
      });
    }
    await page.route('https://api.github.com/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() !== 'GET') {
        writes.push({ method: req.method(), path, body: req.postDataJSON?.() ?? null });
        if (writeDelay) await new Promise((r) => setTimeout(r, writeDelay));
        if (forbidden && forbidden.has(path)) return json({ message: 'Resource not accessible by personal access token' }, 403);
        return failing && failing.has(path) ? json({ message: 'Server Error' }, 500) : json({});
      }
      if (path === '/user/repos') return json(repos.map((full, i) => ({ id: i + 1, full_name: full, name: full.split('/')[1], owner: { login: full.split('/')[0] }, private: !publicRepos.includes(full), html_url: `https://github.com/${full}`, homepage: '' })));
      // The factory's own branch files (dev server status and general setting, issue #271).
      const own = /^\/repos\/phoibe\/factory\/contents\/(.+)$/.exec(path)?.[1];
      if (own) return own in factoryFiles ? json({ content: Buffer.from(JSON.stringify(factoryFiles[own])).toString('base64'), encoding: 'base64', sha: 'f' }) : json({ message: 'Not Found' }, 404);
      if (chatServer && new URL(req.url()).searchParams.get('ref') === 'factory-chat') {
        const name = /^\/repos\/o\/r\/contents\/(?:chats\/(.+)\.json|index\.json)$/.exec(path);
        const data = name && (name[1] ? chatBranch.chats[name[1]] : chatBranch.index);
        return data ? json(data) : json({ message: 'Not Found' }, 404);
      }
      if (path.endsWith('/contents/factory.config.json')) return json({ content: Buffer.from(JSON.stringify(config)).toString('base64'), encoding: 'base64', sha: 's' });
      if (path.endsWith('/contents/PRODUCT.md')) return json({}, 404);
      if (failing && failing.has(path)) return json({ message: 'Server Error' }, 500);
      const file = /^\/repos\/o\/r\/contents\/(.+)$/.exec(path)?.[1];
      if (file && file in files) return json({ content: Buffer.from(files[file]).toString('base64'), encoding: 'base64', sha: 's' });
      if (file && !path.endsWith('factory.config.json')) return json({ message: 'Not Found' }, 404);
      if (path === '/repos/o/r/commits') {
        const date = fileDates[new URL(req.url()).searchParams.get('path')];
        return json(date ? [{ sha: 'c', commit: { committer: { date } } }] : []);
      }
      const thread = /^\/repos\/o\/r\/issues\/(\d+)\/comments$/.exec(path)?.[1];
      if (thread && comments[thread]) return json(comments[thread]);
      const one = /^\/repos\/o\/r\/issues\/(\d+)$/.exec(path)?.[1];
      if (one && issues.some((i) => String(i.number) === one)) return json(issues.find((i) => String(i.number) === one));
      if (path === '/repos/o/r/issues/events') return json(new URL(req.url()).searchParams.get('page') === '1' ? events : []);
      if (path === '/repos/o/r/issues') return json(new URL(req.url()).searchParams.get('state') === 'closed' ? [] : issues);
      return json([]);
    });
    await journey({ page, writes, url: `http://localhost:${server.address().port}/` });
  } finally {
    await browser.close();
    server.close();
  }
}
