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
import { readSettings, onlineRunners, decideMachine, runsOnValue, stuckJobs, alertsFor, repoKey, RUNS_ON_VAR, STATUS_BRANCH } from './lib/runners.mjs';

const REWRITE_MS = 60 * 60_000; // an unchanged status is still rewritten hourly, so the panel shows a recent check
const RERUN_GIVE_UP_MS = 2 * 60 * 60_000;
const STOP_POLLS = 6; // 6 × 10 s for a cancelled run to stop, then force-cancel

// Cancels the runs of a project that wait for (or are held by) a self-hosted runner. Returns their ids.
async function cancelStuck(api, repo, log) {
  const ids = [];
  for (const status of ['queued', 'in_progress', 'waiting', 'pending']) {
    const runs = (await api('GET', `/repos/${repo}/actions/runs?status=${status}&per_page=50`))?.workflow_runs || [];
    for (const run of runs) {
      const jobs = (await api('GET', `/repos/${repo}/actions/runs/${run.id}/jobs?per_page=50`))?.jobs || [];
      if (!stuckJobs(jobs).length) continue;
      await api('POST', `/repos/${repo}/actions/runs/${run.id}/cancel`);
      ids.push({ id: run.id, event: run.event });
      log(`${repo}: run ${run.id} cancelled (stuck on the dev server)`);
    }
  }
  return ids;
}

// Re-runs the cancelled runs that have stopped. A cancelled scheduled tick is not re-run: the next tick does its work.
// Returns those that have not stopped yet, for the next check.
async function rerunStopped(api, repo, pending, { sleep, now, log, polls }) {
  const left = [];
  for (const p of pending) {
    let run = await api('GET', `/repos/${repo}/actions/runs/${p.id}`);
    for (let i = 0; run && run.status !== 'completed' && i < polls; i++) { await sleep(10_000); run = await api('GET', `/repos/${repo}/actions/runs/${p.id}`); }
    if (run && run.status !== 'completed' && polls) {
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
    await api('POST', `/repos/${repo}/actions/runs/${p.id}/rerun-failed-jobs`, {}).catch((e) => log(`${repo}: re-run of ${p.id} refused (${e.message.slice(0, 80)})`));
    log(`${repo}: run ${p.id} re-run on GitHub's machines`);
  }
  return left;
}

const comparable = (s) => JSON.stringify({ ...s, checkedAt: undefined });

// `keyApi`: null without the key, else { repos() -> { ok, status, repos, expires }, request(method, path, body) }.
// `store`: the status branch ({ read(path), write(path, json) }).
export async function checkRunners({ keyApi, store, topic, fetchImpl = fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log }) {
  const settings = readSettings(await store.read('settings.json'));
  const prev = await store.read('status.json');
  const next = { checkedAt: new Date(now()).toISOString(), key: 'missing', general: settings.machine, labels: settings.labels, projects: {} };
  const names = {};
  if (keyApi) {
    const listed = await keyApi.repos();
    next.key = listed.ok ? 'ok' : 'refused';
    if (listed.expires) next.keyExpires = listed.expires;
    if (!listed.ok) log(`key refused by GitHub (${listed.status})`);
    const api = keyApi.request;
    for (const repo of listed.ok ? listed.repos : []) {
      const r = repo.full_name;
      const file = await api('GET', `/repos/${r}/contents/factory.config.json`).catch(() => null);
      if (!file) continue; // not a factory project
      const k = await repoKey(r);
      names[k] = repo.name;
      const was = prev?.projects?.[k] || {};
      const project = parseRawConfig(file.content ? Buffer.from(file.content, 'base64').toString('utf8') : null).raw.machine || 'default';
      let online = 0;
      if (repo.private) {
        try { online = onlineRunners((await api('GET', `/repos/${r}/actions/runners?per_page=100`))?.runners, settings.labels); }
        catch (e) { log(`${r}: runners unreadable (${e.message.slice(0, 80)}), counted offline`); }
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
        } else if (current !== null) {
          await api('DELETE', `/repos/${r}/actions/variables/${RUNS_ON_VAR}`);
          log(`${r}: now on GitHub's machines (${reason})`);
          const cancelled = await cancelStuck(api, r, log);
          rerun = [...rerun, ...cancelled.map((c) => ({ ...c, since: now() }))];
          rerun = await rerunStopped(api, r, rerun, { sleep, now, log, polls: STOP_POLLS });
        }
        if (was.rerun?.length && rerun === was.rerun) rerun = await rerunStopped(api, r, rerun, { sleep, now, log, polls: 0 });
      } catch (e) {
        log(`${r}: could not switch (${e.message.slice(0, 120)})`);
        entry.error = true;
      }
      if (rerun.length) entry.rerun = rerun;
      next.projects[k] = entry;
    }
  }
  const named = { ...next, projects: Object.fromEntries(Object.entries(next.projects).map(([k, p]) => [k, { ...p, name: names[k] }])) };
  const alerts = alertsFor(prev, named, now());
  if (next.keyExpires && (alerts.some((a) => a.includes('expire')) || (prev?.expiryAlerted && prev.keyExpires === next.keyExpires))) next.expiryAlerted = true;
  for (const message of alerts) {
    const sent = await sendAlert({ topic, message, title: 'Factory · serveur de dev', fetchImpl });
    log(`alert ${sent ? 'sent' : 'not sent'}: ${message}`);
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
      if (!res.ok) return { ok: false, status: res.status, repos: [] };
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
function branchStore(gh) {
  const shas = {};
  return {
    async read(path) {
      const file = await gh.getContent(path, STATUS_BRANCH).catch(() => null);
      if (!file) return null;
      shas[path] = file.sha;
      try { return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch { return null; }
    },
    async write(path, value) {
      const text = JSON.stringify(value, null, 2) + '\n';
      if (!(await gh.getBranch(STATUS_BRANCH))) {
        await gh.createOrphanBranch(STATUS_BRANCH, { [path]: text, 'README.md': 'Réglage général et état du serveur de dev, écrits par la factory et le panneau. Ne pas fusionner.\n' });
        return;
      }
      await gh.request('PUT', `/repos/{repo}/contents/${path}`, { message: `chore(factory): ${path}`, content: Buffer.from(text).toString('base64'), branch: STATUS_BRANCH, ...(shas[path] ? { sha: shas[path] } : {}) });
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const key = (process.env.FACTORY_RUNNERS_TOKEN || '').trim();
  const gh = github({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY });
  checkRunners({ keyApi: key ? keyClient(key) : null, store: branchStore(gh), topic: (process.env.NTFY_TOPIC || '').trim() })
    .then(({ status }) => console.log(`key: ${status.key}; projects: ${Object.values(status.projects).map((p) => `${p.machine}/${p.reason}`).join(', ') || 'none'}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
