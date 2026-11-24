import { fromBase64, issuesUrl, issuesLinkText, chatServerUrl, isDeployed, versioned } from './lib.mjs';
import { resolveConfig, parseRawConfig } from './config-core.mjs';
import { watchNumbers } from './numbers.mjs';
import { setupTabs } from './tabs.mjs';
import { errorText } from './errors.mjs';
import { PROJECT_KEY, $, store, app, el, toast, resetSession, hasUnsaved, show, selectTab, holdForBoard, boardFirst, provide } from './common.mjs';
import './github.mjs';
import './screen-general.mjs';
import { recallProjects, loadProjects, checkProjects, refreshDots, renderProjectList } from './screen-projects.mjs';
import { enterBoard, renderBoard, startLive, boardInfo } from './screen-board.mjs';
import { resetChat, setChatServer } from './screen-chat.mjs';
import { drawSub, drawGap, refreshGap, drawRelease, refreshRelease, loadDelivery, refreshStable, refreshRuns } from './screen-header.mjs';
import { renderRules, loadMachine, updateTrigger, refreshRunnerAlert } from './screen-rules.mjs';
import './screen-login.mjs';

provide('openProject', openProject);
provide('start', start);

async function openProject(fullName) {
  const next = app.projects.find((p) => p.repo.full_name === fullName) || app.projects[0];
  // A broken settings file opens with the default settings: it must never lock the panel on that project.
  const { raw, warning } = parseRawConfig(next.file?.content ? fromBase64(next.file.content) : null);
  if (warning) toast('Les paramètres de ce projet sont illisibles : les paramètres par défaut sont affichés.');
  const switched = app.current && app.current.repo.full_name !== next.repo.full_name;
  app.current = next;
  // Never the old project's cards under the new name (issue #319): its late answers are dropped. The new one shows
  // at once from this tab's memory, or from what the project list knows, otherwise grey cards (issue #327).
  if (boardInfo().repo !== next.repo.full_name) enterBoard(next.repo.full_name);
  holdForBoard();
  store.set(PROJECT_KEY, app.current.repo.full_name);
  renderProjectList();
  const { config, warnings } = resolveConfig(raw, app.catalog, app.defaults);
  app.current.config = config;
  app.current.saved = JSON.stringify(config);
  for (const w of warnings) console.warn(w);
  $('project-name').textContent = app.current.repo.name;
  $('project-switch-name').textContent = app.current.repo.name;
  // The stack sheet read at the last visit stays until it is read again: the mode shows at once (issue #397).
  app.current.delivery ??= null;
  drawSub();
  drawGap();
  refreshGap(true).catch(() => {});
  const base = app.current.repo.html_url;
  $('new-feature').href = `${base}/issues/new?template=feature.yml`;
  $('new-bug').href = `${base}/issues/new?template=bug.yml`;
  $('issues-link').href = issuesUrl(base);
  $('issues-link').textContent = issuesLinkText(null);
  // Everything under the name starts over at once, before any request (issue #319); the board's grey cards come with renderBoard.
  show('project-view');
  // Another project always opens on « Suivi » (issue #475); a redraw of the same project keeps the tab.
  if (switched) selectTab('board');
  resetChat();
  renderRules();
  loadMachine(app.current).catch(() => {});
  drawRelease();
  const opened = app.current;
  boardFirst().then(() => (app.current === opened ? refreshRelease() : null)).catch(() => {});
  loadDelivery(app.current).catch(() => {});
  updateTrigger(app.current.repo).catch((e) => console.warn('Trigger not checked', e));
  await renderBoard();
  if (!boardInfo().ticking) startLive();
}

// A new panel version is deployed (version.json, written by scripts/stamp-panel.mjs) while this tab still runs the old one:
// reload by itself, as soon as nothing typed would be lost. Checked every minute and when the tab comes back.
const BUILD = document.querySelector('meta[name="build"]')?.content || '';
let toldBuild = null; // the new version the owner was already told about
async function checkVersion() {
  if (!isDeployed(BUILD)) return; // local copy, not a deployed one
  const live = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!live?.build || live.build === BUILD) return;
  // Nothing in flight is lost either: an answer still arriving, images waiting to be sent.
  if (hasUnsaved()) {
    if (toldBuild === live.build) return; // already told for this version
    toldBuild = live.build;
    return toast('Une nouvelle version du panneau est en ligne : elle se chargera dès que vous aurez enregistré.');
  }
  location.reload();
}
let watching = false, retryTimer = null;
function watchVersion() {
  if (watching) return; // start() runs again after each failed attempt and each login: one watcher is enough
  watching = true;
  setInterval(checkVersion, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
}

const fetchJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

async function start() {
  watchVersion();
  try {
    if (!app.catalog) {
      let server;
      [app.catalog, app.defaults, server] = await Promise.all([fetchJson(versioned('catalog.json', BUILD)), fetchJson(versioned('factory.config.json', BUILD)),
        fetch('chat-server.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
      setChatServer(chatServerUrl(server?.url));
    }
    if (!app.token) return show('login');
    const remembered = await recallProjects();
    if (remembered.length && !app.projects.length) {
      app.projects = remembered;
      refreshStable().catch(() => {});
      refreshRuns();
      refreshRunnerAlert().catch(() => {});
      await openProject(store.get(PROJECT_KEY));
      refreshDots();
      return checkProjects();
    }
    const session = app.token;
    const fresh = await loadProjects();
    if (app.token !== session) return; // logged out meanwhile: this list belongs to the previous account
    app.projects = fresh;
  } catch (err) {
    // Only a refused token is forgotten. A flaky mobile network or a GitHub hiccup keeps it.
    if (err.status !== 401) {
      toast('Connexion impossible pour l\'instant. Nouvel essai dans 15 s.');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => start().catch(() => {}), 15_000);
      return;
    }
    resetSession();
    $('login-error').textContent = 'GitHub a refusé le jeton. Vérifiez-le ou créez-en un nouveau.';
    return show('login');
  }
  refreshStable().catch(() => {});
  refreshRuns();
  refreshRunnerAlert().catch(() => {});
  if (!app.projects.length) return show('empty');
  await openProject(store.get(PROJECT_KEY));
  refreshDots(); // after the board: the open project's dot comes from it
}

setupTabs(document.querySelector('.tabs'));
watchNumbers($('app'));
start().catch((err) => toast(errorText(err)));

// Width diagnostic: only when the address asks for it (?largeur), listing what is wider than the screen,
// so the owner can send a screenshot from his phone.
function widthReport() {
  const w = document.documentElement.clientWidth;
  const vv = window.visualViewport;
  const out = [...document.querySelectorAll('body *')]
    .filter((e) => !e.closest('#width-report'))
    .map((e) => [e, e.getBoundingClientRect()])
    .filter(([, r]) => r.width && (r.right > w + 1 || r.left < -1))
    .map(([e, r]) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''} : ${Math.round(r.left)} → ${Math.round(r.right)}`);
  // A page the owner zoomed into is not too wide: only report real overflow at normal zoom.
  const zoomed = vv && Math.abs(vv.scale - 1) > 0.01;
  const wide = !zoomed && (document.documentElement.scrollWidth > w + 1 || out.length > 0);
  return { wide, text: `écran ${w} · fenêtre ${window.innerWidth} · page ${document.documentElement.scrollWidth} · zoom ${vv ? vv.scale.toFixed(2) : '?'}\n${out.slice(0, 30).join('\n') || 'aucun élément ne dépasse'}` };
}
function showWidthReport(force) {
  const { wide, text } = widthReport();
  if (!wide && !force) return;
  document.getElementById('width-report')?.remove();
  document.body.append(el('div', { id: 'width-report', style: 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9;background:#000;color:#fff;border-radius:8px;padding:8px;font:12px/1.4 ui-monospace,monospace' },
    el('p', { style: 'margin:0 0 6px;font-weight:700' }, 'La page est plus large que l\'écran : faites une capture et envoyez-la à Claude.'),
    el('pre', { style: 'margin:0;max-height:35vh;overflow:auto;white-space:pre-wrap' }, text),
    el('button', { type: 'button', style: 'margin-top:6px;background:#fff;color:#000;border:0', onclick: (e) => e.target.parentElement.remove() }, 'Fermer')));
}
if (new URLSearchParams(location.search).has('largeur')) setTimeout(() => showWidthReport(true), 4000);
