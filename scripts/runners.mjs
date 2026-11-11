#!/usr/bin/env node
// The 15-minute check of the dev server (workflow runners.yml, in the factory: a public project, so it is free).
// With the owner's key (secret FACTORY_RUNNERS_TOKEN) it reads, for each private project, whether its self-hosted
// runners are connected to GitHub, and sets the project's FACTORY_RUNS_ON variable that every factory job's
// `runs-on` reads (relay.yml, sync.yml): set = the dev server, absent = GitHub's machines. After a switch to GitHub,
// the runs stuck on the dead server are cancelled and re-run. The owner gets a phone alert on each switch, and the
// panel reads the result (status.json on the factory-runners branch). See docs/adr/0001 and docs/serveur-de-dev.md.
import { fileURLToPath } from 'node:url';
import { github } from './lib/github.mjs';
import { parseRawConfig } from './lib/config-core.mjs';
import { sendAlert } from './lib/notify.mjs';
import { readSettings, onlineRunners, decideMachine, runsOnValue, stuckJobs, alertsFor, repoKey, RUNS_ON_VAR, STATUS_BRANCH, EXPIRY_ALERT } from './lib/runners.mjs';

const REWRITE_MS = 60 * 60_000; // an unchanged status is still rewritten hourly, so the panel shows a recent check
const RERUN_GIVE_UP_MS = 2 * 60 * 60_000;
const STOP_POLLS = 6; // 6 × 10 s for a cancelled run to stop, then force-cancel

// The factory is public: its logs are too. A project is named in them by its hash only, never by its name, and
// GitHub's error texts (which carry the repository's path) are never printed, only their HTTP status.
const status = (e) => (e?.rateLimited || /rate limit/i.test(String(e?.message)) ? 'rate-limit' : /-> (\d{3})/.exec(String(e?.message || e))?.[1] || 'network');

// Cancels the runs of a project whose jobs wait for (or are held by) one of its self-hosted runners. Returns their ids.
async function cancelStuck(api, repo, labels, tag, log) {
  const found = new Map();
  for (const st of ['queued', 'in_progress', 'waiting', 'pending']) {
    const runs = (await api('GET', `/repos/${repo}/actions/runs?status=${st}&per_page=100`))?.workflow_runs || [];
    for (const run of runs) {
      if (found.has(run.id)) continue; // moved from queued to in progress between two lists
      const jobs = (await api('GET', `/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`))?.jobs || [];
      if (!stuckJobs(jobs, labels).length) continue;
      await api('POST', `/repos/${repo}/actions/runs/${run.id}/cancel`);
      found.set(run.id, { id: run.id, event: run.event });
      log(`${tag}: run ${run.id} cancelled (stuck on the dev server)`);
    }
  }
  return [...found.values()];
}

// Re-runs the cancelled runs that have stopped. A cancelled scheduled tick is not re-run: the next tick does its work.
// `budget.polls`: the 10-second waits left for this whole check (shared by every project, so the job ends in time).
// Returns those that have not stopped yet, for the next check.
async function rerunStopped(api, repo, pending, { sleep, now, log, budget, tag }) {
  const left = [];
  for (const p of pending) {
    let run = await api('GET', `/repos/${repo}/actions/runs/${p.id}`);
    let waited = false;
    for (let i = 0; run && run.status !== 'completed' && i < STOP_POLLS && budget.polls > 0; i++) {
      budget.polls--;
      waited = true;
      await sleep(10_000);
      run = await api('GET', `/repos/${repo}/actions/runs/${p.id}`);
    }
    // Force-cancelled only after a wait: a fresh cancel with no budget left waits for the next check instead.
    if (run && run.status !== 'completed' && (waited || (p.since && now() - p.since >= 60_000))) {
      await api('POST', `/repos/${repo}/actions/runs/${p.id}/force-cancel`).catch(() => {});
      run = await api('GET', `/repos/${repo}/actions/runs/${p.id}`);
    }
    if (!run) continue;
    if (run.status !== 'completed') {
      const since = p.since || now();
      if (now() - since < RERUN_GIVE_UP_MS) left.push({ id: p.id, event: p.event, since });
      continue;
    }
    if (p.event === 'schedule') continue;
    try {
      await api('POST', `/repos/${repo}/actions/runs/${p.id}/rerun-failed-jobs`, {});
      log(`${tag}: run ${p.id} re-run`);
    } catch (e) { log(`${tag}: re-run of ${p.id} refused (${status(e)})`); }
  }
  return left;
}

const comparable = (s) => JSON.stringify({ ...s, checkedAt: undefined });
const parseLabels = (value) => { try { const l = JSON.parse(value); return Array.isArray(l) && l.length ? l : null; } catch { return null; } };

// `keyApi`: null without the key, else { repos() -> { ok, status, repos, expires }, request(method, path, body) }.
// `store`: the status branch ({ read(path), write(path, json) }). Returns { status, alerts }; status null when GitHub
// did not answer (nothing is changed then: the next check tries again).
export async function checkRunners({ keyApi, store, topic, fetchImpl = fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log }) {
  const settings = readSettings(await store.read('settings.json'));
  const prev = await store.read('status.json');
  const next = { checkedAt: new Date(now()).toISOString(), key: 'missing', general: settings.machine, labels: settings.labels, projects: {} };
  const names = {};
  const budget = { polls: 3 * STOP_POLLS };
  if (keyApi) {
    const listed = await keyApi.repos();
    if (!listed.ok && ![401, 403].includes(listed.status)) {
      log(`GitHub did not answer (${listed.status}): nothing changed, next check in 15 minutes`);
      return { status: null, alerts: [] };
    }
    next.key = listed.ok ? 'ok' : 'refused';
    if (listed.expires) next.keyExpires = listed.expires;
    if (!listed.ok) log(`key refused by GitHub (${listed.status})`);
    const api = keyApi.request;
    for (const repo of listed.ok ? listed.repos : []) {
      const r = repo.full_name;
      const k = await repoKey(String(repo.id));
      const was = prev?.projects?.[k] || {};
      let file;
      try { file = await api('GET', `/repos/${r}/contents/factory.config.json`); }
      catch (e) {
        log(`${k}: rules unreadable (${status(e)}), left as they were`);
        if (prev?.projects?.[k]) next.projects[k] = { ...was, error: true };
        continue;
      }
      if (!file) continue; // not a factory project
      names[k] = repo.name;
      const project = parseRawConfig(file.content ? Buffer.from(file.content, 'base64').toString('utf8') : null).raw.machine || 'default';
      let online = 0;
      if (repo.private) {
        try { online = onlineRunners((await api('GET', `/repos/${r}/actions/runners?per_page=100`))?.runners, settings.labels); }
        catch (e) {
          // GitHub having a hiccup says nothing about the server: switching would cancel the work running on it.
          const code = status(e);
          if (code === 'network' || code === 'rate-limit' || Number(code) >= 500) {
            log(`${k}: runners unreadable (${code}), left as they were`);
            if (prev?.projects?.[k]) next.projects[k] = { ...was, unread: true };
            continue;
          }
          log(`${k}: runners unreadable (${code}), counted offline`);
        }
      }
      const { machine, reason } = decideMachine({ isPrivate: Boolean(repo.private), project, general: settings.machine, key: 'ok', online });
      const entry = { machine, reason, online, since: was.machine === machine ? (was.since || next.checkedAt) : next.checkedAt };
      let rerun = was.rerun || [];
      try {
        const current = (await api('GET', `/repos/${r}/actions/variables/${RUNS_ON_VAR}`))?.value ?? null;
        if (machine === 'dev-server') {
          const value = runsOnValue(settings.labels);
          if (current === null) await api('POST', `/repos/${r}/actions/variables`, { name: RUNS_ON_VAR, value });
          else if (current !== value) await api('PATCH', `/repos/${r}/actions/variables/${RUNS_ON_VAR}`, { name: RUNS_ON_VAR, value });
        } else if (current !== null || was.machine === 'dev-server' || was.error) {
          // Also when the last check stopped halfway through the switch: the stuck runs are looked for again.
          if (current !== null) await api('DELETE', `/repos/${r}/actions/variables/${RUNS_ON_VAR}`);
          log(`${k}: now on GitHub's machines (${reason})`);
          const cancelled = await cancelStuck(api, r, (current && parseLabels(current)) || settings.labels, k, log);
          const known = new Set(rerun.map((x) => x.id));
          rerun = [...rerun, ...cancelled.filter((c) => !known.has(c.id)).map((c) => ({ ...c, since: now() }))];
        }
        if (rerun.length) rerun = await rerunStopped(api, r, rerun, { sleep, now, log, budget, tag: k });
      } catch (e) {
        // A public project the key does not cover (the guide selects the private ones only): the factory never set a
        // variable there, so there is nothing to switch and nothing to warn the owner about.
        if (!repo.private && ['403', '404'].includes(status(e)) && was.machine !== 'dev-server') {
          rerun = [];
        } else {
          log(`${k}: could not switch (${status(e)}), tried again at the next check`);
          entry.error = true;
        }
      }
      if (rerun.length) entry.rerun = rerun;
      next.projects[k] = entry;
    }
  }
  // Without a working key nothing can be moved: each project stays where the last check left it, and the panel says
  // the automatic backup is off for those left on the server.
  if (next.key !== 'ok') {
    for (const [k, p] of Object.entries(prev?.projects || {})) if (p.machine === 'dev-server' || p.stale) next.projects[k] = { ...p, stale: true };
  }
  const named = { ...next, projects: Object.fromEntries(Object.entries(next.projects).map(([k, p]) => [k, { ...p, name: names[k] || 'un projet' }])) };
  const alerts = alertsFor(prev, named, now());
  const expiryAlert = alerts.some((a) => a.startsWith(EXPIRY_ALERT));
  if (next.keyExpires && (expiryAlert || (prev?.expiryAlerted && prev.keyExpires === next.keyExpires))) next.expiryAlerted = true;
  for (const message of alerts) {
    const sent = await sendAlert({ topic, message, title: 'Factory · serveur de dev', fetchImpl });
    log(`alert ${sent ? 'sent' : 'not sent'}`);
  }
  const stale = !prev?.checkedAt || now() - Date.parse(prev.checkedAt) >= REWRITE_MS;
  if (!prev || stale || comparable(prev) !== comparable(next)) await store.write('status.json', next);
  return { status: next, alerts };
}

// The owner's key: lists the repositories it can see, and reads its expiry date from GitHub's answer.
function keyClient(token, fetchImpl = fetch) {
  const gh = github({ token, repo: '' });
  const request = (method, path, body) => gh.request(method, path, body);
  async function repos() {
    const out = [];
    let expires = null;
    for (let page = 1; page <= 10; page++) {
      const res = await fetchImpl(`https://api.github.com/user/repos?affiliation=owner&per_page=100&page=${page}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
      });
      // A 403 of the rate limit is not a refused key.
      if (!res.ok) return { ok: false, status: res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.get('retry-after')) ? 429 : res.status, repos: [] };
      const exp = res.headers.get('github-authentication-token-expiration');
      if (exp) { const t = Date.parse(exp.replace(' UTC', 'Z').replace(' ', 'T')); if (!Number.isNaN(t)) expires = new Date(t).toISOString(); }
      const batch = await res.json();
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return { ok: true, status: 200, repos: out, expires };
  }
  return { repos, request };
}

// The status branch of the factory, through its own GITHUB_TOKEN. Created on first use.
export function branchStore(gh) {
  const shas = {};
  return {
    async read(path) {
      const file = await gh.getContent(path, STATUS_BRANCH); // null when missing; any other error stops the check
      if (!file) return null;
      shas[path] = file.sha;
      try { return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch { return null; }
    },
    async write(path, value) {
      const text = JSON.stringify(value, null, 2) + '\n';
      if (!(await gh.getBranch(STATUS_BRANCH))) {
        try {
          await gh.createOrphanBranch(STATUS_BRANCH, { [path]: text, 'README.md': 'Réglage général et état du serveur de dev, écrits par la factory et le panneau. Ne pas fusionner.\n' });
          return;
        } catch (e) { if (!/422/.test(String(e))) throw e; } // the panel created it meanwhile
      }
      await gh.request('PUT', `/repos/{repo}/contents/${path}`, { message: `chore(factory): ${path}`, content: Buffer.from(text).toString('base64'), branch: STATUS_BRANCH, ...(shas[path] ? { sha: shas[path] } : {}) });
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const key = (process.env.FACTORY_RUNNERS_TOKEN || '').trim();
  const gh = github({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY });
  checkRunners({ keyApi: key ? keyClient(key) : null, store: branchStore(gh), topic: (process.env.NTFY_TOPIC || '').trim() })
    .then(({ status: s }) => console.log(s ? `key: ${s.key}; projects: ${Object.values(s.projects).map((p) => `${p.machine}/${p.reason}`).join(', ') || 'none'}` : 'not checked'))
    .catch((e) => { console.error(e); process.exit(1); });
}
