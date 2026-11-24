import { toBase64, fromBase64 } from './lib.mjs';
import { LABEL as CHAT_LABEL, ASK, ATTACHMENTS_BRANCH, CHAT_BRANCH, chatMessages, chatStatus, titleFrom, markdown, conversations, unread, serverUnread, safeGithubUrl, imagePath, imageBlock, ndjson, serverMessages, serverList, READ_TOKEN_KEY, READ_TOKEN_URL, WRITABLE_TOKEN, CLASSIC_TOKEN, WRITE_PROBES, NO_SHA, probeUrl, fineGrained, hasScopes, probeSaysWritable, readTokenProblem, newConversation, addExchange, upsertIndex, issueRequest, conversationId, defaultConversation, githubBusy, wantedIssues, elapsed, waitingSince, quoteParts, decideProposal, decisionComment, cardTag, openRequests, finishesConversation, createdMarks, MAX_IMAGES, UNSENT_TITLE, TOKEN_REFUSED, ANSWER_CUT, agentRefusal, UNSENT_AWAY, unsentKey, failureKind, unsentBox, mergeDraft, toastBottom } from './chat.mjs';
import { trustNotes } from './trust.mjs';
import { httpError, errorText, saidError } from './errors.mjs';
import { $, store, app, el, toast, onToast, onReset, sessionExpired, onUnsaved, onView, shown, selectTab, call } from './common.mjs';
import { API, guardRead, api } from './github.mjs';

// Opening « Agent » on a computer puts the cursor where there is something to type (issue #489): the read token
// while it is missing, the message box otherwise. Never on a phone: the keyboard would hide half the screen.
function focusChat() {
  if (!matchMedia('(pointer: fine)').matches) return;
  const field = $(needsReadToken() ? 'read-token' : 'chat-input');
  field.focus({ preventScroll: true }); // the browser would centre it, pushing the tabs off a short screen
  // A laptop screen can leave the box just below the fold: show it whole, with its focus ring.
  (field.closest('.composer') || field).scrollIntoView({ block: 'nearest' });
}

// Issue #473: the « Agent » tab at the usual width, or full screen (only the top bar and the project list stay).
// Never remembered: a reload opens it at the usual width.
function setChatFull(on) {
  document.body.classList.toggle('chat-fullscreen', on);
  const label = on ? 'Largeur normale' : 'Plein écran';
  $('chat-full').setAttribute('aria-label', label);
  $('chat-full').title = label;
  fitChat();
}
$('chat-full').addEventListener('click', () => setChatFull(!document.body.classList.contains('chat-fullscreen')));
// The full screen exists on a computer only: shrinking the window to a phone's width ends it.
matchMedia('(max-width: 700px)').addEventListener('change', (e) => { if (e.matches && document.body.classList.contains('chat-fullscreen')) setChatFull(false); });
// Échap leaves the full screen, unless it is closing a window opened over it (an enlarged image, a dialog).
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || !document.body.classList.contains('chat-fullscreen') || document.querySelector('dialog[open]')) return;
  setChatFull(false);
});

function fitChat() {
  const box = $('chat');
  if (box.hidden) return;
  box.style.setProperty('--chat-top', `${Math.max(0, box.getBoundingClientRect().top + scrollY)}px`);
}
addEventListener('resize', fitChat);
if ('ResizeObserver' in window) {
  const watch = new ResizeObserver(() => fitChat());
  for (const n of document.querySelectorAll('.top, .project-head, .tabs')) watch.observe(n);
}

// ---- Agent (chat) -------------------------------------------------------------------------------
// A chat with the agent. Two ways to reach it:
// - the chat server (server/chat on Modal, address in chat-server.json): the answer streams back within
//   seconds; conversations are JSON files on the project's `factory-chat` branch, read again every 30 s with
//   ETags (issue #563: an unchanged one is a free « 304 »);
// - otherwise, each conversation is a `factory:question` issue that wakes the agent's routine (a minute or
//   more). While an answer is awaited it is checked every 4 s, otherwise every 15 s, with ETags.
// Either way the owner only ever sees the chat.
const SEEN_KEY = 'factory.chat.seen';
const EXAMPLES = [
  'Que se passe-t-il si je ferme l\'appli au milieu d\'une saisie ?',
  'Je voudrais pouvoir exporter mes données.',
  'Le bouton « Enregistrer » ne réagit pas sur mon téléphone.',
];
// Issue #535: the conversations to put away once the agent's turn is over (id → what to say), kept in the browser so
// that a reload, another conversation or another project on the way does not lose them.
const LATER_KEY = 'factory.chat.later';
function laterMarks(repo) {
  const key = `${LATER_KEY}.${repo}`;
  // Read again at each use: another tab of the board may have added or used up one meanwhile.
  const read = () => {
    try {
      const saved = JSON.parse(store.get(key) || '[]');
      return new Map(Array.isArray(saved) ? saved.filter((e) => Array.isArray(e) && e.length === 2) : []);
    } catch { return new Map(); }
  };
  const save = (marks) => (marks.size ? store.set(key, JSON.stringify([...marks])) : store.del(key));
  return {
    has: (id) => read().has(id),
    get: (id) => read().get(id),
    set: (id, said) => { const marks = read(); marks.set(id, said); save(marks); },
    delete: (id) => { const marks = read(); if (marks.delete(id)) save(marks); },
    ids: () => [...read().keys()],
  };
}

const chat = { error: false, repo: null, list: null, open: null, issue: null, comments: [], etags: new Map(), timer: null, busy: false, pending: null, seen: {}, files: [], images: new Map(), server: null, conv: null, live: null, warmed: 0, badge: null, run: null, decided: new Map(), deciding: new Set(), refused: new Map(), later: laterMarks(null), created: createdMarks(store, null), recording: false, unsent: unsentBox() };

export function setChatServer(url) { chat.server = url; }

export function resetChat() {
  clearTimeout(chat.timer);
  // A send still running belongs to the project the owner just left: it finishes without touching the screen.
  Object.assign(chat, { error: false, repo: app.current.repo.full_name, list: null, open: null, issue: null, comments: [], etags: new Map(), pending: null, conv: null, live: null, badge: null, run: null, sending: false, files: [], deciding: new Set(), refused: new Map(), later: laterMarks(app.current.repo.full_name), created: createdMarks(store, app.current.repo.full_name), unsent: unsentBox() });
  // A request made here whose choice is not recorded yet shows « Créée » with its link (review #556).
  chat.decided = new Map(chat.created.entries());
  $('chat-send').disabled = false;
  // A draft belongs to the project it was written for.
  $('chat-input').value = '';
  drawPendingImages();
  autosize();
  try { chat.seen = JSON.parse(store.get(`${SEEN_KEY}.${chat.repo}`) || '{}'); } catch { chat.seen = {}; }
  $('chat').classList.remove('viewing');
  // The old project's « new answers » count goes with it.
  $('chat-badge').hidden = true;
  $('chat-badge-label').textContent = '';
  if (shown().tab === 'chat') openChat(); else scheduleChat(2000);
}

function markSeen(issue) {
  chat.seen[issue.number] = issue.comments || 0;
  store.set(`${SEEN_KEY}.${chat.repo}`, JSON.stringify(chat.seen));
}

// Instant mode: the time of the conversation whose answer is on screen.
function markServerSeen(id, updated) {
  chat.seen[id] = updated;
  store.set(`${SEEN_KEY}.${chat.repo}`, JSON.stringify(chat.seen));
}

// The open conversation is on screen: the Agent tab is shown and, on a phone, the thread rather than the list.
// The general page hides the tabs with CSS only: while it is open, the chat is not on screen (review #556).
const chatAway = () => shown().tab !== 'chat' || shown().general;
const threadShown = () => !chatAway() && (!matchMedia('(max-width: 700px)').matches || $('chat').classList.contains('viewing'));

const isUnread = (c) => (chat.server ? serverUnread(c, chat.seen) : unread(c, chat.seen));

async function chatGet(path) {
  const hit = chat.etags.get(path);
  const res = await fetch(API + path, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${app.token}`, accept: 'application/vnd.github+json', ...(hit ? { 'if-none-match': hit.etag } : {}) },
  });
  if (res.status === 304 && hit) return hit.data;
  if (res.status === 401) sessionExpired();
  if (!res.ok) throw httpError(res.status, (await res.json().catch(() => ({}))).message);
  const data = guardRead(path, await res.json());
  const etag = res.headers.get('etag');
  if (etag) chat.etags.set(path, { etag, data });
  return data;
}

// Instant mode needs the read-only token: without it the « Agent » tab shows only the card that asks for it.
const needsReadToken = () => Boolean(chat.server) && !app.readToken;
function drawReadTokenCard() {
  const needed = needsReadToken();
  $('chat').classList.toggle('needs-token', needed);
  // Issue #473: the card has no full-screen button, so never leave the owner in full screen without a way out.
  if (needed && document.body.classList.contains('chat-fullscreen')) setChatFull(false);
  $('chat-setup').hidden = !needed;
  $('read-token-link').href = READ_TOKEN_URL;
  return needed;
}

// Forgets a read token the chat server refused (expired, deleted, or one that can write) and asks for a new one.
function readTokenRefused(message) {
  store.del(READ_TOKEN_KEY);
  app.readToken = null;
  drawReadTokenCard();
  showReadTokenError(message);
}

// Shows a refusal on the read-token card, never breaking a line at the hyphen of « ci-dessus » or « créez-en », nor
// leaving a « : » alone at the start of a line (issue #558).
function showReadTokenError(message) {
  const parts = String(message || '').split(/(\S*-\S+|\S+ [:;!?])/).map((part, i) => {
    if (i % 2 === 0) return part;
    const span = document.createElement('span');
    span.className = 'nowrap';
    span.textContent = part;
    return span;
  });
  $('read-token-error').replaceChildren(...parts.filter((part) => part !== ''));
}

// Checks a pasted read token with GitHub: it is a fine-grained one, belongs to the owner, reads the project, and cannot
// write (issue #558: nor launch automated tasks, change settings, or add an SSH key to the account).
async function checkReadToken(value) {
  if (value === app.token) return readTokenProblem({ same: true });
  if (!fineGrained(value)) return readTokenProblem({ classic: true }); // before sending it anywhere
  const probe = (path, init = {}) => fetch(API + path, { ...init, cache: 'no-store', headers: { authorization: `Bearer ${value}`, accept: 'application/vnd.github+json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  // A 403's message is read too: a secondary rate limit may say so only there.
  const down = async (r) => githubBusy(r.status, r.headers, r.status === 403 ? (await r.clone().json().catch(() => ({})))?.message : '');
  const user = await probe('/user');
  if (await down(user)) throw new Error('github');
  const owner = app.current.repo.owner?.login || app.current.repo.full_name.split('/')[0];
  if (user.status === 401) return readTokenProblem({ status: 401, owner });
  if (!user.ok) throw new Error('github');
  if (hasScopes(user.headers)) return readTokenProblem({ classic: true }); // only a classic token has scopes
  const { login } = await user.json();
  const repo = app.current.repo.full_name;
  // The commit-status probe needs a commit: the project's last one, read with this token (a read it may do). The other
  // probes do not wait for it. Without one to read (mostly a token that cannot see the project, 404), any 40-hex id
  // does: GitHub refuses the token or the empty body first.
  const head = probe(`/repos/${repo}/commits/HEAD`, { headers: { accept: 'application/vnd.github.sha' } });
  const sha = head.then(async (r) => {
    if (await down(r)) throw new Error('github');
    const text = r.ok ? (await r.text()).trim() : '';
    return /^[0-9a-f]{40}$/.test(text) ? text : NO_SHA;
  });
  const [file, ...probes] = await Promise.all([probe(`/repos/${repo}/contents/factory.config.json`),
    ...WRITE_PROBES.map(async ([method, path]) => probe(probeUrl(repo, path, path.includes('{sha}') ? await sha : ''), { method, body: '{}' }))]);
  if ((await Promise.all([file, ...probes].map(down))).some(Boolean)) throw new Error('github');
  return readTokenProblem({ status: user.status, login, owner, readable: file.ok, writable: probes.some((p) => probeSaysWritable(p.status)) });
}

$('read-token-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = $('read-token').value.trim();
  if (!value || !app.current) return;
  const btn = $('read-token-save');
  const field = $('read-token');
  const fail = (message) => { showReadTokenError(message); field.setAttribute('aria-invalid', 'true'); field.focus(); };
  btn.disabled = true;
  btn.textContent = 'Vérification…';
  $('read-token-form').setAttribute('aria-busy', 'true');
  $('read-token-error').textContent = '';
  field.removeAttribute('aria-invalid');
  try {
    const problem = await checkReadToken(value);
    if (problem) return fail(problem);
    app.readToken = value;
    store.set(READ_TOKEN_KEY, value);
    $('read-token').value = '';
    await openChat();
    $('chat-input').focus();
  } catch {
    fail('GitHub ne répond pas, réessayez dans un instant.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Valider le jeton';
    $('read-token-form').removeAttribute('aria-busy');
  }
});

async function openChat() {
  if (!app.current) return;
  if (chat.repo !== app.current.repo.full_name) return resetChat();
  if (drawReadTokenCard()) return;
  pickDefaultConversation(); // the list fetched in the background, if any
  // Wakes the chat server up while the owner types (it sleeps when unused).
  if (chat.server && Date.now() - chat.warmed > 60_000) { chat.warmed = Date.now(); fetch(`${chat.server}/health`).catch(() => {}); }
  drawChat();
  await refreshChat();
}

// A JSON file of the `factory-chat` branch, or null. Read with its ETag (issue #563): an unchanged file is a free « 304 »
// and is parsed again from the text kept, so a change made on screen to the last copy never comes back.
async function branchJson(path) {
  const cache = chat.etags; // captured: a project switch mid-fetch must not write into the new project's map
  const url = `${API}/repos/${chat.repo}/contents/${path}?ref=${CHAT_BRANCH}`;
  const hit = cache.get(url);
  const res = await fetch(url, {
    cache: 'no-store', headers: { authorization: `Bearer ${app.token}`, accept: 'application/vnd.github.raw', ...(hit ? { 'if-none-match': hit.etag } : {}) },
  });
  if (res.status === 304 && hit) return JSON.parse(hit.text);
  if (res.status === 404) { cache.delete(url); return null; }
  if (!res.ok) throw httpError(res.status, (await res.json().catch(() => ({}))).message);
  const text = await res.text();
  const data = JSON.parse(text);
  const etag = res.headers.get('etag');
  if (etag) cache.set(url, { etag, text }); else cache.delete(url);
  return data;
}

async function refreshServerChat() {
  const repo = chat.repo;
  const index = await branchJson('index.json');
  if (chat.repo !== repo) return;
  chat.list = serverList(index);
  pickDefaultConversation();
  const id = chat.open;
  if (id && id !== 'new' && !chat.live) {
    const conv = await branchJson(`chats/${id}.json`);
    // An answer that could not be saved stays on screen (issue #395): the stored version does not have it.
    if (chat.repo === repo && chat.open === id && !chat.live && !(chat.conv?.unsaved && chat.conv.id === id)) chat.conv = conv;
    const entry = chat.list.find((c) => c.id === id);
    if (chat.repo === repo && chat.open === id && conv && entry && threadShown()) markServerSeen(id, entry.updated);
  }
}

// Once per project, when its conversations first arrive (issue #477): open the most recent one still open,
// else a new one. A draft already started keeps the new conversation.
// Only while the tab is shown: a background check from another tab must not choose (nor poll) a conversation.
function pickDefaultConversation() {
  if (chat.open != null || !chat.list || shown().tab !== 'chat') return;
  const drafting = chat.live || chat.sending || chat.pending || chat.files.length || $('chat-input').value.trim() || chat.unsent.shown('new').length;
  chat.open = drafting ? 'new' : defaultConversation(chat.list, Boolean(chat.server));
  if (chat.open === 'new') return;
  $('chat').classList.add('viewing');
  // Its answers are already there, not new ones: nothing to read out.
  announced = { id: chat.open, count: Infinity };
  drawChat(); // its title and « Chargement… » at once, never the new conversation meanwhile
}

async function refreshChat() {
  if (chat.busy) return;
  chat.busy = true;
  const repo = chat.repo;
  const clicks = chat.clicks;
  try {
    if (chat.server) { await refreshServerChat(); chat.error = false; drawChat(); return; }
    const list = await chatGet(`/repos/${repo}/issues?labels=${encodeURIComponent(CHAT_LABEL)}&state=all&sort=updated&direction=desc&per_page=50`);
    if (chat.repo !== repo) return;
    chat.list = conversations(list);
    chat.error = false;
    pickDefaultConversation();
    if (typeof chat.open === 'number') {
      const n = chat.open;
      const issue = await chatGet(`/repos/${repo}/issues/${n}`);
      const pages = Math.max(1, Math.ceil((issue.comments || 0) / 100));
      const comments = [];
      for (let p = 1; p <= pages; p++) comments.push(...trustNotes(await chatGet(`/repos/${repo}/issues/${n}/comments?per_page=100&page=${p}`), repo.split('/')[0]));
      if (chat.repo !== repo || chat.open !== n) return;
      chat.issue = issue;
      chat.comments = comments;
      // The pending message shows until GitHub lists it.
      if (chat.pending && chatMessages(issue, comments).some((m) => m.who === 'me' && m.text === chat.pending.text && (m.images?.length || 0) === chat.pending.previews.length)) chat.pending = null;
      // Seen only when the answer is on screen: fetched in the background, it stays new. The owner's own
      // message, listed after they left, is never news.
      if (threadShown() || chatMessages(issue, comments).at(-1)?.who === 'me') markSeen(issue);
    }
    drawChat();
  } catch (err) {
    if (!chat.list) { chat.error = true; if (shown().tab === 'chat') drawChatList(); }
    else if (shown().tab === 'chat') toast('GitHub ne répond pas. Nouvel essai dans quelques secondes.');
  } finally {
    chat.busy = false;
    // The project or the conversation changed meanwhile (the owner clicked another one): fetch it now.
    scheduleChat(chat.repo !== repo || chat.clicks !== clicks ? 0 : undefined);
    // In both modes (the instant one returns early above), issue #535.
    if (chat.repo === repo) finishWhenDone();
    if (chat.repo === repo) recordCreated().catch(() => {});
  }
}

// Review #556: a request created here whose choice could not be written in its conversation is written at a later
// refresh. A card decided meanwhile (another device), or gone, only drops the mark: the request exists either way.
async function recordCreated() {
  const marks = chat.created, repo = chat.repo, server = chat.server, later = chat.later;
  const todo = marks.pending().filter(([key]) => !chat.deciding.has(key) && !decidingAnywhere.has(flightKey(repo, key)));
  if (!todo.length || chat.recording) return;
  chat.recording = true;
  let recorded = false;
  try {
    for (const [key, { url }] of todo) {
      const cut = key.lastIndexOf(':');
      const open = key.slice(0, cut), id = key.slice(cut + 1);
      try {
        let wrote = !server;
        if (server) {
          const path = `chats/${open}.json`;
          const { data } = await chatFile(repo, path);
          const card = (data?.messages || []).flatMap((m) => m.proposals || []).find((x) => x.id === id);
          if (card?.state === 'pending') {
            wrote = true;
            await writeChatFile(repo, path, (latest) => {
              if (!latest || !decideProposal(latest, id, 'created', url)) throw new Error('not recorded');
              return latest;
            }, `chore(factory): chat ${open}`);
          }
        } else {
          await api(`/repos/${repo}/issues/${open}/comments`, { method: 'POST', body: JSON.stringify({ body: decisionComment(id, 'created', url) }) });
          // One more comment on the conversation: already seen, never a « new answer ».
          if (chat.repo === repo && chat.seen[open] != null) {
            chat.seen[open] += 1;
            store.set(`${SEEN_KEY}.${repo}`, JSON.stringify(chat.seen));
          }
        }
        marks.delete(key);
        // Recorded now: the conversation is put away once its agent is done, as after a click (finishWhenDone).
        if (wrote) { later.set(server ? open : Number(open), FINISHED_SAID); recorded = true; }
      } catch (e) {
        // Gone, or locked: it will never pass. The request exists either way, so the mark is kept: the card stays
        // « Créée » and is never offered again, it is only no longer retried (review #556, round 3).
        if (e?.status === 404 || e?.status === 410 || (e?.status === 403 && /locked/i.test(e.githubMessage || ''))) marks.keep(key);
        /* otherwise tried again at the next refresh */
      }
    }
  } finally {
    chat.recording = false;
  }
  if (recorded && chat.repo === repo) await finishWhenDone();
}

// Every 4 s while an answer is awaited; otherwise every 15 s on « Agent », 30 s from the other tabs.
function scheduleChat(delay) {
  clearTimeout(chat.timer);
  if (!app.current || !chat.repo) return;
  const away = chatAway();
  if (delay == null && chat.server) delay = 30_000; // only picks up other devices' messages
  if (delay == null) {
    const waiting = chat.pending || (chat.issue && chatStatus(chat.issue, chatMessages(chat.issue, chat.comments)) === 'thinking')
      || (chat.list || []).some((c) => c.state === 'open' && c.labels?.some((l) => l.name === 'factory:running'));
    delay = waiting ? 4000 : away ? 30_000 : 15_000;
  }
  chat.timer = setTimeout(refreshChat, delay);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (app.current && chat.repo) refreshChat();
});

// The chat shows « and » glued to their word (quoteParts): during a copy that touches them, the glued spaces
// turn back into the message's own spaces, so the browser copies the exact text (plain and rich), then the
// screen gets them back. The page fills the clipboard itself: some Chromium versions turn a lone space of a
// copied <span> into &nbsp; in the rich copy.
document.addEventListener('copy', (e) => {
  const sel = getSelection();
  if (!sel || sel.isCollapsed) return;
  const glued = [...document.querySelectorAll('#chat-messages .glue')].filter((g) => sel.containsNode(g, true));
  if (!glued.length) return;
  // insertData then deleteData, not a new `data`: a selection ending inside the glue keeps its place.
  const swap = (g, v) => { const t = g.firstChild; const n = t.length; t.insertData(0, v); t.deleteData(v.length, n); };
  for (const g of glued) swap(g, g.dataset.v);
  setTimeout(() => { for (const g of glued) swap(g, '\u00A0'.repeat(g.dataset.v.length)); });
  if (!e.clipboardData) return;
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
  for (const g of box.querySelectorAll('.glue')) g.replaceWith(g.textContent);
  e.clipboardData.setData('text/plain', sel.toString());
  e.clipboardData.setData('text/html', box.innerHTML);
  e.preventDefault();
});

const timeOf = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const quoted = (text, edges) => quoteParts(text, edges).map((q) => (q.t === 'text' ? q.v
  : el('span', { class: 'glue', 'data-v': q.v }, '\u00A0'.repeat(q.v.length))));
// A bold, italic, link or code part next to a text part may hold the word its guillemet belongs to.
const holdsWord = (p) => p != null && p.t !== 'text' && p.t !== 'br';

function inlineNodes(parts) {
  return parts.flatMap((p, i) => {
    if (p.t === 'text') return quoted(p.v, { before: holdsWord(parts[i - 1]), after: holdsWord(parts[i + 1]) });
    if (p.t === 'br') return el('br');
    if (p.t === 'code') return el('code', {}, p.v);
    if (p.t === 'b') return el('strong', {}, inlineNodes(p.c));
    if (p.t === 'i') return el('em', {}, inlineNodes(p.c));
    if (p.t === 'a') return el('a', { href: p.href, target: '_blank', rel: 'noopener' }, inlineNodes(p.c));
    return null;
  });
}

// Issue #460: one click copies a command or a whole answer; a short word on the button confirms it.
async function copyText(btn, text) {
  const label = btn.querySelector('.copy-label');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {}
  btn.classList.toggle('copied', ok);
  label.textContent = ok ? 'Copié ✓' : 'Copie impossible';
  clearTimeout(btn.reset);
  btn.reset = setTimeout(() => { btn.classList.remove('copied'); label.textContent = btn.dataset.label; }, 2000);
}

const COPY_ICON = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return svg;
};

const copyButton = (label, cls, getText) => el('button', { type: 'button', class: `copy ${cls}`, 'data-label': label, onclick: (e) => copyText(e.currentTarget, getText()) },
  COPY_ICON(), el('span', { class: 'copy-label', 'aria-live': 'polite' }, label));

const TONE_NAMES = { warn: 'Attention', ok: 'Réussite', todo: 'À faire' };

function richText(text) {
  return markdown(text).map((b) => {
    if (b.type === 'p') return el('p', {}, inlineNodes(b.inline));
    if (b.type === 'quote') return el('blockquote', {}, inlineNodes(b.inline));
    if (b.type === 'callout') return el('p', { class: `callout ${b.tone}` }, el('span', { class: 'visually-hidden' }, `${TONE_NAMES[b.tone]} : `), inlineNodes(b.inline));
    if (b.type === 'pre') return el('div', { class: 'code' }, el('pre', {}, b.v), copyButton('Copier', 'copy-code', () => b.v));
    return el(b.type, {}, b.items.map((it) => el('li', {}, inlineNodes(it))));
  });
}

// Images live on the attachments branch; a private repository serves them only with the token, so each is
// fetched once and shown from a local copy.
function chatImage(path) {
  const img = el('img', { alt: 'Image envoyée', loading: 'lazy' });
  const link = el('a', { class: 'shot', target: '_blank', rel: 'noopener', 'aria-label': 'Agrandir l\'image', onclick: (e) => {
    if (!img.src || e.metaKey || e.ctrlKey || e.shiftKey) return; // a new tab when asked for
    e.preventDefault();
    openLightbox(img.src);
  } }, img);
  const show = (url) => { img.src = url; link.href = url; };
  if (path.startsWith('blob:')) { show(path); return link; }
  if (!chat.images.has(path)) {
    chat.images.set(path, fetch(`${API}/repos/${chat.repo}/contents/${path}?ref=${ATTACHMENTS_BRANCH}`, {
      headers: { authorization: `Bearer ${app.token}`, accept: 'application/vnd.github.raw' },
    }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((b) => URL.createObjectURL(b))
      .catch(() => { chat.images.delete(path); return null; }));
  }
  chat.images.get(path).then((url) => { if (url) show(url); else link.classList.add('broken'); });
  return link;
}

function openLightbox(src) {
  $('lightbox-img').src = src;
  $('lightbox').showModal();
}

// `foot`: the nodes that replace the time line (an unsent message's mention and buttons, issue #580).
function bubble(m, foot = null) {
  const pics = (m.images || []).map(chatImage);
  const text = !m.text ? [] : m.who === 'agent' ? richText(m.text) : [el('p', {}, m.text.split('\n').flatMap((l, i) => (i ? [el('br'), ...quoted(l)] : quoted(l))))];
  return el('li', { class: `msg ${m.who}` },
    pics.length ? el('div', { class: 'shots' }, pics) : null,
    text.length ? el('div', { class: 'bubble' }, text) : null,
    ...(m.issues || []).map((i) => el('a', { class: 'issue-chip', href: safeGithubUrl(i.url), target: '_blank', rel: 'noopener' },
      el('strong', {}, i.kind === 'bug' ? 'Bug créé' : 'Fonctionnalité créée'), ` · ${i.title}`, el('span', { 'aria-hidden': 'true' }, ' ↗'))),
    ...(m.proposals || []).map(proposalCard),
    ...(foot || [el('div', { class: 'msg-foot' },
      el('span', { class: 'meta' }, m.who === 'agent' ? 'Agent · ' : '', m.at ? timeOf(m.at) : 'envoi…'),
      m.who === 'agent' && m.text ? copyButton('Copier la réponse', 'copy-answer', () => m.text) : null)]));
}

// A message that could not be sent (issue #580): it keeps its place at the bottom of its conversation, with the
// mention in failure red, its reason, « Renvoyer » (greyed while an answer is on its way) and « Modifier ».
// Each button names its message for screen readers: « Renvoyer « début du texte » », or its images without text.
// The buttons read the conversation's key when clicked: a new conversation gets its own key once created (issue #580).
function unsentBubble(m) {
  const n = m.files.length;
  const what = m.text.trim() ? `« ${titleFrom(m.text)} »` : n > 1 ? `les ${n} images` : 'l\'image';
  const li = bubble({ who: 'me', text: m.text, images: m.files.map((f) => f.url), at: null }, [
    el('p', { class: 'unsent-note' }, el('strong', {}, `${UNSENT_TITLE[m.kind]}.`), ` ${m.reason}`),
    el('div', { class: 'unsent-actions' },
      el('button', { type: 'button', class: 'secondary small-btn resend', 'aria-label': `Renvoyer ${what}`, disabled: answering(), onclick: () => resend(unsentKey(chat.open), m.id) }, 'Renvoyer'),
      el('button', { type: 'button', class: 'secondary small-btn edit', 'aria-label': `Modifier ${what}`, onclick: () => editUnsent(unsentKey(chat.open), m.id) }, 'Modifier')),
  ]);
  li.classList.add('unsent');
  li.dataset.unsent = String(m.id);
  return li;
}
const unsentBubbles = () => chat.unsent.shown(unsentKey(chat.open)).map(unsentBubble);

// A failed send keeps the message in its conversation, says it to screen readers, and never refills the composer.
// Out of sight (another tab, the list on a phone, another conversation) one toast says where it waits.
function keepUnsent(key, message, again, failure) {
  if (again) chat.unsent.fail(key, again.id, failure);
  else chat.unsent.add(key, message, failure);
  sayInChat(`${UNSENT_TITLE[failure.kind]}. ${failure.reason}`);
  drawChat();
  if (!threadShown() || unsentKey(chat.open) !== key) return toast(UNSENT_AWAY);
  const list = $('chat-messages');
  list.scrollTop = list.scrollHeight; // seen even when the owner was reading higher up
}

// « Renvoyer »: the message leaves again as it was, with its images; never while an answer is on its way.
// The redraw removes the button: the keyboard goes to the composer, or back to the same « Renvoyer » if it fails again.
// On a touch screen the composer would open the on-screen keyboard: the focus goes to the conversation instead.
async function resend(key, id) {
  if (answering()) return;
  const m = chat.unsent.get(key, id);
  if (!m) return;
  const input = $('chat-input');
  const landing = matchMedia('(pointer: fine)').matches ? input : $('chat-messages');
  const sent = sendChat(m.text, true, m);
  if (document.activeElement === document.body) landing.focus();
  await sent;
  const again = chat.unsent.get(unsentKey(chat.open), id);
  const button = again && $('chat-messages').querySelector(`.msg.unsent[data-unsent="${id}"] button.resend`);
  if (button && document.activeElement === landing && !input.value) button.focus();
}

// « Modifier »: the message leaves the conversation for the composer, after what the owner already started there.
function editUnsent(key, id) {
  const m = chat.unsent.remove(key, id);
  if (!m) return;
  const input = $('chat-input');
  const { text, files, dropped } = mergeDraft({ text: input.value, files: chat.files }, m);
  input.value = text;
  chat.files = files;
  drawPendingImages();
  autosize();
  if (dropped > 0) toast(`${MAX_IMAGES} images au plus par message.`);
  drawChat();
  input.focus();
  input.setSelectionRange(text.length, text.length);
}

// « Réfléchit… 0:42 · d'habitude, environ 1 à 2 min », the time ticking every second (issue #460).
const USUAL_WAIT = 'd\'habitude, environ 1 à 2 min';
function thinkingMeta(label, since) {
  const at = Date.parse(since || '') || Date.now();
  return el('span', { class: 'meta thinking-meta' }, label, ' ',
    el('span', { class: 'num', 'data-since': String(at) }, elapsed(Date.now() - at)),
    el('span', { class: 'usual' }, ` · ${USUAL_WAIT}`));
}
setInterval(() => {
  for (const n of document.querySelectorAll('[data-since]')) n.textContent = elapsed(Date.now() - Number(n.dataset.since));
}, 1000);


// ---- Requests the agent proposes (issue #492) ----------------------------------------------------
// Nothing is created until the owner clicks « Créer cette demande » on the card under the answer.
const cardKey = (p) => `${chat.open}:${p.id}`;
// A card being decided, by project: it outlives a project switch (resetChat), so coming back during the creation
// never offers a second one, and recordCreated never writes a choice decide is still writing (review #556).
const decidingAnywhere = new Set();
const flightKey = (repo, key) => `${repo}\n${key}`;

function proposalCard(p) {
  const key = cardKey(p);
  const s = { ...p, ...chat.decided.get(key) };
  const busy = chat.deciding.has(key) || decidingAnywhere.has(flightKey(chat.repo, key));
  const kind = s.kind === 'bug' ? 'Bug' : 'Fonctionnalité';
  const outcome = s.state === 'created'
    ? el('p', { class: 'proposal-done created' }, el('span', { class: 'proposal-check', 'aria-hidden': 'true' }, '✓'), el('strong', {}, 'Créée'),
      el('a', { href: safeGithubUrl(s.url), target: '_blank', rel: 'noopener' }, 'Voir la demande', el('span', { 'aria-hidden': 'true' }, ' ↗')))
    : s.state === 'ignored' ? el('p', { class: 'proposal-done' }, el('span', { 'aria-hidden': 'true' }, '✕'), 'Ignorée')
      : el('div', { class: 'proposal-actions' },
        el('button', { type: 'button', class: 'proposal-create', disabled: busy, 'aria-busy': busy ? 'true' : false, onclick: () => decide(p, 'created') }, busy ? 'Création…' : 'Créer cette demande'),
        el('button', { type: 'button', class: 'ghost', disabled: busy, onclick: () => decide(p, 'ignored') }, 'Ignorer'));
  return el('div', { class: `proposal${s.state === 'pending' ? '' : ' decided'}`, role: 'group', 'aria-label': `${kind} proposée : ${s.title}` },
    el('p', { class: 'proposal-kind' }, kind),
    el('p', { class: 'proposal-title' }, s.title),
    s.body ? el('details', {}, el('summary', {}, 'Lire le texte'), el('div', { class: 'proposal-body' }, richText(s.body))) : null,
    s.state === 'pending' && chat.refused.has(key) ? el('p', { class: 'proposal-error', role: 'alert' }, chat.refused.get(key) === 'ignored' ? 'Ce choix n\'a pas pu être enregistré. Réessayez dans un instant.' : 'La demande n\'a pas pu être créée. Réessayez dans un instant.') : null,
    outcome);
}

// The owner's choice on a card. A request is created once: the button is off while it is made, and in instant mode
// the stored conversation is read again first (another device may have decided already).
async function decide(p, state) {
  const key = cardKey(p);
  if (chat.deciding.has(key) || chat.decided.has(key) || decidingAnywhere.has(flightKey(chat.repo, key))) return;
  // Made from another tab of this browser and not recorded yet.
  if (chat.created.entries().some(([k]) => k === key)) return;
  const repo = chat.repo, open = chat.open, server = chat.server;
  // Only leaving the project ends what this click may show (resetChat makes new maps); sending a message does not.
  // The marks too: a request made here is remembered for this project, whatever is on screen when it is made.
  const decided = chat.decided, deciding = chat.deciding, refused = chat.refused, later = chat.later, marks = chat.created;
  const gone = () => chat.decided !== decided;
  const here = () => !gone() && chat.open === open;
  deciding.add(key);
  decidingAnywhere.add(flightKey(repo, key));
  refused.delete(key);
  drawChat();
  let url, finish = false, earlier = false;
  try {
    const path = `chats/${open}.json`;
    // An answer that could not be saved lives only on screen: its cards are decided there. Every other card is read
    // again from the stored conversation first (another device may have decided it already).
    let unsaved = null;
    if (server) {
      const { data } = await chatFile(repo, path);
      const stored = (data?.messages || []).flatMap((m) => m.proposals || []).find((x) => x.id === p.id);
      if (!stored) {
        if (chat.conv?.id === open && chat.conv.unsaved) unsaved = chat.conv;
        else throw new Error('card not found');
      } else if (stored.state !== 'pending') {
        if (here() && !chat.conv?.unsaved) chat.conv = data;
        else decided.set(key, { state: stored.state, ...(stored.url ? { url: stored.url } : {}) });
        return;
      }
    }
    if (state === 'created') url = (await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify(issueRequest(p)) })).html_url;
    decided.set(key, { state, ...(url ? { url } : {}) });
    // Until the choice is in the conversation, this device remembers the request and its link (review #556).
    if (url && !unsaved) marks.set(key, url);
    try {
      if (unsaved) decideProposal(unsaved, p.id, state, url);
      else if (server) {
        const conv = await writeChatFile(repo, path, (latest) => {
          // Never written from another conversation, nor when the card is gone or was decided meanwhile.
          if (!latest || !decideProposal(latest, p.id, state, url)) throw new Error('not recorded');
          return latest;
        }, `chore(factory): chat ${open}`);
        if (here() && !chat.conv?.unsaved) chat.conv = conv;
      } else {
        await api(`/repos/${repo}/issues/${open}/comments`, { method: 'POST', body: JSON.stringify({ body: decisionComment(p.id, state, url) }) });
        // The choice is one more comment on the conversation: already seen, never a « new answer ».
        if (chat.repo === repo && chat.seen[open] != null) {
          chat.seen[open] += 1;
          store.set(`${SEEN_KEY}.${repo}`, JSON.stringify(chat.seen));
        }
      }
      marks.delete(key);
      // Never while an answer is on its way (it may bring new cards), nor while another card of it is being decided.
      if (!unsaved && here()) {
        // An answer still on its way: the end waits for it (finishWhenDone, issue #521).
        if (answering()) later.set(open, state === 'created' || later.get(open) ? FINISHED_SAID : '');
        else {
          // The turn is over: this click decides now, and a mark left from the turn is used up here.
          earlier = Boolean(later.get(open));
          later.delete(open);
          finish = !chat.conv?.unsaved && ![...deciding].some((k) => k !== key && k.startsWith(`${open}:`)) && finishesConversation(conversationCards(open, decided));
        }
      } else if (!unsaved && !gone()) {
        // The owner went to another conversation meanwhile: it is put away from there, once its agent is done (#535).
        later.set(open, state === 'created' || later.get(open) ? FINISHED_SAID : '');
      }
    } catch {
      if (!gone()) toast(state === 'created' ? 'Demande créée, mais ce choix n\'a pas pu être enregistré dans la conversation.' : 'Ce choix n\'a pas pu être enregistré dans la conversation.');
    }
  } catch {
    refused.set(key, state); // said on the card itself, next to the button to try again
  } finally {
    deciding.delete(key);
    decidingAnywhere.delete(flightKey(repo, key));
    // Back on this project during the click: the screen's maps are new ones, they learn the request here.
    if (gone() && url && chat.repo === repo) chat.decided.set(key, { state: 'created', url });
    if (!gone() || chat.repo === repo) drawChat();
    if (url) call('renderBoard').catch(() => {});
  }
  if (finish) await closeConversation({ stay: true, said: state === 'created' || earlier ? FINISHED_SAID : undefined });
  else if (!gone()) finishWhenDone();
}

const FINISHED_SAID = 'Demande créée, conversation rangée dans « Terminées »';

// Issue #521: a card decided while the agent was still on its turn ends the conversation once that turn is over, if
// every card is then decided and a request was created (the answer may have brought new cards: then it stays open).
// Issue #535: checked for every conversation waiting for it, the open one or not, at each refresh.
async function finishWhenDone() {
  const later = chat.later;
  if (chat.finishing === later || !later.ids().length) return;
  chat.finishing = later;
  try {
    for (const id of later.ids()) {
      if (chat.later !== later) return;
      if ([...chat.deciding].some((k) => k.startsWith(`${id}:`))) continue;
      const seen = id === chat.open ? openThread(id) : await otherThread(id);
      // Still on its turn, not loaded yet, no answer after a long wait, or GitHub did not answer: the next refresh checks again.
      if (!seen || chat.later !== later || !later.has(id)) continue;
      // Away from it, the message names the conversation: the one on screen is not the one put away.
      const title = id === chat.open ? null : chat.list?.find((c) => (chat.server ? c.id : c.number) === id)?.title;
      const said = title && later.get(id) ? `Demande créée, « ${title} » rangée dans « Terminées »` : later.get(id);
      later.delete(id);
      if (!seen.closed && finishesConversation(seen.cards)) await closeConversation({ id, stay: true, said: said || undefined });
    }
  } finally {
    if (chat.finishing === later) chat.finishing = null;
  }
}

// The instant-mode conversations whose answer is on its way (« owner/repo:id »), whatever project is on screen.
const streaming = new Set();

// The open conversation as the screen has it, or null while its agent is on it.
function openThread(id) {
  if (answering() || streaming.has(`${chat.repo}:${id}`) || (chat.server ? chat.conv?.id !== id : chat.issue?.number !== id)) return null;
  if (!chat.server && chatStatus(chat.issue, chatMessages(chat.issue, chat.comments)) === 'late') return null;
  const closed = chat.server ? chat.list?.find((c) => c.id === id)?.state === 'closed' : chat.issue.state === 'closed';
  return { closed, cards: conversationCards(id, chat.decided) };
}

// Another conversation, read again from GitHub, or null while its agent is on it (or when it cannot be read).
async function otherThread(id) {
  const repo = chat.repo;
  const gone = { closed: true, cards: [] };
  try {
    if (chat.server) {
      if (chat.live || chat.sending || !chat.list || streaming.has(`${repo}:${id}`)) return null;
      const entry = chat.list.find((c) => c.id === id);
      if (!entry || entry.state === 'closed') return gone;
      const conv = await branchJson(`chats/${id}.json`);
      return chat.repo === repo && conv ? { closed: false, cards: threadCards(id, serverMessages(conv), chat.decided) } : null;
    }
    if (typeof id !== 'number') return gone;
    const issue = await chatGet(`/repos/${repo}/issues/${id}`);
    if (issue.state === 'closed') return gone;
    const comments = [];
    const pages = Math.max(1, Math.ceil((issue.comments || 0) / 100));
    for (let p = 1; p <= pages; p++) comments.push(...trustNotes(await chatGet(`/repos/${repo}/issues/${id}/comments?per_page=100&page=${p}`), repo.split('/')[0]));
    const messages = chatMessages(issue, comments);
    if (chat.repo !== repo || chatStatus(issue, messages) !== 'idle') return null;
    return { closed: false, cards: threadCards(id, messages, chat.decided) };
  } catch (e) {
    return e?.status === 404 ? gone : null;
  }
}

// The owner is waiting for an answer in the open conversation.
const answering = () => Boolean(chat.live || chat.sending || chat.pending)
  || (!chat.server && Boolean(chat.issue) && chatStatus(chat.issue, chatMessages(chat.issue, chat.comments)) === 'thinking');

// Every card of the open conversation, with the choices made on this screen (issue #516).
function conversationCards(open, decided) {
  const messages = chat.server ? serverMessages(chat.conv?.id === open ? chat.conv : null)
    : chat.issue?.number === open ? chatMessages(chat.issue, chat.comments) : [];
  return threadCards(open, messages, decided);
}

// The cards of a conversation's messages, with the choices made on this screen.
const threadCards = (id, messages, decided) => messages.flatMap((m) => m.proposals || []).map((p) => ({ ...p, ...decided.get(`${id}:${p.id}`) }));

// The answer being written by the chat server, updated in place as it streams.
function liveBubble() {
  const live = chat.live;
  return el('li', { class: 'msg agent', id: 'live-bubble' },
    live.text
      ? el('div', { class: 'bubble' }, richText(live.text))
      : el('div', { class: 'bubble typing', role: 'img', 'aria-label': 'L\'agent réfléchit' }, el('span'), el('span'), el('span')),
    thinkingMeta(live.status || 'Réfléchit…', live.since));
}

function drawLive() {
  const node = $('live-bubble');
  if (!node || !chat.live) return drawChat();
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  node.replaceWith(liveBubble());
  if (stick) list.scrollTop = list.scrollHeight;
}

// « Nouvelle conversation » carries « Non envoyé » too while a first message waits there, unsent (issue #580).
function drawNewEntry() {
  const waiting = chat.unsent.shown('new').length > 0;
  $('chat-new').replaceChildren('Nouvelle conversation', ...(waiting ? [el('span', { class: 'visually-hidden' }, ', '), el('span', { class: 'conv-unsent' }, 'Non envoyé')] : []));
}

function drawChatList() {
  drawNewEntry();
  const items = $('chat-items');
  if (!chat.list && chat.error) return items.replaceChildren(el('li', {}, el('div', { class: 'chat-error', role: 'alert' }, el('strong', {}, 'Impossible de charger les discussions'), el('span', { class: 'muted' }, 'Vérifiez votre connexion.'), el('button', { type: 'button', class: 'secondary', onclick: () => { chat.error = false; drawChatList(); refreshChat(); } }, 'Réessayer'))));
  if (!chat.list) return items.replaceChildren(el('li', { class: 'sk-chat' }, el('span', { class: 'visually-hidden' }, 'Chargement…'), el('span', { class: 'sk-bar', style: 'width:70%' }), el('span', { class: 'sk-bar', style: 'width:50%' })));
  if (!chat.list.length) return items.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Aucune conversation pour l\'instant.'));
  const open = chat.list.filter((c) => c.state === 'open');
  const done = chat.list.filter((c) => c.state !== 'open');
  const row = (c) => {
    const key = chat.server ? c.id : c.number;
    const thinking = chat.server ? Boolean(chat.live) && chat.open === key : c.state === 'open' && c.labels.some((l) => l.name === 'factory:running');
    const fresh = isUnread(c) && !(chat.open === key && threadShown());
    const unsent = chat.unsent.shown(key).length > 0;
    return el('li', {},
      el('button', { type: 'button', class: `conv${chat.open === key ? ' current' : ''}${fresh ? ' fresh' : ''}`, 'aria-current': chat.open === key ? 'true' : false, onclick: () => selectConversation(key) },
        el('span', { class: 'conv-title' }, c.title),
        el('span', { class: 'conv-meta' }, thinking ? el('span', { class: 'typing-dot', 'aria-hidden': 'true' }) : null,
          thinking ? 'L\'agent réfléchit' : fresh ? 'Nouvelle réponse' : timeOf(c.updated || c.updated_at),
          unsent ? el('span', { class: 'conv-unsent' }, 'Non envoyé') : null)));
  };
  items.replaceChildren(...open.map(row), ...(done.length ? [el('li', { class: 'chat-sep' }, 'Terminées')] : []), ...done.map(row));
  const n = open.filter(isUnread).length;
  // Away from the thread, a screen reader hears that an answer came in (the badge itself is silent).
  if (chat.badge != null && n > chat.badge && !threadShown()) {
    const say = $('chat-badge-announce');
    say.textContent = '';
    requestAnimationFrame(() => { say.textContent = 'Nouvelle réponse de l\'agent.'; });
  }
  chat.badge = n;
  $('chat-badge').hidden = !n;
  $('chat-badge').textContent = String(n);
  $('chat-badge-label').textContent = n ? `${n} ${n > 1 ? 'nouvelles réponses' : 'nouvelle réponse'}` : '';
}

// Each redraw replaces every row: the keyboard stays on the « Renvoyer » / « Modifier » it was on (issue #580).
function drawChat() {
  const focused = document.activeElement?.closest?.('#chat-messages .msg.unsent button');
  const keep = focused && { id: focused.closest('.msg.unsent').dataset.unsent, which: focused.classList.contains('resend') ? 'resend' : 'edit' };
  drawThread();
  if (!keep || document.activeElement !== document.body) return;
  $('chat-messages').querySelector(`.msg.unsent[data-unsent="${keep.id}"] button.${keep.which}`)?.focus({ preventScroll: true });
}

function drawThread() {
  fitChat();
  drawChatList();
  const isNew = (chat.open === 'new' || chat.open == null) && !chat.live;
  if (chat.server) { drawServerChat(isNew); return replaceToast(); }
  $('chat-title').textContent = isNew ? 'Nouvelle conversation' : chat.issue?.title || chat.list?.find((c) => c.number === chat.open)?.title || '';
  $('chat-tools').hidden = isNew || !chat.issue;
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const waiting = unsentBubbles();
  if (isNew && !chat.pending && !waiting.length) {
    list.replaceChildren(el('li', { class: 'chat-intro' },
      el('p', { class: 'intro-title' }, 'Parlez à l\'agent de votre appli'),
      examples()));
  } else if (isNew) {
    // A new conversation's first message, on its way or unsent: no intro over it.
    // Unsent messages stay above « Réfléchit… »: never read as the message being answered.
    const mine = chat.pending ? [bubble({ who: 'me', text: chat.pending.text, images: chat.pending.previews, at: null })] : [];
    list.replaceChildren(...mine, ...waiting, ...(chat.pending ? [thinkingBubble(chat.pending.since)] : []));
  } else if (chat.issue && chat.issue.number === chat.open) {
    const messages = chatMessages(chat.issue, chat.comments);
    if (chat.pending) messages.push({ who: 'me', text: chat.pending.text, images: chat.pending.previews, at: null });
    const status = chat.pending ? 'thinking' : chatStatus(chat.issue, messages);
    const tail = status === 'thinking'
      ? thinkingBubble(chat.pending?.since || waitingSince(messages) || messages.findLast((m) => m.who === 'me')?.at)
      : status === 'late'
        ? el('li', { class: 'notice' }, 'Pas encore de réponse. Renvoyez votre message un peu plus tard.')
        : status === 'closed' ? el('li', { class: 'notice' }, 'Conversation terminée. Écrivez un message pour la reprendre.') : null;
    list.replaceChildren(...messages.map((m) => bubble(m)), ...waiting, ...(tail ? [tail] : []));
    announceAnswers(chat.issue.number, messages);
    $('chat-close').hidden = status === 'closed';
  } else {
    list.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Chargement…'), ...waiting);
  }
  if (stick || chat.pending) list.scrollTop = list.scrollHeight;
  replaceToast();
}

// The agent's « typing » bubble with the time it has been thinking.
const thinkingBubble = (since) => el('li', { class: 'msg agent' },
  el('div', { class: 'bubble typing', role: 'img', 'aria-label': 'L\'agent réfléchit' }, el('span'), el('span'), el('span')),
  thinkingMeta('Réfléchit…', since));

// The list is redrawn on every poll: only a new answer of the agent is read out, not the whole conversation again.
let announced = { id: null, count: 0 };
function announceAnswers(id, messages) {
  const count = messages.filter((m) => m.who === 'agent').length;
  // A new conversation gets its number with its first answer: still the same conversation.
  const same = announced.id === id || announced.id == null || announced.id === 'new';
  if (same && count > announced.count) sayInChat('Nouvelle réponse de l\'agent.');
  announced = { id, count };
}

// Reads a sentence out to screen readers, through the conversation's live region.
function sayInChat(text) {
  const live = $('chat-announce');
  live.textContent = ''; // the same words again must still be read out
  requestAnimationFrame(() => { live.textContent = text; });
}

const examples = () => el('div', { class: 'examples' }, EXAMPLES.map((x) => el('button', { type: 'button', class: 'secondary example', onclick: () => { $('chat-input').value = x; autosize(); $('chat-input').focus(); } }, x)));

function drawServerChat(isNew) {
  const list = $('chat-messages');
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const entry = chat.list?.find((c) => c.id === chat.open);
  $('chat-title').textContent = isNew ? 'Nouvelle conversation' : chat.conv?.title || entry?.title || (chat.live ? titleFrom(chat.pending?.text || 'Nouvelle conversation') : '');
  $('chat-tools').hidden = isNew || !chat.conv;
  $('chat-close').hidden = entry?.state === 'closed';
  const waiting = unsentBubbles();
  if (isNew && !waiting.length) {
    list.replaceChildren(el('li', { class: 'chat-intro' },
      el('p', { class: 'intro-title' }, 'Parlez à l\'agent de votre appli'),
      examples()));
  } else if (isNew) {
    list.replaceChildren(...waiting);
  } else if (chat.conv || chat.live) {
    const messages = serverMessages(chat.conv);
    if (chat.pending) messages.push({ who: 'me', text: chat.pending.text, images: chat.pending.previews, at: null });
    const tail = chat.live ? liveBubble()
      : entry?.state === 'closed' ? el('li', { class: 'notice' }, 'Conversation terminée. Écrivez un message pour la reprendre.') : null;
    list.replaceChildren(...messages.map((m) => bubble(m)), ...waiting, ...(tail ? [tail] : []));
    announceAnswers(chat.open, messages);
  } else {
    list.replaceChildren(el('li', { class: 'muted chat-empty' }, 'Chargement…'), ...waiting);
  }
  if (stick || chat.pending) list.scrollTop = list.scrollHeight;
}

function selectConversation(n) {
  if (chat.live && n !== chat.open) return toast('Attendez la fin de la réponse en cours.');
  chat.open = n;
  chat.clicks = (chat.clicks || 0) + 1; // a check already running fetches the old one: refreshChat checks again at once
  chat.pending = null;
  if (chat.issue?.number !== n) { chat.issue = null; chat.comments = []; }
  if (chat.conv?.id !== n) chat.conv = null;
  $('chat').classList.add('viewing');
  drawChat();
  const list = $('chat-messages');
  list.scrollTop = list.scrollHeight;
  if (n !== 'new') { clearTimeout(chat.timer); refreshChat(); }
  if (n === 'new' || matchMedia('(pointer: fine)').matches) $('chat-input').focus();
}

// The attachments branch holds images only (never merged); it is created on the first image.
async function ensureAttachmentsBranch(repo) {
  if (await api(`/repos/${repo}/branches/${ATTACHMENTS_BRANCH}`)) return;
  const tree = await api(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ tree: [
    { path: 'README.md', mode: '100644', type: 'blob', content: "# Pièces jointes\n\nImages envoyées par le propriétaire (chat du tableau, issues, PR), pour que l'agent puisse les voir. Ne pas fusionner.\n" },
    { path: 'vercel.json', mode: '100644', type: 'blob', content: '{ "git": { "deploymentEnabled": false } }\n' },
  ] }) });
  const commit = await api(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'chore(factory): attachments branch', tree: tree.sha, parents: [] }) });
  await api(`/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${ATTACHMENTS_BRANCH}`, sha: commit.sha }) }).catch((e) => {
    if (e.status !== 422) throw e; // 422: created meanwhile
  });
}

// Photos are scaled down to 1600 px and saved as JPEG: enough to read a screenshot, light to send.
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.88));
  const data = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(blob); });
  return data.split(',')[1];
}

async function uploadImages(repo, files) {
  if (!files.length) return [];
  await ensureAttachmentsBranch(repo);
  const paths = [];
  for (const f of files) {
    // Uploaded before a send that failed: « Renvoyer » does not upload it again (issue #580).
    if (f.path) { paths.push(f.path); continue; }
    const path = imagePath('image/jpeg');
    await api(`/repos/${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: `chore(factory): chat image ${path}`, content: await shrink(f.file), branch: ATTACHMENTS_BRANCH }) });
    chat.images.set(path, Promise.resolve(f.url)); // already on screen: no download
    f.path = path;
    paths.push(path);
  }
  return paths;
}

function addImages(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  const room = MAX_IMAGES - chat.files.length;
  if (images.length > room) toast(`${MAX_IMAGES} images au plus par message.`);
  for (const file of images.slice(0, Math.max(0, room))) chat.files.push({ file, url: URL.createObjectURL(file) });
  drawPendingImages();
}

function drawPendingImages() {
  const box = $('chat-pending');
  box.hidden = !chat.files.length;
  box.replaceChildren(...chat.files.map((f, i) => el('div', { class: 'pending-image' },
    el('img', { src: f.url, alt: `Image ${i + 1} à envoyer` }),
    el('button', { type: 'button', class: 'remove', 'aria-label': `Retirer l'image ${i + 1}`, onclick: () => { chat.files.splice(i, 1); drawPendingImages(); } }, '×'))));
  if ($('toast').classList.contains('show')) placeToast();
}

// On the Agent tab the toast sits 12 px above the composer (attached images included), measured: a text of several
// lines never hides under it (issue #580). Elsewhere, and while no composer shows (the list of conversations on a
// phone, the read-token card), it keeps its usual place, 24 px from the bottom.
function placeToast() {
  const t = $('toast');
  const strip = $('chat-pending');
  const box = strip.hidden ? $('chat-form') : strip;
  if (!threadShown() || needsReadToken() || !box.getClientRects().length) { t.style.setProperty('--toast-bottom', '24px'); return; }
  const top = box.getBoundingClientRect().top;
  t.style.setProperty('--toast-bottom', `${toastBottom(innerHeight, top, t.offsetHeight)}px`);
}
// A toast already shown moves with the screen under it: list, conversation, another tab.
function replaceToast() { if ($('toast').classList.contains('show')) placeToast(); }

// `again`: the unsent message « Renvoyer » sends again (issue #580), with its own images; the composer is not touched.
async function sendChat(text, withImages = true, again = null) {
  text = text.trim();
  const files = again ? again.files : withImages ? [...chat.files] : [];
  if ((!text && !files.length) || !app.current) return;
  if (chat.sending) return;
  if (chat.server) return sendToServer(text, files, withImages, again);
  const repo = chat.repo;
  const btn = $('chat-send');
  const run = chat.run = {};
  const gone = () => chat.run !== run; // the owner switched project: nothing below may touch the new one
  btn.disabled = true;
  chat.sending = true;
  const sentTo = chat.open;
  let key = unsentKey(chat.open);
  if (again) chat.unsent.retry(key, again.id);
  chat.later.delete(sentTo); // writing again carries the conversation on: no end on the agent's previous turn (#521)
  // The composer empties at once and the message shows as being sent, in a new conversation too (issue #580).
  if (withImages && !again) clearComposer();
  chat.pending = { text, previews: files.map((f) => f.url), since: new Date().toISOString() };
  drawChat();
  try {
    const open = chat.open, wasClosed = chat.issue?.state === 'closed';
    const paths = await uploadImages(repo, files);
    const body = [text, ...paths.map((p) => imageBlock(repo, p))].filter(Boolean).join('\n\n');
    // Sent to the end even if the owner switched project meanwhile; only the screen updates below are skipped.
    if (typeof open !== 'number') {
      const issue = await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: titleFrom(text || 'Image envoyée'), labels: [CHAT_LABEL], body }) });
      if (gone()) return;
      chat.pending = null; // the issue's description is the message
      chat.open = issue.number;
      chat.issue = issue;
      chat.comments = [];
      markSeen(issue);
      // Messages left unsent in the new conversation follow it.
      if (again) chat.unsent.remove(key, again.id);
      chat.unsent.rekey(key, issue.number);
      key = issue.number;
    } else {
      if (wasClosed) await api(`/repos/${repo}/issues/${open}`, { method: 'PATCH', body: JSON.stringify({ state: 'open' }) });
      await api(`/repos/${repo}/issues/${open}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    }
    if (gone()) return;
    if (again) chat.unsent.remove(key, again.id);
    clearTimeout(chat.timer);
    chat.etags.clear();
    await refreshChat();
  } catch (e) {
    if (gone()) return;
    chat.pending = null;
    chat.later.delete(sentTo); // the turn never happened: no end of conversation on top of this error (#521)
    chat.sending = false; // « Renvoyer » is drawn active
    keepUnsent(key, { text, files }, again, { kind: 'unsent', reason: errorText(e) });
  } finally {
    if (!gone()) { chat.sending = false; btn.disabled = false; }
  }
}

// The open requests of the board shown, for the chat agent's duplicate check (issue #506); null when not loaded.
const boardRequests = (repo) => { const b = call('board'); return openRequests(b.repo === repo ? b.issues : null); };

// Sends a message to the chat server and shows the answer as it is written.
async function sendToServer(text, files, withImages, again = null) {
  if (chat.live) return;
  const repo = chat.repo;
  const btn = $('chat-send');
  const run = chat.run = {};
  // The owner switched project: the answer is still read to the end (the server stops the agent when the panel hangs
  // up), then saved on the project it belongs to, but nothing is shown or restored on the other project.
  const gone = () => chat.run !== run;
  btn.disabled = true;
  const isNew = !chat.open || chat.open === 'new';
  const key = unsentKey(chat.open);
  if (again) chat.unsent.retry(key, again.id);
  // The marks of this project, even once the owner went to another one (they are read from the browser each time).
  const marks = chat.later, sentTo = chat.open;
  marks.delete(sentTo); // writing again carries the conversation on (#521)
  // Its answer is on its way even if the owner goes to another project and back: no end meanwhile (#535).
  const streamed = isNew ? null : `${repo}:${chat.open}`;
  if (streamed) streaming.add(streamed);
  // Kept here: a click on the open conversation clears chat.pending while the answer is on its way.
  const previews = files.map((f) => f.url);
  chat.pending = { text, previews };
  const live = chat.live = { text: '', status: files.length ? 'Envoi des images…' : 'Envoi…', since: new Date().toISOString() };
  if (withImages && !again) clearComposer();
  drawChat();
  let answer = null;
  let reached = false; // the chat server took the request: a failure from here on is « L'agent n'a pas pu répondre »
  try {
    const paths = await uploadImages(repo, files);
    // Never the full token: without the read-only one there is no chat (issue #395).
    if (!app.readToken) throw Object.assign(new Error('Créez d\'abord le jeton de lecture avec le bouton ci-dessus.'), { readToken: true });
    const res = await fetch(`${chat.server}/chat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${app.readToken}`, 'content-type': 'application/json' },
      // The open requests of this project, so the agent never proposes a duplicate (issue #506).
      body: JSON.stringify({ repo, conversation: isNew ? null : chat.open, message: text, images: paths, openRequests: boardRequests(repo) }),
    });
    reached = true;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) throw Object.assign(saidError('GitHub a refusé votre jeton de lecture : il a sans doute expiré ou été supprimé. Créez-en un nouveau avec le bouton ci-dessus.'), { readToken: true });
      if (body.code === 'writable') throw Object.assign(saidError(WRITABLE_TOKEN), { readToken: true });
      if (body.code === 'classic') throw Object.assign(saidError(CLASSIC_TOKEN), { readToken: true });
      throw saidError(agentRefusal(res.status));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const { events, rest } = ndjson(buffer + decoder.decode(value, { stream: true }));
      buffer = rest;
      for (const e of events) {
        if (e.type === 'status') live.status = e.text;
        else if (e.type === 'delta') { live.text += e.text; live.status = 'Écrit…'; }
        else if (e.type === 'draft') live.text = e.text;
        else if (e.type === 'reset') live.text = '';
        else if (e.type === 'answer') answer = e;
        else if (e.type === 'error') throw saidError(agentRefusal());
      }
      if (!gone()) drawLive();
    }
    if (!answer) throw saidError(ANSWER_CUT);
    // The answer is complete: from here on nothing may make the owner resend it (the issues would be made twice).
    live.status = 'Enregistre…';
    if (!gone()) drawLive();
    const id = conversationId(answer.conversation?.id, isNew ? null : chat.open);
    const { conv, saved } = await finishExchange(repo, id, { text, images: paths }, answer);
    // Its answer lives only on screen (or nowhere, on another project): never put away on top of it (#521, #535).
    if (!saved) marks.delete(conv.id);
    if (!gone()) {
      for (const [i, p] of paths.entries()) chat.images.set(p, Promise.resolve(previews[i]));
      chat.conv = conv;
      chat.open = conv.id;
      if (again) chat.unsent.remove(key, again.id);
      chat.unsent.rekey(key, conv.id); // messages left unsent in a new conversation follow it
      if (!saved) {
        toast('Réponse reçue, mais conversation non enregistrée. Ne renvoyez pas votre message.');
      }
      else {
        const c = { id: conv.id, title: conv.title, updated: conv.updated, state: 'open' };
        chat.list = serverList([c, ...(chat.list || []).filter((x) => x.id !== c.id)]);
        // Watched as it was written: seen. Finished while the owner was on another tab: the badge lights up.
        if (threadShown()) markServerSeen(c.id, c.updated);
        else if (!serverUnread(c, chat.seen)) markServerSeen(c.id, new Date(0).toISOString());
      }
    }
  } catch (e) {
    marks.delete(sentTo); // the agent did not answer: the conversation stays open with the message to resend (#521, #535)
    if (gone()) return;
    if (e.readToken) readTokenRefused(e.message);
    chat.pending = null;
    chat.live = null; // « Renvoyer » is drawn active
    keepUnsent(key, { text, files }, again, {
      kind: failureKind({ reached, readToken: e.readToken }),
      reason: e.readToken ? TOKEN_REFUSED : errorText(e),
    });
  } finally {
    if (streamed) streaming.delete(streamed);
    if (!gone()) {
      chat.pending = null;
      chat.live = null;
      btn.disabled = false;
      drawChat();
      finishWhenDone();
    }
  }
}

const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const SAVE_TRIES = 5;

// After an answer: the panel saves the exchange on `factory-chat` with the full token (the chat server never writes).
// The requests the agent proposed are saved as cards waiting for the owner's click (issue #492), never created here.
// Never throws: a failure is said under the answer or in a toast.
async function finishExchange(repo, cid, mine, answer) {
  const proposals = wantedIssues(answer.issues);
  const tag = cardTag(); // the same card ids whether the answer is saved or only kept on screen
  const text = answer.text || '';
  const at = stamp();
  const base = newConversation(cid, mine.text || answer.conversation?.title || '', at);
  try {
    return { conv: await saveExchange(repo, cid, base, mine, text, at, proposals, tag), saved: true };
  } catch {
    const conv = addExchange(chat.conv?.id === cid ? structuredClone(chat.conv) : base, mine, `${text}\n\n_Cette réponse n'a pas pu être enregistrée._`, at, proposals, tag);
    conv.unsaved = true;
    return { conv, saved: false };
  }
}

// A JSON file of `factory-chat` with its sha (null when missing). Over 1 MB the contents API sends no content.
async function chatFile(repo, path) {
  // Never from the browser's cache (GitHub allows 60 s): an old sha would make every write of the retry fail.
  const meta = await api(`/repos/${repo}/contents/${path}?ref=${CHAT_BRANCH}`, { cache: 'no-store' });
  if (!meta) return { data: null, sha: null };
  if (meta.content) return { data: JSON.parse(fromBase64(meta.content)), sha: meta.sha };
  const res = await fetch(`${API}/repos/${repo}/contents/${path}?ref=${CHAT_BRANCH}`, { cache: 'no-store', headers: { authorization: `Bearer ${app.token}`, accept: 'application/vnd.github.raw' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return { data: await res.json(), sha: meta.sha };
}

// Writes `make(latest)` with the sha just read: GitHub refuses it if another save landed in between (another device,
// « Terminer »), and it starts again from the latest version.
async function writeChatFile(repo, path, make, message) {
  for (let attempt = 0; ; attempt++) {
    const { data, sha } = await chatFile(repo, path);
    let written;
    const next = make(data);
    try {
      written = await api(`/repos/${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, branch: CHAT_BRANCH, content: toBase64(JSON.stringify(next, null, 1) + '\n'), ...(sha ? { sha } : {}) }) });
      if (!written) throw new Error('404'); // the branch vanished: not saved
      return next;
    } catch (e) {
      if (![409, 422].includes(e.status) || attempt >= SAVE_TRIES - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1) * Math.random()));
    }
  }
}

async function ensureChatBranch(repo) {
  if (await api(`/repos/${repo}/branches/${CHAT_BRANCH}`)) return;
  const tree = await api(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ tree: [
    { path: 'README.md', mode: '100644', type: 'blob', content: "# Discussions\n\nConversations du chat du tableau de suivi avec l'agent. Ne pas fusionner.\n" },
    { path: 'vercel.json', mode: '100644', type: 'blob', content: '{ "git": { "deploymentEnabled": false } }\n' },
  ] }) });
  const commit = await api(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: `chore(factory): ${CHAT_BRANCH} branch`, tree: tree.sha, parents: [] }) });
  await api(`/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${CHAT_BRANCH}`, sha: commit.sha }) }).catch((e) => {
    if (e.status !== 422) throw e; // 422: created meanwhile
  });
}

async function saveExchange(repo, cid, base, mine, text, at, proposals, tag) {
  await ensureChatBranch(repo);
  const conv = await writeChatFile(repo, `chats/${cid}.json`, (latest) => {
    const next = addExchange(latest || structuredClone(base), mine, text, at, proposals, tag);
    next.id = cid; // a stored id is never trusted
    return next;
  }, `chore(factory): chat ${cid}`);
  await writeChatFile(repo, 'index.json', (index) => upsertIndex(index, conv), 'chore(factory): chat index');
  return conv;
}

// In server mode, « Terminer » only marks the conversation in the branch's index. Saved like any other write: another
// device may have saved the index meanwhile.
const closeServerConversation = (id) => writeChatFile(chat.repo, 'index.json', (index) => {
  if (!index) throw new Error('404');
  return index.map((c) => (c.id === id ? { ...c, state: 'closed' } : c));
}, 'chore(factory): chat index');

// « Terminer », or the end of a conversation whose cards are all decided (issue #516): then the conversation stays on
// screen (`stay`) and says how it ended (`said`).
async function closeConversation({ id = chat.open, stay = false, said } = {}) {
  const open = id;
  const server = chat.server;
  if (server ? !open || open === 'new' : typeof open !== 'number') return;
  try {
    if (server) {
      await closeServerConversation(open);
      // Shown at once, even when a refresh is already running (it would skip this one).
      if (chat.list) chat.list = chat.list.map((c) => (c.id === open ? { ...c, state: 'closed' } : c));
      drawChat();
    }
    else {
      await api(`/repos/${chat.repo}/issues/${open}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
      chat.etags.clear();
      if (chat.issue?.number === open) { chat.issue = { ...chat.issue, state: 'closed' }; drawChat(); }
    }
    toast(said || 'Conversation rangée dans « Terminées »');
    if (!stay) $('chat').classList.remove('viewing');
    chat.clicks = (chat.clicks || 0) + 1; // a check already running read the old state: it checks again at once
    await refreshChat();
  } catch (e) {
    toast(`Impossible de terminer la conversation. ${errorText(e)}`);
  }
}

function clearComposer() {
  $('chat-input').value = '';
  chat.files = [];
  drawPendingImages();
  autosize();
}

function autosize() {
  const t = $('chat-input');
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  if ($('toast').classList.contains('show')) placeToast();
}

$('chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('chat-input').value); });
$('chat-input').addEventListener('input', autosize);
// Enter sends on a computer (Shift+Enter for a new line); on a phone, Enter is a new line and the button sends.
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) {
    e.preventDefault();
    $('chat-form').requestSubmit();
  }
});
$('chat-new').addEventListener('click', () => selectConversation('new'));
$('lightbox').addEventListener('click', () => $('lightbox').close());
$('lightbox').addEventListener('close', () => { $('lightbox-img').removeAttribute('src'); });
$('chat-back').addEventListener('click', () => { $('chat').classList.remove('viewing'); drawChatList(); replaceToast(); });
$('chat-feature').addEventListener('click', () => sendChat(ASK.feature, false));
$('chat-bug').addEventListener('click', () => sendChat(ASK.bug, false));
$('chat-attach').addEventListener('click', () => $('chat-file').click());
$('chat-file').addEventListener('change', (e) => { addImages(e.target.files); e.target.value = ''; });
$('chat-input').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); addImages(files); }
});
for (const t of ['dragover', 'drop']) {
  document.querySelector('.chat-thread').addEventListener(t, (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    if (t === 'drop') addImages(e.dataTransfer.files);
  });
}
$('chat-close').addEventListener('click', () => closeConversation());

// The arrow keys of the tab list click from code (untrusted): the keyboard stays on the tabs (WAI-ARIA tabs pattern).
$('tab-chat').addEventListener('click', (e) => selectTab('chat', e.isTrusted));

onReset(() => {
  clearTimeout(chat.timer);
});
onView((e) => {
  if (e.what === 'screen' && e.screen !== 'project-view' && document.body.classList.contains('chat-fullscreen')) setChatFull(false);
  if (e.what === 'general') {
    // The full screen removes the page's side margins: the general page never opens in it (review #556).
    if (e.general && document.body.classList.contains('chat-fullscreen')) setChatFull(false);
    // Back on « Agent »: the answer is on screen now, its badge and « Nouvelle réponse » go at once (review #556).
    if (e.was.general && !e.general && e.tab === 'chat' && e.screen === 'project-view' && app.current && chat.repo) refreshChat();
  }
  if (e.what === 'tab') {
    // Away from « Agent », the chat keeps being checked in the background so its badge can light up (issue #283).
    if (e.tab === 'chat') openChat(); else if (e.was.tab === 'chat') scheduleChat();
    // Issue #460: the « Agent » tab uses exactly the height left under the header.
    document.body.classList.toggle('chat-wide', e.tab === 'chat');
    if (e.tab !== 'chat') setChatFull(false);
    fitChat();
    replaceToast();
    if (e.tab === 'chat' && e.focus) focusChat();
  }
});
onUnsaved('message', () => Boolean($('chat-input')?.value.trim()) || chat.files.length > 0);
onUnsaved('answering', () => Boolean(chat.live));
// Unsent messages live in memory only: a reload would lose them (issue #580).
onUnsaved('unsent', () => chat.unsent.size > 0);
// On the Agent tab a toast sits above the composer (issue #580).
onToast(placeToast);
